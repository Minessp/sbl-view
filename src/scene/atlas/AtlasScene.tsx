/**
 * Explorador do corpo: uma vista recortada no slot da página, câmera em órbita amortecida, camadas, isolar/ocultar/
 * fantasma, vista explodida, plano de corte e demonstração de ação (o esqueleto percorre a faixa, o músculo muda de
 * comprimento, volume e cor). Todo o estado vem de `useAtlas` (sem three.js); aqui só se aplica.
 */
import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3, type PerspectiveCamera as PerspCam } from 'three';
import { muscleDefs, skeletonDef } from '@/data';
import { forwardKinematics, pointToWorld } from '@/engine/kinematics/fk';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { Angles, Pose } from '@/engine/kinematics/types';
import { DEG, type Vec3 } from '@/engine/math/vec';
import { EXPLODE_SPACING } from '@/features/home/timeline';
import { advanceDemo, DEMO_ENTER_SECONDS, demoAngle, demoPhaseOf, enterEase, strainOf } from '@/features/atlas/explorer/demo';
import { BODY_BOX, dampOrbit, fitDistance, FOV_DEG, orbitPosition, orbitsClose, screenAxes, type Orbit } from '@/features/atlas/explorer/orbit';
import { keyOf, LAYER_ORDER, samePick, useAtlas, useLabelFeed, type BodyLayerId, type DemoSpec, type LabelFeedItem, type LayerMode, type Pick, type StructureInfo } from '@/features/atlas/store';
import { choose, HOLD_MS, settle, type Hold, type LabelCandidate } from '@/features/atlas/explorer/labels';
import { REGIONS } from '@/features/library/catalog';
import type { BodyInstance } from '../body/instance';
import { layerOf, mergeBoxes, type Box, type BodyModel } from '../body/model';
import { STANDING } from '../body/poses';
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
/** Alavanca de descascar: a frente desce do alto da cabeça ao chão (m). */
const PEEL_TOP = 1.86;
const PEEL_SPAN = 1.88;
/** Margem do corpo inteiro no quadro: 1 / 1,16 ≈ 86% da altura. */
const BODY_MARGIN = 1.16;
/** Grade do passe de seleção dos rótulos (células na largura). */
const LABEL_GRID = 120;
const LABEL_EVERY = 0.25;
const PROJ = new Vector3();
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
      const sig = [st.layers, st.hidden, st.ghosted, st.isolate, st.selection, st.hover, st.exploded, st.cut.axis, st.demo.spec, peelFrac(st.peel) > 0];
      if (!force && sig.every((v, i) => v === last[i])) return;
      last = sig;
      const { layers, selection, hover, demo, exploded } = st;
      body.fill('highlight', 0);
      body.fill('opacity', 1);
      body.fill('hidden', 0);
      if (!demo.spec) body.fill('strain', 0);
      body.fill('ends', 0);
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
        if (selection.kind === 'muscle' && !demo.spec) body.fill('ends', 1, sel);
        if (!st.hidden.includes(k)) body.fill('hidden', 0, sel);
        if (!st.ghosted.includes(k)) body.fill('opacity', 1, sel);
      }
      // Pele intacta e opaca: o que está embaixo não precisa desenhar (e não fura a pele onde encosta).
      const sealed = layers.skin === 'on' && skinAlpha >= 1 && !exploded && st.cut.axis === 'none' && peelFrac(st.peel) === 0;
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
      // Com o corpo deslocado, sobra menos largura para enquadrar.
      const aspect = (rect.width / Math.max(1, rect.height)) * (1 - 2 * Math.abs(st.shift));
      const yaw = st.fly.yaw ?? st.orbit.yaw;
      const ex = st.exploded;
      if (st.fly.yaw !== null || !ex) {
        const { right } = screenAxes({ ...st.orbit, yaw });
        spreadAxis.current = right;
      }
      let box: Box | null = null;
      const to = st.fly.to;
      if (to && 'region' in to) {
        const groups = new Set(REGIONS.find((r) => r.id === to.region)?.groups ?? []);
        const slots = muscleDefs.filter((m) => groups.has(m.group)).flatMap((m) => model.byMuscle.get(m.id) ?? []);
        const b = body.posedBox(slots);
        if (b) box = { center: b.center, size: [b.size[0] * 1.05, b.size[1] * 1.08, b.size[2]] };
      } else if (to && st.selection) {
        const i = endSlot(model, st.selection);
        const q: [number, number, number] = [0, 0, 0];
        if (i !== null && body.linePoint(i, to.end === 'origin' ? 0 : 15, q)) box = { center: q, size: [0.2, 0.2, 0.2] };
      } else if (st.selection) {
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
      // shortcut: ponta e região não levam o deslocamento da vista explodida; com as camadas abertas o voo erra um pouco.
      if (box) dist = fitDistance(box.size, yaw, aspect);
      else {
        box = BODY_BOX;
        dist = ex ? fitDistance([BODY_BOX.size[0] + Math.max(0, LAYER_ORDER.filter((l) => st.layers[l] !== 'off').length - 1) * EXPLODE_SPACING, BODY_BOX.size[1], BODY_BOX.size[2]], 0, aspect, 1.08) : fitDistance(BODY_BOX.size, yaw, aspect, BODY_MARGIN);
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

  /** Rótulos vivos: histerese, ponto 3D de cada rótulo mostrado, última medida e se a vista mudou desde ela. */
  const labels = useRef({
    mem: new Map<string, Hold>(),
    anchors: new Map<string, { p: Vec3; muscleId: string; side: LabelFeedItem['side'] }>(),
    shown: [] as string[],
    last: -1,
    dirty: true,
    pending: false,
    bounds: null as { l: number; r: number } | null,
    live: false,
  });
  useEffect(
    () =>
      useAtlas.subscribe(() => {
        labels.current.dirty = true;
      }),
    [],
  );
  useEffect(
    () =>
      useLabelFeed.subscribe((s, p) => {
        if (s.on === p.on && s.labels === p.labels) return;
        labels.current.dirty = true;
        invalidate();
      }),
    [invalidate],
  );

  /** Mede a área visível de cada músculo num passe de seleção em grade e escolhe os rótulos. */
  const sampleLabels = (cam: PerspCam, now: number) => {
    if (!body || !model) return;
    const L = labels.current;
    const w = dir.rect.w, h = dir.rect.h;
    const gw = LABEL_GRID, gh = Math.max(1, Math.round((gw * h) / Math.max(1, w)));
    const ids = body.pickGrid(gl, cam, gw, gh);
    type Acc = { n: number; sx: number; sy: number; bx: number; by: number; bd: number; slot: number };
    const acc = new Map<string, Acc>();
    let lo = Infinity, hi = -Infinity;
    const keyAt = (i: number): string | null => {
      const s = model.slots[(ids[i] ?? 0) - 1];
      return s && s.kind === 'muscle' && s.muscleId ? `${s.muscleId}:${s.side}` : null;
    };
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (!ids[i]) continue;
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
        const k = keyAt(i);
        if (!k) continue;
        const a = acc.get(k) ?? { n: 0, sx: 0, sy: 0, bx: 0, by: 0, bd: Infinity, slot: (ids[i] ?? 1) - 1 };
        a.n++;
        a.sx += x;
        a.sy += y;
        acc.set(k, a);
      }
    // Ponto do rótulo: a célula do músculo mais perto do centróide (o centróide de uma lâmina curva pode cair fora dela).
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const k = ids[i] ? keyAt(i) : null;
        const a = k ? acc.get(k) : undefined;
        if (!a) continue;
        const d = (x - a.sx / a.n) ** 2 + (y - a.sy / a.n) ** 2;
        if (d < a.bd) Object.assign(a, { bd: d, bx: x, by: y, slot: (ids[i] ?? 1) - 1 });
      }
    const px = (a: Acc): [number, number] => [((a.bx + 0.5) / gw) * w, (1 - (a.by + 0.5) / gh) * h];
    // Um rótulo por músculo (o corpo é simétrico): a cópia que mais aparece concorre.
    const sides = new Map<string, [string, Acc][]>();
    for (const [key, a] of acc) {
      const id = key.slice(0, key.lastIndexOf(':'));
      sides.set(id, [...(sides.get(id) ?? []), [key, a]]);
    }
    const cands: LabelCandidate[] = [];
    for (const [id, list] of sides) {
      const top = list.reduce((m, x) => (x[1].n > m[1].n ? x : m));
      const [x, y] = px(top[1]);
      cands.push({ key: id, area: top[1].n, x, y });
    }
    const max = w < 700 ? 6 : 10;
    L.shown = settle(L.mem, choose(cands, w, h, max), now * 1000, HOLD_MS, max);
    L.pending = [...L.mem.values()].some((e) => e.since !== null);
    L.bounds = hi >= lo ? { l: (lo / gw) * w, r: ((hi + 1) / gw) * w } : null;
    const mid = L.bounds ? (L.bounds.l + L.bounds.r) / 2 : w / 2;
    cam.updateMatrixWorld();
    const q: [number, number, number] = [0, 0, 0];
    const count = { l: 0, r: 0 };
    for (const id of L.shown) {
      // Cópia de cada músculo: a que deixa as duas colunas mais parelhas; empate fica com a da medida anterior.
      const opts = (sides.get(id) ?? []).map(([, a]) => ({ a, col: px(a)[0] < mid ? ('l' as const) : ('r' as const), side: model.slots[a.slot]?.side }));
      const prev = L.anchors.get(id)?.side;
      opts.sort((u, v) => count[u.col] - count[v.col] || Number(v.side === prev) - Number(u.side === prev) || v.a.n - u.a.n);
      const o = opts[0];
      const s = o ? model.slots[o.a.slot] : undefined;
      if (!o || !s || !s.muscleId) continue;
      count[o.col]++;
      // Ponto 3D: o da linha central que cai mais perto da célula escolhida (o rótulo acompanha o giro entre medidas).
      const [tx, ty] = px(o.a);
      const off = body.meshes[s.layer].position;
      let best: Vec3 | null = null;
      let bd = Infinity;
      for (let k = 0; k < 16; k++) {
        if (!body.linePoint(o.a.slot, k, q)) break;
        PROJ.set(q[0] + off.x, q[1] + off.y, q[2] + off.z).project(cam);
        const d = (((PROJ.x + 1) / 2) * w - tx) ** 2 + (((1 - PROJ.y) / 2) * h - ty) ** 2;
        if (d < bd) {
          bd = d;
          best = [q[0] + off.x, q[1] + off.y, q[2] + off.z];
        }
      }
      if (best) L.anchors.set(id, { p: best, muscleId: s.muscleId, side: s.side });
    }
    for (const k of [...L.anchors.keys()]) if (!L.shown.includes(k)) L.anchors.delete(k);
  };

  /** Projeta os rótulos mostrados e as pontas da seleção (px do cliente) e entrega à página. */
  const publishLabels = (cam: PerspCam) => {
    if (!body || !model || !slot) return;
    const L = labels.current;
    const r = slot.getBoundingClientRect();
    const w = dir.rect.w, h = dir.rect.h;
    cam.updateMatrixWorld();
    const toClient = (p: Vec3): [number, number] | null => {
      PROJ.set(p[0], p[1], p[2]).project(cam);
      return PROJ.z > 1 ? null : [r.left + ((PROJ.x + 1) / 2) * w, r.top + ((1 - PROJ.y) / 2) * h];
    };
    const items: LabelFeedItem[] = [];
    for (const key of L.shown) {
      const a = L.anchors.get(key);
      const c = a ? toClient(a.p) : null;
      if (a && c) items.push({ key, muscleId: a.muscleId, side: a.side, x: c[0], y: c[1] });
    }
    let ends: { origin: [number, number]; insertion: [number, number] } | null = null;
    const st = useAtlas.getState();
    const i = st.selection?.kind === 'muscle' && !st.demo.spec ? endSlot(model, st.selection) : null;
    if (i !== null) {
      const q: [number, number, number] = [0, 0, 0];
      const off = body.meshes[model.slots[i]?.layer ?? 'deep'].position;
      const at = (k: number) => (body.linePoint(i, k, q) ? toClient([q[0] + off.x, q[1] + off.y, q[2] + off.z]) : null);
      const o = at(0), n = at(15);
      if (o && n) ends = { origin: o, insertion: n };
    }
    const b = L.bounds;
    useLabelFeed.setState({ items, ends, rect: { x: r.left, y: r.top, w, h }, body: b ? { left: r.left + b.l, right: r.left + b.r } : null });
    L.live = true;
  };

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
    // Alavanca entre dois batentes: a camada de cima vira vulto acima de uma frente que desce da cabeça aos pés.
    const pf = peelFrac(st.peel);
    const peeling = pf > 0 ? LAYER_ORDER[Math.floor(st.peel)] : undefined;
    for (const l of LAYER_ORDER) {
      const o = spread[l] * EXPLODE_SPACING * e;
      body.meshes[l].position.set(a[0] * o, 0, a[2] * o);
      if (l === peeling) body.layer(l, { cut: PEEL_TOP - pf * PEEL_SPAN, cutNormal: [0, 1, 0], ghost: GHOST[l] });
      else if (cut) {
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
    cam.aspect = dir.rect.w / dir.rect.h;
    let eye = orbitPosition(cur.current);
    let look = cur.current.target;
    if (st.shift) {
      // Corpo deslocado no quadro: câmera e alvo andam juntos ao contrário, no plano da tela.
      const { right } = screenAxes(cur.current);
      const k = st.shift * 2 * cur.current.dist * Math.tan((FOV_DEG * Math.PI) / 360) * cam.aspect;
      eye = [eye[0] - right[0] * k, eye[1] - right[1] * k, eye[2] - right[2] * k];
      look = [look[0] - right[0] * k, look[1] - right[1] * k, look[2] - right[2] * k];
    }
    const drawn = dir.camera(cam, eye, look);
    cam.near = Math.max(0.02, Math.min(drawn, cur.current.dist) * 0.05);
    cam.far = Math.max(drawn, cur.current.dist) + 12;
    cam.updateProjectionMatrix();

    // ---- Rótulos vivos: medem com a vista mudando (no máximo a cada 0,25 s) e de novo quando a histerese pede ----
    const L = labels.current;
    if (!useLabelFeed.getState().on || dir.flying) {
      if (L.live) useLabelFeed.setState({ items: [], ends: null });
      L.live = false;
      L.dirty = true;
      return;
    }
    if (!orbitsClose(cur.current, goal) || spec || e !== goalE) L.dirty = true;
    if (!useLabelFeed.getState().labels) {
      L.shown = [];
      L.pending = false;
    } else if ((L.dirty || L.pending) && now - L.last >= LABEL_EVERY) {
      sampleLabels(cam, now);
      L.last = now;
      L.dirty = false;
    }
    publishLabels(cam);
    if (L.dirty || L.pending) invalidate();
  });

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault manual fov={FOV_DEG} near={0.05} far={30} position={[0, 1, 4]} />
      {body && <primitive object={body.group} />}
    </>
  );
}

/** Parte fracionária da alavanca (0 no batente). */
function peelFrac(p: number): number {
  const f = p - Math.floor(p + 1e-6);
  return f > 0.002 ? f : 0;
}

/** Vaga cuja linha central dá origem e inserção da seleção: a primeira do lado tocado. */
function endSlot(model: BodyModel, sel: Pick): number | null {
  const all = keySlots(model, sel).filter((i) => model.slots[i]?.line);
  return all.find((i) => model.slots[i]?.side === sel.side || model.slots[i]?.side === 'c') ?? all[0] ?? null;
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
