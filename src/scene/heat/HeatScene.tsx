/**
 * Mapa de calor: corpo inteiro de frente e de costas, cada músculo tingido de eosina pelo degrau
 * de séries semanais. Mesmo modelo e materiais nas duas vistas.
 */
import { OrthographicCamera, View } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type OrthographicCamera as OrthoCam } from 'three';
import { heatLevel, HEAT_STAIN } from '@/features/heat/levels';
import { useHeat, type HeatView } from '@/features/heat/store';
import type { FigureModel } from '../body/figure';
import { FigureMeshes, useFigureMaterials, type FigureMaterials } from '../body/FigureMeshes';
import { useFigure } from '../body/useFigure';
import { useStage } from '../stageStore';

const H = 1.92;
const CY = 0.9;

function HeatBody({ view, slot, model, mats }: { view: HeatView; slot: HTMLElement; model: FigureModel; mats: FigureMaterials }) {
  const camRef = useRef<OrthoCam>(null);
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
      <FigureMeshes model={model} mats={mats} />
    </>
  );
}

export function HeatScene() {
  const invalidate = useThree((s) => s.invalidate);
  const slots = useHeat((s) => s.slots);
  const values = useHeat((s) => s.values);
  const model = useFigure();
  const mats = useFigureMaterials(model);

  useEffect(() => {
    for (const p of model.parts) {
      if (p.kind !== 'muscle' || !p.muscleId) continue;
      mats.of(p).uniforms.uStain.value = HEAT_STAIN[heatLevel(values[p.muscleId] ?? 0)];
    }
    invalidate();
  }, [model, mats, values, invalidate]);

  useEffect(() => {
    const unsub = useHeat.subscribe(() => invalidate());
    const onMove = () => invalidate();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const ro = new ResizeObserver(onMove);
    for (const el of Object.values(slots)) if (el) ro.observe(el);
    useStage.getState().setReady(true);
    return () => {
      unsub();
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      ro.disconnect();
      useStage.getState().setReady(false);
    };
  }, [invalidate, slots]);

  const refs = useMemo(() => ({ front: { current: slots.front }, back: { current: slots.back } }), [slots]);

  return (
    <>
      {(['front', 'back'] as const).map((v) => {
        const el = slots[v];
        return el ? (
          <View key={v} track={refs[v] as React.RefObject<HTMLElement>} index={v === 'front' ? 1 : 2}>
            <HeatBody view={v} slot={el} model={model} mats={mats} />
          </View>
        ) : null;
      })}
    </>
  );
}
