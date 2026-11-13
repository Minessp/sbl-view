import { OrthographicCamera, View } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type OrthographicCamera as OrthoCam, Vector3 } from 'three';
import type { Vec3 } from '@/engine/math/vec';
import { useAtlas, type AtlasView } from '@/features/atlas/store';
import { missingInAnatomical } from '@/features/body/store';
import type { Box } from '../body/figure';
import { FigureMeshes, STAIN_OFF, STAIN_ON, useFigureMaterials } from '../body/FigureMeshes';
import { useFigure } from '../body/useFigure';
import { useStage } from '../stageStore';

const DEFAULT_BOX: Box = { center: [0, 0.93, 0], size: [0.5, 1.8, 0.3] };
/** Câmera: direção de onde olha (o sujeito olha +Z; o lado direito dele fica em −X). */
const DIR: Record<AtlasView, Vec3> = { front: [0, 0, 1], back: [0, 0, -1], side: [-1, 0, 0] };

function AtlasBody({ slot }: { slot: HTMLElement }) {
  const invalidate = useThree((s) => s.invalidate);
  const camRef = useRef<OrthoCam>(null);
  const muscleId = useAtlas((s) => s.muscleId);
  const view = useAtlas((s) => s.view);
  // Músculo que a malha anatômica não tem: esquemático nesta página.
  const model = useFigure(muscleId && missingInAnatomical(muscleId) ? 'esquematico' : undefined);
  const mats = useFigureMaterials(model);

  // Destaque: o alvo em eosina; se for profundo, o resto vira fantasma para ele aparecer.
  const target = useMemo(() => model.parts.filter((p) => p.muscleId === muscleId), [model, muscleId]);
  useEffect(() => {
    const deep = target.length > 0 && target.every((p) => p.deep);
    for (const p of model.parts) {
      if (p.kind === 'bone' || p.kind === 'skin') continue;
      const mat = mats.of(p);
      const on = p.muscleId === muscleId;
      mat.uniforms.uStain.value = p.kind === 'context' ? 0 : on ? STAIN_ON : STAIN_OFF;
      mat.uniforms.uCut.value = !on && deep && !p.deep ? -9 : 9;
    }
    invalidate();
  }, [model, mats, muscleId, target, invalidate]);

  const frame = useMemo(() => {
    const box = (muscleId && model.boxOf(muscleId)) || DEFAULT_BOX;
    const h = Math.min(1.95, Math.max(0.75, box.size[1] * 2.2));
    const cy = Math.min(1.82 - h / 2, Math.max(h / 2 - 0.04, box.center[1]));
    const across = view === 'side' ? box.size[2] : box.size[0];
    const w = Math.max(0.55, across * 1.35 + 0.12, h * 0.42);
    return { cy, h, w, cz: view === 'side' ? box.center[2] : 0 };
  }, [model, muscleId, view]);

  const look = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const cam = camRef.current;
    if (!cam) return;
    const rect = slot.getBoundingClientRect();
    const d = DIR[view];
    look.set(0, frame.cy, frame.cz);
    cam.position.set(d[0] * 4, frame.cy, frame.cz + d[2] * 4);
    cam.lookAt(look);
    cam.zoom = Math.min(rect.height / frame.h, rect.width / frame.w);
    cam.updateProjectionMatrix();
  });

  useEffect(() => invalidate(), [model, invalidate]);

  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault near={0.1} far={20} position={[0, 1, 4]} />
      <FigureMeshes model={model} mats={mats} />
    </>
  );
}

/** Uma vista recortada no retângulo do slot da página (o canvas fixo desenha por cima). */
export function AtlasScene() {
  const slot = useAtlas((s) => s.slot);
  const invalidate = useThree((s) => s.invalidate);
  const ref = useMemo(() => ({ current: slot }), [slot]);

  useEffect(() => {
    const unsub = useAtlas.subscribe(() => invalidate());
    const onMove = () => invalidate();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const ro = new ResizeObserver(onMove);
    if (slot) ro.observe(slot);
    useStage.getState().setReady(true);
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
      <AtlasBody slot={slot} />
    </View>
  );
}
