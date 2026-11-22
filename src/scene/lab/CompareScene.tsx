/**
 * Lab de comparação: uma vista recortada por exercício, todas no mesmo ponto da repetição (u do store). O alvo muda de
 * cor pelo comprimento (tungstênio = mais curto que em pé, aço = mais comprido); o equipamento e o vetor da carga
 * acompanham. Estado em `useCompare` (sem three.js); aqui só se aplica.
 */
import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PerspectiveCamera as PerspCam } from 'three';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { evaluateClip, type MotionFrame } from '@/engine/motion/evaluate';
import type { Vec3 } from '@/engine/math/vec';
import { strainOf } from '@/features/atlas/explorer/demo';
import { fitDistance, FOV_DEG, orbitPosition } from '@/features/atlas/explorer/orbit';
import { compiledFor, type CompareSpec } from '@/features/lab/compare/analysis';
import { uAtPhase, useCompare, useCompareSlots, type CompareView } from '@/features/lab/compare/store';
import { useTheme } from '@/ui/theme';
import { ContactShadow } from '../body/ContactShadow';
import type { BodyInstance } from '../body/instance';
import type { BodyModel } from '../body/model';
import { STANDING } from '../body/poses';
import { useBodyInstance, useBodyModel } from '../body/useBody';
import { StageView, useDirector } from '../director/StageView';
import { useStage } from '../stageStore';
import { EquipmentView } from '../motion/equipment';
import { clipBox } from '../motion/MotionScene';

/** Guinada e arfagem de cada vista (rad), como no player. Perfil pelo lado direito, o lado medido. */
const VIEWS: Readonly<Record<CompareView, { yaw: number; pitch: number }>> = {
  side: { yaw: -Math.PI / 2, pitch: 0.06 },
  front: { yaw: 0, pitch: 0.08 },
  back: { yaw: Math.PI, pitch: 0.1 },
  diagonal: { yaw: -Math.PI / 4, pitch: 0.22 },
};

function applyLook(body: BodyInstance, model: BodyModel, muscle: string, skin: boolean) {
  body.fill('highlight', 0);
  body.fill('opacity', 1);
  body.fill('hidden', 0);
  body.layer('skin', { visible: skin, alpha: 0.2 });
  for (const l of ['superficial', 'deep', 'bone'] as const) body.layer(l, { showAbove: -99, visible: true });
  const keep = new Set(model.byMuscle.get(muscle) ?? []);
  // O alvo em foco: o resto do corpo vira vulto, osso fica.
  for (const s of model.slots) if (s.layer !== 'bone' && !keep.has(s.index)) body.set(s.index, 'opacity', 0.16);
  body.fill('highlight', 0.3, [...keep]);
  body.commit();
}

function CompareBody({ spec, model, main }: { spec: CompareSpec; model: BodyModel; main: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const camRef = useRef<PerspCam>(null);
  const dir = useDirector();
  // A primeira vista herda o corpo da página anterior (troca de rota sem corte).
  const body = useBodyInstance(model, main ? 'main' : undefined);
  const muscle = useCompare((s) => s.muscle);
  const skin = useCompare((s) => s.skin);
  const resolved = useTheme((s) => s.resolved);
  // Memoizado por chave no módulo: mesma especificação, mesmo objeto (os efeitos não refazem à toa).
  const clip = compiledFor(spec);
  const box = useMemo(() => clipBox(clip), [clip]);
  const rest = useRef<Float32Array | null>(null);
  const lastU = useRef<number | null>(null);
  const frame = useRef<MotionFrame | null>(null);
  const feet = useRef<Vec3[]>([]);
  const getFeet = useMemo(() => () => feet.current, []);

  // Criado no efeito: no StrictMode a limpeza roda entre as duas montagens e precisa de um equipamento novo.
  const [equipment, setEquipment] = useState<EquipmentView | null>(null);
  useEffect(() => {
    const e = new EquipmentView([0, 0.25, 0.5, 0.75, 1].map((u) => evaluateClip(clip, u)));
    setEquipment(e);
    lastU.current = null;
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

  useEffect(() => {
    if (!body) return;
    body.setPose(clip.sk, forwardKinematics(clip.sk, STANDING));
    rest.current = body.lengths.slice();
    lastU.current = null;
    applyLook(body, model, muscle, skin);
    useStage.getState().setReady(true);
    invalidate();
  }, [body, model, clip, muscle, skin, invalidate]);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam || !body) return;
    const st = useCompare.getState();
    const u = uAtPhase(st.phase);
    if (u !== lastU.current || dir.flying) {
      lastU.current = u;
      const f = evaluateClip(clip, u);
      frame.current = f;
      body.setPose(clip.sk, dir.pose(clip.sk, f.deg, f.root) ?? f.pose);
      const base = rest.current;
      if (base) {
        body.fill('strain', 0);
        for (const i of model.byMuscle.get(st.muscle) ?? []) body.set(i, 'strain', strainOf(body.lengths[i] ?? 0, base[i] ?? 0));
        body.commit();
      }
      feet.current = [...f.contacts, ...(equipment?.floor ?? [])].slice(0, 8);
    }
    if (frame.current) equipment?.update(frame.current, true);
    dir.skin(body, st.skin, 0.2);

    // Câmera parada no quadro do clipe inteiro: os corpos não pulam enquanto a repetição anda.
    const aspect = dir.rect.w / dir.rect.h;
    const v = VIEWS[st.view];
    const p = orbitPosition({ yaw: v.yaw, pitch: v.pitch, dist: fitDistance(box.size, v.yaw, aspect, 1.12), target: box.center });
    dir.camera(cam, p, box.center);
    cam.aspect = aspect;
    cam.near = 0.05;
    cam.far = 30;
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

export function CompareScene() {
  const specs = useCompare((s) => s.specs);
  const slots = useCompareSlots((s) => s.slots);
  const invalidate = useThree((s) => s.invalidate);
  const { model } = useBodyModel();

  useEffect(() => {
    const unsubs = [useCompare.subscribe(() => invalidate()), useCompareSlots.subscribe(() => invalidate())];
    const onMove = () => invalidate();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const ro = new ResizeObserver(onMove);
    Object.values(slots).forEach((el) => el && ro.observe(el));
    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      ro.disconnect();
    };
  }, [invalidate, slots]);

  useEffect(() => () => useStage.getState().setReady(false), []);

  if (!model) return null;
  return (
    <>
      {specs.map((s, i) => {
        const el = slots[s.key];
        if (!el) return null;
        return (
          <StageView key={s.key} slot={el} index={i + 1} main={i === 0}>
            <CompareBody spec={s} model={model} main={i === 0} />
          </StageView>
        );
      })}
    </>
  );
}
