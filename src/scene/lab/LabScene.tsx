import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useLab, useLabSlots } from '@/features/lab/store';
import { useBodyModel } from '../body/useBody';
import { StageView } from '../director/StageView';
import { useStage } from '../stageStore';
import { VariantBody } from './VariantBody';

/** Uma vista recortada por variação; o canvas fixo desenha sobre o retângulo de cada slot. */
export function LabScene() {
  const ids = useLab((s) => s.variantIds);
  const slots = useLabSlots((s) => s.slots);
  const overlays = useLabSlots((s) => s.overlays);
  const invalidate = useThree((s) => s.invalidate);
  const { model } = useBodyModel();

  useEffect(() => {
    const unsubs = [useLab.subscribe(() => invalidate()), useLabSlots.subscribe(() => invalidate())];
    const onMove = () => invalidate();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const ro = new ResizeObserver(onMove);
    Object.values(useLabSlots.getState().slots).forEach((el) => el && ro.observe(el));
    return () => {
      unsubs.forEach((u) => u());
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
      {ids.map((id, i) => {
        const el = slots[id];
        if (!el) return null;
        return (
          <StageView key={id} slot={el} index={i + 1}>
            <VariantBody variantId={id} slot={el} overlay={overlays[id] ?? null} model={model} />
          </StageView>
        );
      })}
    </>
  );
}
