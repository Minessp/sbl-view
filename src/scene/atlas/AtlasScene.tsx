import { OrthographicCamera, View } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type OrthographicCamera as OrthoCam, Vector3 } from 'three';
import { skeletonDef } from '@/data';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { Vec3 } from '@/engine/math/vec';
import { useAtlas, type AtlasView } from '@/features/atlas/store';
import { boxOfSlots, type Box } from '../body/model';
import { ContactShadow } from '../body/ContactShadow';
import { footContacts, STANDING } from '../body/poses';
import { pulse } from '../body/rig';
import { useBodyInstance, useBodyModel } from '../body/useBody';
import { useStage } from '../stageStore';

const DEFAULT_BOX: Box = { center: [0, 0.93, 0], size: [0.5, 1.8, 0.3] };
/** Câmera: direção de onde olha (o sujeito olha +Z; o lado direito dele fica em −X). */
const DIR: Record<AtlasView, Vec3> = { front: [0, 0, 1], back: [0, 0, -1], side: [-1, 0, 0] };
const sk = buildSkeleton(skeletonDef);
const pose = forwardKinematics(sk, STANDING);
const feet = footContacts(sk, pose);
const getFeet = () => feet;
const HOVER = 0.4;
const GHOST = 0.14;

function AtlasBody({ slot }: { slot: HTMLElement }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const camRef = useRef<OrthoCam>(null);
  const muscleId = useAtlas((s) => s.muscleId);
  const hover = useAtlas((s) => s.hover);
  const view = useAtlas((s) => s.view);
  const { model } = useBodyModel();
  const body = useBodyInstance(model);

  useEffect(() => {
    if (!body) return;
    body.setPose(sk, pose);
    body.layer('skin', { visible: false });
    useStage.getState().setReady(true);
    invalidate();
  }, [body, invalidate]);

  // Músculo novo: o brilho percorre a fibra da origem à inserção.
  useEffect(() => {
    if (muscleId) pulse();
  }, [muscleId]);

  // Destaque: o alvo aceso; se for profundo, a camada superficial vira fantasma para ele aparecer.
  useEffect(() => {
    if (!body || !model) return;
    const target = (muscleId && model.byMuscle.get(muscleId)) || [];
    const deep = target.length > 0 && target.every((i) => model.slots[i]?.layer === 'deep');
    body.fill('highlight', 0);
    body.fill('opacity', 1);
    if (deep) body.fillLayer('superficial', 'opacity', GHOST);
    if (hover && hover !== muscleId) body.fill('highlight', HOVER, model.byMuscle.get(hover) ?? []);
    body.fill('highlight', 1, target);
    body.fill('opacity', 1, target);
    body.commit();
    invalidate();
  }, [body, model, muscleId, hover, invalidate]);

  // Seleção pelo slot da página (o canvas fixo não recebe ponteiro).
  useEffect(() => {
    if (!body || !model) return;
    useAtlas.getState().setPick((x, y) => {
      const cam = camRef.current;
      if (!cam) return null;
      const r = slot.getBoundingClientRect();
      const i = body.pick(gl, cam, x, y, r.width, r.height);
      return i === null ? null : (model.slots[i]?.muscleId ?? null);
    });
    return () => useAtlas.getState().setPick(null);
  }, [body, model, gl, slot]);

  const frame = useMemo(() => {
    const box = (muscleId && model && boxOfSlots(model, model.byMuscle.get(muscleId) ?? [])) || DEFAULT_BOX;
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

  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault near={0.1} far={20} position={[0, 1, 4]} />
      {body && <ContactShadow feet={getFeet} />}
      {body && <primitive object={body.group} />}
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
