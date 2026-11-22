/**
 * Player de exercício: o corpo anatômico executa o clipe (FK → skinning), os músculos-alvo mudam de cor pelo
 * comprimento (tungstênio = mais curto que em pé, aço = mais comprido), o equipamento acompanha as mãos e a carga aparece
 * como vetor. Todo o estado vem de `usePlayer` (sem three.js); aqui só se aplica.
 */
import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Camera, PerspectiveCamera as PerspCam, WebGLRenderer } from 'three';
import { forwardKinematics, pointToWorld } from '@/engine/kinematics/fk';
import { blendDeg, blendRoot } from '@/engine/motion/blend';
import { evaluateClip, type CompiledClip, type MotionFrame } from '@/engine/motion/evaluate';
import { cycleLength, repAt } from '@/engine/motion/keys';
import { add, DEG, scale, sub, type Vec3 } from '@/engine/math/vec';
import { strainOf } from '@/features/atlas/explorer/demo';
import { dampOrbit, fitDistance, FOV_DEG, orbitPosition, orbitsClose, screenAxes, type Orbit } from '@/features/atlas/explorer/orbit';
import { usePlayer, VIEW_ANGLES } from '@/features/library/player/store';
import { useTheme } from '@/ui/theme';
import { ContactShadow } from '../body/ContactShadow';
import type { BodyInstance } from '../body/instance';
import { mergeBoxes, type Box, type BodyModel } from '../body/model';
import { STANDING } from '../body/poses';
import { useBodyInstance, useBodyModel } from '../body/useBody';
import { claimMain, releaseMain } from '../cinema/state';
import { SCENE_IN } from '../director/blend';
import { StageView, useDirector } from '../director/StageView';
import { Studio } from '../set/Studio';
import { Telemetry } from '../hud/telemetry';
import { useStage } from '../stageStore';
import { EquipmentView } from './equipment';
import { gearAppear } from './gear/material';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Alfa da pele ligada no player. */
const SKIN_ALPHA = 0.2;
/** Opacidade dos músculos fora do foco quando um músculo está isolado. */
const DIM = 0.12;
/** Troca de clipe na mesma vista (arara): a pose funde da anterior em SWAP_S; o equipamento novo se monta em GEAR_S. */
const SWAP_S = 0.45;
const GEAR_S = 0.7;
const easeOut = (k: number) => 1 - (1 - k) ** 3;

/** Caixa que contém o corpo e o equipamento ao longo da repetição (a câmera não persegue o movimento). */
export function clipBox(c: CompiledClip): Box {
  const boxes: Box[] = [];
  const pt = (p: Vec3, s = 0.12): Box => ({ center: p, size: [s, s, s] });
  for (let i = 0; i <= 8; i++) {
    const f = evaluateClip(c, i / 8);
    for (const seg of c.sk.segments) {
      boxes.push(pt(pointToWorld(f.pose, seg.id, [0, 0, 0]), 0.2));
      boxes.push(pt(pointToWorld(f.pose, seg.id, seg.tip), 0.16));
    }
    for (const e of f.equipment) {
      if (e.kind === 'block') boxes.push({ center: e.center, size: e.size });
      else if (e.kind === 'barbell') for (const k of [-0.72, 0.72]) boxes.push(pt([e.center[0] + e.axis[0] * k, e.center[1] + e.axis[1] * k, e.center[2] + e.axis[2] * k], 0.45));
      else if (e.kind === 'dumbbell') boxes.push(pt(e.center, 0.3));
      else if (e.kind === 'cable') boxes.push(pt(e.pulley, 0.1));
      else if (e.kind === 'swing') boxes.push(pt(e.pivot, 0.2));
    }
  }
  const m = mergeBoxes(boxes) ?? { center: [0, 0.9, 0], size: [0.6, 1.8, 0.4] };
  // Chão sempre no quadro.
  const lo = Math.min(m.center[1] - m.size[1] / 2, 0);
  const hi = m.center[1] + m.size[1] / 2;
  return {
    center: [m.center[0], (lo + hi) / 2, m.center[2]],
    size: [m.size[0], hi - lo, m.size[2]],
  };
}

/** Uma vaga por lado de cada músculo: alvo e sinergista. */
function slotsOf(model: BodyModel, ids: readonly string[]): number[] {
  return ids.flatMap((id) => model.byMuscle.get(id) ?? []);
}

function applyLook(body: BodyInstance, model: BodyModel) {
  const st = usePlayer.getState();
  const { primary } = st.targets;
  body.fill('highlight', 0);
  body.fill('opacity', 1);
  body.fill('hidden', 0);
  body.layer('skin', { visible: st.skin, alpha: SKIN_ALPHA });
  for (const l of ['superficial', 'deep', 'bone'] as const) body.layer(l, { showAbove: -99, visible: true });
  if (st.xray) {
    // Raio X: só os alvos ficam inteiros; o resto, osso inclusive, vira vulto.
    const keep = new Set(slotsOf(model, st.isolate ? [st.isolate] : [...primary, ...st.targets.synergist]));
    body.layer('skin', { visible: false, alpha: SKIN_ALPHA });
    for (const s of model.slots) if (!keep.has(s.index)) body.set(s.index, 'opacity', s.layer === 'bone' ? 0.18 : 0.06);
    body.fill('highlight', 0.35, [...keep]);
  } else if (st.isolate) {
    const keep = new Set(slotsOf(model, [st.isolate]));
    for (const s of model.slots) {
      if (s.layer === 'bone' || keep.has(s.index)) continue;
      body.set(s.index, 'opacity', DIM);
    }
    body.fill('highlight', 0.35, [...keep]);
  } else {
    body.fill('highlight', 0.18, slotsOf(model, primary));
  }
  // Fáscias por cima dos ventres (trato iliotibial, aponeuroses) viram vulto: a cor do comprimento aparece.
  for (const s of model.slots) if (s.kind === 'tendon' && s.layer === 'superficial') body.set(s.index, 'opacity', Math.min(body.get(s.index, 'opacity'), 0.35));
  body.commit();
}

/** `main`: vista principal do pipeline de cinema (foco, oclusão); a vitrine da home não é. */
export function PlayerBody({ main = false }: { main?: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const camRef = useRef<PerspCam>(null);
  const dir = useDirector();
  const slot = dir.frame;
  // Slot da página: trocou (outra página com player), o palco volta a "pronto" (o procurador é o mesmo).
  const pageSlot = usePlayer((s) => s.slot);
  const { model } = useBodyModel();
  const body = useBodyInstance(model, main ? 'main' : undefined);
  const clip = usePlayer((s) => s.clip);
  const resolved = useTheme((s) => s.resolved);

  const rest = useRef<Float32Array | null>(null);
  const frame = useRef<MotionFrame | null>(null);
  const lastTime = useRef<number | null>(null);
  const feet = useRef<Vec3[]>([]);
  const getFeet = useMemo(() => () => feet.current, []);
  const box = useMemo(() => (clip ? clipBox(clip) : null), [clip]);
  const cur = useRef<Orbit | null>(null);

  // Equipamento do clipe.
  // Criado no efeito: no StrictMode a limpeza roda entre as duas montagens e precisa de um equipamento novo.
  const [equipment, setEquipment] = useState<EquipmentView | null>(null);
  // Clipe trocado sem sair da vista: parte da última pose desenhada.
  const swap = useRef<{ deg: Readonly<Record<string, number>>; root: MotionFrame['root']; at: number } | null>(null);
  const prevClip = useRef<CompiledClip | null>(null);
  useEffect(() => {
    if (!clip) return;
    const from = dir.drawn.pose;
    swap.current = prevClip.current && prevClip.current !== clip && from && !dir.flying && !reduceMotion() ? { ...from, at: performance.now() / 1000 } : null;
    prevClip.current = clip;
  }, [clip, dir]);
  useEffect(() => {
    if (!clip) return;
    const e = new EquipmentView([0, 0.25, 0.5, 0.75, 1].map((u) => evaluateClip(clip, u)));
    setEquipment(e);
    lastTime.current = null;
    return () => {
      e.dispose();
      setEquipment((cur) => (cur === e ? null : cur));
    };
  }, [clip]);
  // Telemetria só na página do exercício (a vitrine da home e o Comparar não desenham).
  const [hud, setHud] = useState<Telemetry | null>(null);
  useEffect(() => {
    if (!clip || !main) return;
    const h = new Telemetry(clip);
    setHud(h);
    return () => {
      h.dispose();
      setHud((cur) => (cur === h ? null : cur));
    };
  }, [clip, main]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      equipment?.refreshColors();
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [equipment, resolved, invalidate]);

  // Corpo pronto: comprimentos em pé (base da cor), visual.
  useEffect(() => {
    if (!body || !model || !clip) return;
    body.setPose(clip.sk, forwardKinematics(clip.sk, STANDING));
    rest.current = body.lengths.slice();
    lastTime.current = null;
    applyLook(body, model);
    useStage.getState().setReady(true);
    invalidate();
  }, [body, model, clip, invalidate, pageSlot]);

  useEffect(() => {
    if (!body || !model) return;
    let last: unknown[] = [];
    return usePlayer.subscribe((s) => {
      const sig = [s.isolate, s.skin, s.targets, s.xray];
      if (sig.every((v, i) => v === last[i])) return;
      last = sig;
      applyLook(body, model);
      invalidate();
    });
  }, [body, model, invalidate]);

  const clock = useRef(0);
  useFrame(() => {
    const cam = camRef.current;
    if (!cam || !body || !model || !clip || !box) return;
    const now = performance.now() / 1000;
    const gap = now - clock.current;
    const dt = gap > 0 && gap < 0.5 ? gap : 1 / 60;
    clock.current = now;
    const st = usePlayer.getState();
    const reduce = reduceMotion();

    // ---- Relógio ----
    let time = st.time;
    if (st.playing) {
      time = (time + dt * st.speed) % cycleLength(clip.clip.tempo);
      st.setTime(time);
      invalidate();
    }

    // ---- Pose, cor, equipamento ----
    // No voo da troca de rota a pose mistura a de saída com a do clipe a cada quadro.
    const sw = swap.current;
    const swapK = sw ? Math.min(1, (now - sw.at) / SWAP_S) : 1;
    if (time !== lastTime.current || dir.flying || sw) {
      lastTime.current = time;
      const { u } = repAt(clip.clip.tempo, time);
      const f = evaluateClip(clip, u);
      frame.current = f;
      let pose = dir.pose(clip.sk, f.deg, f.root) ?? f.pose;
      if (sw && !dir.flying) {
        const k = easeOut(swapK);
        const d = blendDeg(sw.deg, f.deg, k);
        const r = blendRoot(sw.root, f.root, k);
        dir.drawn.pose = { deg: d, root: r };
        pose = forwardKinematics(clip.sk, Object.fromEntries(Object.entries(d).map(([id, v]) => [id, v * DEG])), { root: r, clampToRom: false });
        if (swapK < 1 || now - sw.at < GEAR_S) invalidate();
        if (now - sw.at >= GEAR_S) swap.current = null;
      }
      body.setPose(clip.sk, pose);
      const base = rest.current;
      if (base) {
        body.fill('strain', 0);
        const ids = st.isolate ? [st.isolate] : [...st.targets.primary, ...st.targets.synergist];
        const syn = new Set(st.isolate ? [] : st.targets.synergist);
        for (const id of ids) {
          const k = syn.has(id) ? 0.55 : 1;
          for (const i of model.byMuscle.get(id) ?? []) body.set(i, 'strain', k * strainOf(body.lengths[i] ?? 0, base[i] ?? 0));
        }
        body.commit();
      }
      feet.current = [...f.contacts, ...(equipment?.floor ?? [])].slice(0, 8);
    }
    if (frame.current) equipment?.update(frame.current, st.showLoad);
    if (main) gearAppear.value = Math.min(dir.e(...SCENE_IN), sw ? easeOut(Math.min(1, (now - sw.at) / GEAR_S)) : 1);
    dir.skin(body, st.skin, SKIN_ALPHA);

    // ---- Câmera ----
    const aspect = dir.rect.w / dir.rect.h;
    const v = VIEW_ANGLES[st.view];
    const yaw = v.yaw + st.drag.yaw;
    const pitch = Math.min(1.25, Math.max(-0.5, v.pitch + st.drag.pitch));
    // Vista de cima: a caixa aparece pela planta; o enquadramento usa a maior dimensão horizontal como altura.
    const sz: Vec3 = pitch > 0.7 ? [box.size[0], Math.max(box.size[2], box.size[1] * 0.7), box.size[1]] : box.size;
    const k = st.compose;
    const dist = fitDistance(sz, yaw, aspect, k?.margin ?? 1.1) * st.drag.zoom * st.dolly;
    let target = box.center;
    if (k) {
      // Corpo deslocado no quadro: o alvo da câmera anda ao contrário no plano da tela.
      const { right, up } = screenAxes({ yaw, pitch, dist, target });
      const hv = 2 * dist * Math.tan((FOV_DEG * Math.PI) / 360);
      target = sub(box.center, add(scale(right, k.x * hv * aspect), scale(up, k.y * hv)));
    }
    const goal: Orbit = { yaw, pitch, dist, target };
    cur.current = !cur.current || reduce ? goal : dampOrbit(cur.current, goal, 1 - Math.exp(-dt * 6));
    if (orbitsClose(cur.current, goal)) cur.current = goal;
    else invalidate();
    cam.aspect = aspect;
    const drawn = dir.camera(cam, orbitPosition(cur.current), cur.current.target);
    cam.near = Math.max(0.05, Math.min(drawn, cur.current.dist) * 0.05);
    cam.far = Math.max(drawn, cur.current.dist) + 12;
    cam.updateProjectionMatrix();
    if (main) claimMain(cam, slot, gl.domElement, drawn, 0.3, 0);

    // ---- Telemetria (rótulos no DOM precisam da câmera já posta) ----
    if (hud) {
      if (st.telemetry && !dir.flying && frame.current) {
        cam.updateMatrixWorld();
        const u = repAt(clip.clip.tempo, time).u;
        hud.update({ frame: frame.current, u, dof: st.joint.dof, paths: st.isolate ? st.joint.paths : [], showLoad: st.showLoad, target: st.joint.target, full: dir.rect.w >= 600 }, cam, dir.rect);
      } else hud.hide();
    }
  });

  useEffect(() => {
    const cam = camRef.current;
    return () => releaseMain(cam);
  }, []);

  // Seleção pelo slot da página (o canvas fixo não recebe ponteiro): só músculo.
  useEffect(() => {
    if (!main || !body || !model) return;
    usePlayer.getState().setPick((x, y) => {
      const cam = camRef.current;
      const i = cam ? body.pick(gl, cam, x, y, dir.rect.w, dir.rect.h) : null;
      return (i === null ? undefined : model.slots[i])?.muscleId ?? null;
    });
    return () => usePlayer.getState().setPick(null);
  }, [main, body, model, gl, dir]);

  const casters = useMemo(() => () => (equipment ? [{ render: (r: WebGLRenderer, c: Camera) => r.render(equipment.group, c) }] : []), [equipment]);

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault manual fov={FOV_DEG} near={0.05} far={30} position={[0, 1, 4]} />
      <Studio body={body} cx={box?.center[0] ?? 0} cz={box?.center[2] ?? 0} shadowCasters={casters} />
      {body && <ContactShadow feet={getFeet} />}
      {body && <primitive object={body.group} />}
      {equipment && <primitive object={equipment.group} />}
      {hud && <primitive object={hud.group} />}
    </>
  );
}

/** Uma vista recortada no slot do player (o canvas fixo desenha por cima); protagonista da troca de rota. */
export function MotionScene() {
  const slot = usePlayer((s) => s.slot);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const unsub = usePlayer.subscribe(() => invalidate());
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
      <PlayerBody main />
    </StageView>
  );
}
