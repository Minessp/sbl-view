/**
 * Mapa de calor: corpo anatômico de frente e de costas, cada músculo aceso pelo degrau de séries
 * semanais. O músculo em repouso usa --c-bg-3, a mesma base da rampa: degrau 0 igual ao da legenda.
 */
import { OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { type OrthographicCamera as OrthoCam } from 'three';
import { skeletonDef } from '@/data';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import { heatLevel, HEAT_GLOW } from '@/features/heat/levels';
import { useHeat, type HeatView } from '@/features/heat/store';
import type { BodyModel } from '../body/model';
import { STANDING } from '../body/poses';
import { useBodyInstance, useBodyModel } from '../body/useBody';
import { StageView } from '../director/StageView';
import { useStage } from '../stageStore';

const H = 1.92;
const CY = 0.9;
const sk = buildSkeleton(skeletonDef);
const pose = forwardKinematics(sk, STANDING);

function HeatBody({ view, slot, model }: { view: HeatView; slot: HTMLElement; model: BodyModel }) {
  const camRef = useRef<OrthoCam>(null);
  const invalidate = useThree((s) => s.invalidate);
  const values = useHeat((s) => s.values);
  const body = useBodyInstance(model);

  useEffect(() => {
    if (!body) return;
    body.setPose(sk, pose);
    body.layer('skin', { visible: false });
    body.color('superficial', 'bg-3');
    body.color('deep', 'bg-3');
  }, [body]);

  useEffect(() => {
    if (!body) return;
    body.fill('heat', 0);
    for (const [id, slots] of model.byMuscle) body.fill('heat', HEAT_GLOW[heatLevel(values[id] ?? 0)], slots);
    body.commit();
    invalidate();
  }, [body, model, values, invalidate]);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam) return;
    const rect = slot.getBoundingClientRect();
    cam.position.set(0, CY, view === 'front' ? 4 : -4);
    cam.lookAt(0, CY, 0);
    cam.zoom = Math.min(rect.height / H, rect.width / 0.8);
    cam.updateProjectionMatrix();
  });
  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault near={0.1} far={20} position={[0, CY, 4]} />
      {body && <primitive object={body.group} />}
    </>
  );
}

export function HeatScene() {
  const invalidate = useThree((s) => s.invalidate);
  const slots = useHeat((s) => s.slots);
  const { model } = useBodyModel();

  useEffect(() => {
    const unsub = useHeat.subscribe(() => invalidate());
    const onMove = () => invalidate();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const ro = new ResizeObserver(onMove);
    for (const el of Object.values(slots)) if (el) ro.observe(el);
    return () => {
      unsub();
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      ro.disconnect();
    };
  }, [invalidate, slots]);

  useEffect(() => {
    if (!model) return;
    useStage.getState().setReady(true);
    invalidate();
    return () => useStage.getState().setReady(false);
  }, [model, invalidate]);

  if (!model) return null;

  return (
    <>
      {(['front', 'back'] as const).map((v) => {
        const el = slots[v];
        return el ? (
          <StageView key={v} slot={el} index={v === 'front' ? 1 : 2}>
            <HeatBody view={v} slot={el} model={model} />
          </StageView>
        ) : null;
      })}
    </>
  );
}
