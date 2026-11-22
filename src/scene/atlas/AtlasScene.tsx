/**
 * Explorador do corpo: uma vista recortada no slot da página, câmera em órbita amortecida, camadas, isolar/ocultar/
 * fantasma, vista explodida, plano de corte e demonstração de ação (o esqueleto percorre a faixa, o músculo muda de
 * comprimento, volume e cor). Todo o estado vem de `useAtlas` (sem three.js); aqui só se aplica.
 */
import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { PerspectiveCamera as PerspCam } from 'three';
import { muscleDefs, skeletonDef } from '@/data';
import { forwardKinematics, pointToWorld } from '@/engine/kinematics/fk';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { Angles, Pose } from '@/engine/kinematics/types';
import { DEG, type Vec3 } from '@/engine/math/vec';
import { EXPLODE_SPACING } from '@/features/home/timeline';
import { advanceDemo, DEMO_ENTER_SECONDS, demoAngle, demoPhaseOf, enterEase, strainOf } from '@/features/atlas/explorer/demo';
import { BODY_BOX, dampOrbit, fitDistance, FOV_DEG, orbitPosition, orbitsClose, screenAxes, type Orbit } from '@/features/atlas/explorer/orbit';
import { keyOf, LAYER_ORDER, samePick, useAtlas, type BodyLayerId, type DemoSpec, type LayerMode, type Pick, type StructureInfo } from '@/features/atlas/store';
import { ContactShadow } from '../body/ContactShadow';
import type { BodyInstance } from '../body/instance';
import { layerOf, mergeBoxes, type Box, type BodyModel } from '../body/model';
import { footContacts, STANDING } from '../body/poses';
import { pulse } from '../body/rig';
import { useBodyInstance, useBodyModel } from '../body/useBody';
import { radToDeg, restRoot, STANDING_DEG, StageView, useDirector } from '../director/StageView';
import { useStage } from '../stageStore';

const sk = buildSkeleton(skeletonDef);
const standing = forwardKinematics(sk, STANDING);
const restTf = restRoot(sk);
/** Destaque do resto do músculo quando uma parte está selecionada. */
const PART_CONTEXT = 0.3;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const HOVER = 0.4;
/** Opacidade do fantasma por camada (pele: alfa da mistura). */
const GHOST: Record<BodyLayerId, number> = { skin: 0.22, superficial: 0.14, deep: 0.14, bone: 0.2 };
const CUT_GHOST = 0.05;
/** Faixa de cada eixo de corte (m), na ordem do controle 0..1, e a normal (o lado positivo some). */
const CUTS = {
  transverse: { n: [0, 1, 0] as Vec3, lo: 1.85, hi: -0.02 },
  frontal: { n: [0, 0, 1] as Vec3, lo: 0.2, hi: -0.2 },
  // O lado direito do sujeito (−X) sai primeiro.
  sagittal: { n: [-1, 0, 0] as Vec3, lo: 0.35, hi: -0.35 },
} as const;

/** Posição de cada camada na vista explodida: só as visíveis abrem, centradas (em unidades de espaçamento). */
function spreadSlots(layers: Record<BodyLayerId, LayerMode>): Record<BodyLayerId, number> {
  const shown = LAYER_ORDER.filter((l) => layers[l] !== 'off');
  const mid = (shown.length - 1) / 2;
  return Object.fromEntries(LAYER_ORDER.map((l) => [l, shown.includes(l) ? shown.indexOf(l) - mid : 0])) as Record<BodyLayerId, number>;
}

/** Músculos com mais de uma parte: o toque escolhe a parte (deltoide anterior, não o deltoide inteiro). */
const MULTI_PART = new Set(muscleDefs.filter((m) => m.parts.length > 1).map((m) => m.id));

const keySlots = (model: BodyModel, p: { kind: string; id: string; part?: string | undefined }): readonly number[] =>
  p.kind === 'muscle'
    ? ((p.part ? model.byPart.get(p.part) : model.byMuscle.get(p.id)) ?? [])
    : model.slots.filter((s) => s.anatomyId === p.id).map((s) => s.index);

function parseKey(k: string): { kind: string; id: string; part?: string } {
  const i = k.indexOf(':');
  const rest = k.slice(i + 1);
  const j = rest.indexOf('/');
  return j < 0 ? { kind: k.slice(0, i), id: rest } : { kind: k.slice(0, i), id: rest.slice(0, j), part: rest.slice(j + 1) };
}

export function structuresOf(model: BodyModel): StructureInfo[] {
  return model.pack.parts.map((p) => {
    const muscleId = model.slots.find((s) => s.anatomyId === p.id)?.muscleId;
    return {
      id: p.id,
      kind: p.kind,
      layer: layerOf(p),
      source: (p.objects[0] ?? p.id).replace(/\.[rl]$/, ''),
      ...(muscleId && { muscleId }),
    };
  });
}

/** Caixa que enquadra a seleção: lado tocado, com contexto em volta. */
function selectionBox(body: BodyInstance, model: BodyModel, sel: Pick): Box | null {
  const all = keySlots(model, sel);
  const side = all.filter((i) => model.slots[i]?.side === sel.side || model.slots[i]?.side === 'c');
  const box = body.posedBox(side.length ? side : all);
  if (!box) return null;
  const s = box.size;
  const h = Math.max(0.42, s[1] * 1.5);
  return { center: box.center, size: [Math.max(0.3, s[0] * 1.5), h, Math.max(0.25, s[2] * 1.4)] };
}

function ExplorerBody() {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const camRef = useRef<PerspCam>(null);
  const dir = useDirector();
  const slot = useAtlas((s) => s.slot);
  const { model } = useBodyModel();
  const body = useBodyInstance(model, 'main');
  /** O que a cena desenharia sem o voo: graus da pose e a pele (o diretor mistura com o plano de saída). */
  const ownDeg = useRef<Readonly<Record<string, number>>>(STANDING_DEG);
  const ownSkin = useRef({ visible: true, alpha: 1 });
  const reapply = useRef<(() => void) | null>(null);

  /** Órbita desenhada (amortecida até a meta do store). */
  const cur = useRef<Orbit>(useAtlas.getState().orbit);
  /** Comprimento de cada vaga em pé (base da cor de deformação). */
  const rest = useRef<Float32Array | null>(null);
  const explode = useRef(0);
  /** Eixo lateral em que as camadas abrem (fixo enquanto abertas; segue a vista pedida). */
  const spreadAxis = useRef<Vec3>([1, 0, 0]);
  const feet = useRef<Vec3[]>(footContacts(sk, standing));
  const getFeet = useMemo(() => () => {
    const e = explode.current;
    if (e < 0.01) return feet.current;
    const a = spreadAxis.current;
    const slots = spreadSlots(useAtlas.getState().layers);
    return LAYER_ORDER.flatMap((l) => feet.current.filter((_, i) => i % 2 === 0).map((f): Vec3 => [f[0] + a[0] * slots[l] * EXPLODE_SPACING * e, 0, f[2] + a[2] * slots[l] * EXPLODE_SPACING * e]));
  }, []);
  const demoSpec = useRef<string | null>(null);
  /** Entrada da demonstração (0 = em pé, 1 = na pose da ação) e a demonstração a que ela se refere. */
  const enter = useRef(1);
  const enterKey = useRef<string | null>(null);

  // Corpo pronto: pose em pé, comprimentos de base, lista de estruturas para a busca.
  useEffect(() => {
    if (!body || !model) return;
    body.setPose(sk, standing);
    rest.current = body.lengths.slice();
    useAtlas.getState().setStructures(structuresOf(model));
    useStage.getState().setReady(true);
    invalidate();
    // Troca de página entre duas vistas do Atlas: o slot muda, o corpo fica; o palco precisa voltar a "pronto".
  }, [body, model, invalidate, slot]);

  // Estado visual (camadas, seleção, ocultos…): reaplica quando algo relevante muda.
  useEffect(() => {
    if (!body || !model) return;
    let last: unknown[] = [];
    const apply = (force = false) => {
      const st = useAtlas.getState();
      const sig = [st.layers, st.hidden, st.ghosted, st.isolate, st.selection, st.hover, st.exploded, st.cut.axis, st.demo.spec];
      if (!force && sig.every((v, i) => v === last[i])) return;
      last = sig;
      const { layers, selection, hover, demo, exploded } = st;
      body.fill('highlight', 0);
      body.fill('opacity', 1);
      body.fill('hidden', 0);
      if (!demo.spec) body.fill('strain', 0);
      const sel = selection ? keySlots(model, selection) : [];
      const selLayers = new Set(sel.map((i) => model.slots[i]?.layer));
      const inner = Math.min(...LAYER_ORDER.map((l, i) => (selLayers.has(l) ? i : 99)));
      let skinAlpha = layers.skin === 'on' ? 1 : GHOST.skin;
      for (const l of LAYER_ORDER) {
        body.layer(l, { visible: layers[l] !== 'off' || selLayers.has(l) });
        if (layers[l] === 'off' && selLayers.has(l)) body.fillLayer(l, 'hidden', 1);
        if (l !== 'skin' && layers[l] === 'ghost') body.fillLayer(l, 'opacity', GHOST[l]);
      }
      // Raio X: as camadas por fora da seleção viram fantasma para ela aparecer (com as camadas juntas).
      if (sel.length && !exploded) {
        LAYER_ORDER.forEach((l, i) => {
          if (i >= inner || layers[l] !== 'on') return;
          if (l === 'skin') skinAlpha = GHOST.skin;
          else body.fillLayer(l, 'opacity', GHOST[l]);
        });
      }
      // Fáscias e aponeuroses (trato iliotibial, fáscia toracolombar…) cobrem o ventre: com um músculo em foco, viram vulto.
      if (selection?.kind === 'muscle') for (const sl of model.slots) if (sl.kind === 'tendon') body.set(sl.index, 'opacity', GHOST.superficial);
      body.layer('skin', { alpha: skinAlpha });
      ownSkin.current = { visible: layers.skin !== 'off', alpha: skinAlpha };
      for (const k of st.ghosted) body.fill('opacity', GHOST.superficial, keySlots(model, parseKey(k)));
      for (const k of st.hidden) body.fill('hidden', 1, keySlots(model, parseKey(k)));
      if (st.isolate && sel.length) {
        const keep = new Set(sel);
        for (const s of model.slots) {
          if (keep.has(s.index)) continue;
          if (s.layer === 'bone') body.set(s.index, 'opacity', GHOST.bone);
          else body.set(s.index, 'hidden', 1);
        }
        body.layer('bone', { visible: true });
      }
      if (hover && !samePick(hover, selection)) body.fill('highlight', HOVER, keySlots(model, hover));
      if (selection) {
        const k = keyOf(selection);
        // Parte em foco: o resto do músculo fica aceso de leve, como contexto.
        if (selection.part && !demo.spec) body.fill('highlight', PART_CONTEXT, keySlots(model, { ...selection, part: undefined }));
        body.fill('highlight', demo.spec ? 0.1 : 1, sel);
        if (!st.hidden.includes(k)) body.fill('hidden', 0, sel);
        if (!st.ghosted.includes(k)) body.fill('opacity', 1, sel);
      }
      // Pele intacta e opaca: o que está embaixo não precisa desenhar (e não fura a pele onde encosta).
      const sealed = layers.skin === 'on' && skinAlpha >= 1 && !exploded && st.cut.axis === 'none';
      for (const l of ['superficial', 'deep', 'bone'] as const) body.layer(l, { showAbove: sealed ? 99 : -99 });
      body.commit();
      invalidate();
    };
    apply();
    reapply.current = () => apply(true);
    return useAtlas.subscribe(() => apply());
  }, [body, model, invalidate]);

  // Seleção nova: o brilho percorre a fibra.
  useEffect(
    () =>
      useAtlas.subscribe((s, p) => {
        if (s.selection && !samePick(s.selection, p.selection)) pulse();
      }),
    [],
  );

  // Seleção pelo slot da página (o canvas fixo não recebe ponteiro).
  useEffect(() => {
    if (!body || !model) return;
    useAtlas.getState().setPick((x, y) => {
      const cam = camRef.current;
      if (!cam) return null;
      const i = body.pick(gl, cam, x, y, dir.rect.w, dir.rect.h);
      const s = i === null ? undefined : model.slots[i];
      if (!s) return null;
      if (!s.muscleId) return { kind: 'part', id: s.anatomyId, side: s.side };
      return { kind: 'muscle', id: s.muscleId, side: s.side, ...(MULTI_PART.has(s.muscleId) && s.musclePartId && { part: s.musclePartId }) };
    });
    return () => useAtlas.getState().setPick(null);
  }, [body, model, gl, dir]);

  // Pedido de voo: enquadra a seleção (ou o corpo) e escreve a nova meta.
  useEffect(() => {
    if (!body || !model) return;
    const run = () => {
      const st = useAtlas.getState();
      // Enquadra pelo slot da página (o procurador pode estar no meio do voo).
      const rect = (slot ?? dir.frame).getBoundingClientRect();
      const aspect = rect.width / Math.max(1, rect.height);
      const yaw = st.fly.yaw ?? st.orbit.yaw;
      const ex = st.exploded;
      if (st.fly.yaw !== null || !ex) {
        const { right } = screenAxes({ ...st.orbit, yaw });
        spreadAxis.current = right;
      }
      let box: Box | null = null;
      if (st.selection) {
        box = selectionBox(body, model, st.selection);
        if (box && st.demo.spec) box = demoBox(body, model, st.selection, st.demo.spec) ?? box;
        if (box && ex) {
          const l = model.slots[keySlots(model, st.selection)[0] ?? -1]?.layer ?? 'deep';
          const o = spreadSlots(st.layers)[l] * EXPLODE_SPACING;
          const a = spreadAxis.current;
          box = { center: [box.center[0] + a[0] * o, box.center[1], box.center[2] + a[2] * o], size: box.size };
        }
      }
      let dist: number;
      if (box) dist = fitDistance(box.size, yaw, aspect);
      else {
        box = BODY_BOX;
        dist = ex ? fitDistance([BODY_BOX.size[0] + Math.max(0, LAYER_ORDER.filter((l) => st.layers[l] !== 'off').length - 1) * EXPLODE_SPACING, BODY_BOX.size[1], BODY_BOX.size[2]], 0, aspect, 1.08) : fitDistance(BODY_BOX.size, yaw, aspect, 1.06);
      }
      const goal: Orbit = { yaw, pitch: st.orbit.pitch, dist, target: box.center };
      st.setOrbit(goal);
      if (st.fly.instant || reduceMotion()) cur.current = useAtlas.getState().orbit;
      invalidate();
    };
    run();
    return useAtlas.subscribe((s, p) => {
      if (s.fly.nonce !== p.fly.nonce) run();
    });
  }, [body, model, slot, dir, invalidate]);

  const clock = useRef(0);
  useFrame(() => {
    const cam = camRef.current;
    if (!cam || !body || !model) return;
    // Relógio de parede: a demonstração anda no tempo certo mesmo com poucos quadros por segundo.
    const now = performance.now() / 1000;
    // Depois de um tempo parado (sem quadro pedido) o primeiro passo é curto, para nada saltar.
    const gap = now - clock.current;
    const dt = gap > 0 && gap < 0.5 ? gap : 1 / 60;
    clock.current = now;
    const st = useAtlas.getState();
    const reduce = reduceMotion();

    // ---- Demonstração: pose, deformação e cor ----
    const spec = st.demo.spec;
    const specKey = spec ? `${spec.key}|${keyOf(st.selection ?? { kind: 'part', id: '-', side: 'c' })}` : null;
    if (specKey !== enterKey.current) {
      enterKey.current = specKey;
      enter.current = reduce || !spec ? 1 : 0;
    }
    if (spec && enter.current < 1) enter.current = Math.min(1, enter.current + dt / DEMO_ENTER_SECONDS);
    if (spec || demoSpec.current !== specKey) {
      let phase = st.demo.phase;
      // Na entrada o ciclo espera: a pose sai de em pé e chega à ponta alongada antes de andar.
      if (spec && st.demo.playing && enter.current >= 1) {
        const r = advanceDemo(phase, dt, st.demo.speed, st.demo.loop);
        phase = r.phase;
        st.setDemo(r.done ? { phase, playing: false } : { phase });
      }
      const angles = spec ? demoAngles(spec, phase, enterEase(enter.current)) : null;
      ownDeg.current = angles ? radToDeg(angles) : STANDING_DEG;
      const pose: Pose = angles ? forwardKinematics(sk, angles) : standing;
      body.setPose(sk, pose);
      feet.current = footContacts(sk, pose);
      const base = rest.current;
      if (spec && st.selection && base) {
        for (const i of keySlots(model, st.selection)) body.set(i, 'strain', strainOf(body.lengths[i] ?? 0, base[i] ?? 0));
      } else body.fill('strain', 0);
      body.commit();
      demoSpec.current = specKey;
      if (spec && (st.demo.playing || enter.current < 1)) invalidate();
    }

    // ---- Troca de rota: pose e pele misturam com o plano de saída; no pouso, o visual da cena volta inteiro ----
    const bp = dir.pose(sk, ownDeg.current, restTf);
    if (bp) body.setPose(sk, bp);
    dir.skin(body, ownSkin.current.visible, ownSkin.current.alpha);
    if (dir.landed) reapply.current?.();

    // ---- Vista explodida ----
    const goalE = st.exploded ? 1 : 0;
    explode.current = reduce ? goalE : explode.current + (goalE - explode.current) * (1 - Math.exp(-dt * 5));
    if (Math.abs(goalE - explode.current) < 1e-3) explode.current = goalE;
    else invalidate();
    const e = explode.current;
    const a = spreadAxis.current;
    const cut = st.cut.axis === 'none' ? null : CUTS[st.cut.axis];
    const spread = spreadSlots(st.layers);
    for (const l of LAYER_ORDER) {
      const o = spread[l] * EXPLODE_SPACING * e;
      body.meshes[l].position.set(a[0] * o, 0, a[2] * o);
      if (cut) {
        // O plano acompanha a camada aberta.
        const d = cut.lo + (cut.hi - cut.lo) * st.cut.at + (cut.n[0] * a[0] + cut.n[2] * a[2]) * o;
        body.layer(l, { cut: d, cutNormal: cut.n, ghost: CUT_GHOST });
      } else body.layer(l, { cut: 99, cutNormal: [0, 1, 0], ghost: 0 });
    }

    // ---- Câmera ----
    const goal = st.orbit;
    cur.current = reduce ? goal : dampOrbit(cur.current, goal, 1 - Math.exp(-dt * 6));
    if (orbitsClose(cur.current, goal)) cur.current = goal;
    else invalidate();
    const drawn = dir.camera(cam, orbitPosition(cur.current), cur.current.target);
    cam.aspect = dir.rect.w / dir.rect.h;
    cam.near = Math.max(0.02, Math.min(drawn, cur.current.dist) * 0.05);
    cam.far = Math.max(drawn, cur.current.dist) + 12;
    cam.updateProjectionMatrix();
  });

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault manual fov={FOV_DEG} near={0.05} far={30} position={[0, 1, 4]} />
      {body && <ContactShadow feet={getFeet} />}
      {body && <primitive object={body.group} />}
    </>
  );
}

/** Ângulos da demonstração na fase dada; `k` mistura da pose em pé (0) até a da ação (1). */
function demoAngles(spec: DemoSpec, phase: number, k: number): Angles {
  const goal: Record<string, number> = { ...STANDING };
  for (const [d, v] of Object.entries(spec.base)) goal[d] = v * DEG;
  goal[spec.dof] = demoAngle(spec.from, spec.to, phase) * DEG;
  if (k >= 1) return goal;
  const out: Record<string, number> = {};
  for (const d of new Set([...Object.keys(STANDING), ...Object.keys(goal)])) {
    const a = STANDING[d] ?? 0;
    out[d] = a + ((goal[d] ?? 0) - a) * k;
  }
  return out;
}

/** Caixa que contém o músculo nas duas pontas da faixa e em pé (a câmera não perde o membro que se move). */
function demoBox(body: BodyInstance, model: BodyModel, sel: Pick, spec: DemoSpec): Box | null {
  const boxes: Box[] = [];
  const side = keySlots(model, sel).filter((i) => model.slots[i]?.side !== 'l');
  // O segmento que a articulação move e os que vêm depois dele (a perna inteira na flexão do joelho).
  const owner = sk.segments.find((g) => g.dofs.some((d) => d.id === spec.dof));
  const moved = new Set(owner ? [owner.id] : []);
  for (const g of sk.segments) if (g.parent && moved.has(g.parent)) moved.add(g.id);
  for (const deg of [spec.range[0], 0, spec.range[1]]) {
    const pose = forwardKinematics(sk, demoAngles(spec, demoPhaseOf(spec.from, spec.to, deg), 1));
    body.setPose(sk, pose);
    const b = body.posedBox(side);
    if (b) boxes.push(b);
    for (const g of sk.segments) {
      if (!moved.has(g.id)) continue;
      for (const q of [pointToWorld(pose, g.id, [0, 0, 0]), pointToWorld(pose, g.id, g.tip)]) boxes.push({ center: q, size: [0.08, 0.08, 0.08] });
    }
  }
  body.setPose(sk, standing);
  const m = mergeBoxes(boxes);
  if (!m) return null;
  return { center: m.center, size: [Math.max(0.4, m.size[0] * 1.15), Math.max(0.5, m.size[1] * 1.15), Math.max(0.4, m.size[2] * 1.15)] };
}

/** Uma vista recortada no retângulo do slot da página (o canvas fixo desenha por cima). */
export function AtlasScene() {
  const slot = useAtlas((s) => s.slot);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const unsub = useAtlas.subscribe(() => invalidate());
    const onMove = () => invalidate();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const ro = new ResizeObserver(onMove);
    if (slot) ro.observe(slot);
    return () => {
      unsub();
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      ro.disconnect();
      useStage.getState().setReady(false);
    };
  }, [invalidate, slot]);

  if (!slot) return null;
  return (
    <StageView slot={slot} index={1} main>
      <ExplorerBody />
    </StageView>
  );
}
