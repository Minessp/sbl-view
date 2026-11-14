/**
 * Player de exercício: o corpo anatômico executa o clipe (FK → skinning), os músculos-alvo mudam de cor pelo
 * comprimento (tungstênio = mais curto que em pé, aço = mais comprido), o equipamento acompanha as mãos e a carga aparece
 * como vetor. Todo o estado vem de `usePlayer` (sem three.js); aqui só se aplica.
 */
import { PerspectiveCamera, View } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PerspectiveCamera as PerspCam } from 'three';
import { forwardKinematics, pointToWorld } from '@/engine/kinematics/fk';
import { evaluateClip, type CompiledClip, type MotionFrame } from '@/engine/motion/evaluate';
import { cycleLength, repAt } from '@/engine/motion/keys';
import type { Vec3 } from '@/engine/math/vec';
import { strainOf } from '@/features/atlas/explorer/demo';
import { dampOrbit, fitDistance, FOV_DEG, orbitPosition, orbitsClose, type Orbit } from '@/features/atlas/explorer/orbit';
import { usePlayer, VIEW_ANGLES } from '@/features/library/player/store';
import { useTheme } from '@/ui/theme';
import { ContactShadow } from '../body/ContactShadow';
import type { BodyInstance } from '../body/instance';
import { mergeBoxes, type Box, type BodyModel } from '../body/model';
import { STANDING } from '../body/poses';
import { useBodyInstance, useBodyModel } from '../body/useBody';
import { useStage } from '../stageStore';
import { EquipmentView } from './equipment';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Opacidade dos músculos fora do foco quando um músculo está isolado. */
const DIM = 0.12;

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
  body.layer('skin', { visible: st.skin, alpha: 0.2 });
  for (const l of ['superficial', 'deep', 'bone'] as const) body.layer(l, { showAbove: -99, visible: true });
  if (st.isolate) {
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

export function PlayerBody({ slot }: { slot: HTMLElement }) {
  const invalidate = useThree((s) => s.invalidate);
  const camRef = useRef<PerspCam>(null);
  const { model } = useBodyModel();
  const body = useBodyInstance(model);
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
  }, [body, model, clip, invalidate, slot]);

  useEffect(() => {
    if (!body || !model) return;
    let last: unknown[] = [];
    return usePlayer.subscribe((s) => {
      const sig = [s.isolate, s.skin, s.targets];
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
    if (time !== lastTime.current) {
      lastTime.current = time;
      const { u } = repAt(clip.clip.tempo, time);
      const f = evaluateClip(clip, u);
      frame.current = f;
      body.setPose(clip.sk, f.pose);
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

    // ---- Câmera ----
    const rect = slot.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const v = VIEW_ANGLES[st.view];
    const yaw = v.yaw + st.drag.yaw;
    const pitch = Math.min(1.25, Math.max(-0.5, v.pitch + st.drag.pitch));
    // Vista de cima: a caixa aparece pela planta; o enquadramento usa a maior dimensão horizontal como altura.
    const sz: Vec3 = pitch > 0.7 ? [box.size[0], Math.max(box.size[2], box.size[1] * 0.7), box.size[1]] : box.size;
    const goal: Orbit = {
      yaw,
      pitch,
      dist: fitDistance(sz, yaw, aspect, 1.1) * st.drag.zoom,
      target: box.center,
    };
    cur.current = !cur.current || reduce ? goal : dampOrbit(cur.current, goal, 1 - Math.exp(-dt * 6));
    if (orbitsClose(cur.current, goal)) cur.current = goal;
    else invalidate();
    const p = orbitPosition(cur.current);
    cam.position.set(p[0], p[1], p[2]);
    cam.lookAt(cur.current.target[0], cur.current.target[1], cur.current.target[2]);
    cam.aspect = aspect;
    cam.near = Math.max(0.05, cur.current.dist * 0.05);
    cam.far = cur.current.dist + 12;
    cam.updateProjectionMatrix();
  });

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault manual fov={FOV_DEG} near={0.05} far={30} position={[0, 1, 4]} />
      {body && <ContactShadow feet={getFeet} />}
      {body && <primitive object={body.group} />}
      {equipment && <primitive object={equipment.group} />}
    </>
  );
}

/** Uma vista recortada no slot do player (o canvas fixo desenha por cima). */
export function MotionScene() {
  const slot = usePlayer((s) => s.slot);
  const invalidate = useThree((s) => s.invalidate);
  const ref = useMemo(() => ({ current: slot }), [slot]);

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
    <View track={ref as React.RefObject<HTMLElement>} index={1}>
      <PlayerBody slot={slot} />
    </View>
  );
}
