import { View } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { useLab, useLabSlots } from '@/features/lab/store';
import { useStage } from '../stageStore';
import { VariantBody } from './VariantBody';

/** Uma vista recortada por variação; o canvas fixo desenha sobre o retângulo de cada slot. */
export function LabScene() {
  const ids = useLab((s) => s.variantIds);
  const slots = useLabSlots((s) => s.slots);
  const overlays = useLabSlots((s) => s.overlays);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const unsubs = [useLab.subscribe(() => invalidate()), useLabSlots.subscribe(() => invalidate())];
    const onMove = () => invalidate();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const ro = new ResizeObserver(onMove);
    Object.values(useLabSlots.getState().slots).forEach((el) => el && ro.observe(el));
    useStage.getState().setReady(true);
    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      ro.disconnect();
      useStage.getState().setReady(false);
    };
  }, [invalidate, slots]);

  const refs = useMemo(() => Object.fromEntries(ids.map((id) => [id, { current: slots[id] ?? null }])), [ids, slots]);

  return (
    <>
      {ids.map((id, i) => {
        const el = slots[id];
        const ref = refs[id];
        if (!el || !ref) return null;
        return (
          <View key={id} track={ref as React.RefObject<HTMLElement>} index={i + 1}>
            <VariantBody variantId={id} slot={el} overlay={overlays[id] ?? null} />
          </View>
        );
      })}
    </>
  );
}
