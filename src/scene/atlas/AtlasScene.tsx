import { OrthographicCamera, View } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, type OrthographicCamera as OrthoCam, Vector3 } from 'three';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { bilateral, degToAngles } from '@/engine/kinematics/skeleton';
import { sampleCurve, spindleIndices, spindleUVs, vertexCount, writeSpindle, type SpindleFlat } from '@/engine/geometry/spindle';
import { must } from '@/engine/math/arr';
import type { Vec3 } from '@/engine/math/vec';
import { pathFlat, pathWorldPoints, type MusclePath } from '@/engine/muscle/paths';
import { atlasBody } from '@/features/atlas/model';
import { useAtlas, type AtlasView } from '@/features/atlas/store';
import { useTheme } from '@/ui/theme';
import { buildBones } from '../body/bones';
import { createPlateMaterial, createShared, type PlateMaterial } from '../materials/plate';
import { createPalette, readPalette } from '../palette';
import { useStage } from '../stageStore';

const LAYOUT = { rings: 30, sides: 12 } as const;
const POSE = degToAngles(bilateral({ shoulder_abd: 13, elbow_flex: 8, hip_abd: 2.5 }));
const ON = 0.92;
const OFF = 0.07;
/** Câmera: direção de onde olha (o sujeito olha +Z; o lado direito dele fica em −X). */
const DIR: Record<AtlasView, Vec3> = { front: [0, 0, 1], back: [0, 0, -1], side: [-1, 0, 0] };

function spindleGeometry(points: Vec3[], path: MusclePath, flat: SpindleFlat | null): BufferGeometry {
  const n = vertexCount(LAYOUT);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  writeSpindle(LAYOUT, points, path.radius, path.tendon, pos, nor, flat);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(spindleUVs(LAYOUT), 2));
  g.setIndex(new BufferAttribute(spindleIndices(LAYOUT), 1));
  g.computeBoundingSphere();
  return g;
}

/** Caixa do músculo (os dois lados), para enquadrar. */
function frameFor(points: Vec3[][]): { center: Vec3; size: Vec3 } {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const pts of points) for (const p of pts) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k] ?? Infinity, p[k] ?? 0);
    hi[k] = Math.max(hi[k] ?? -Infinity, p[k] ?? 0);
  }
  return { center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

function AtlasBody({ slot }: { slot: HTMLElement }) {
  const invalidate = useThree((s) => s.invalidate);
  const dpr = useThree((s) => s.viewport.dpr);
  const camRef = useRef<OrthoCam>(null);

  const model = useMemo(() => {
    const { sk, paths } = atlasBody();
    const pose = forwardKinematics(sk, POSE);
    const muscles = paths.map((p) => {
      const pts = pathWorldPoints(pose, p);
      return { path: p, points: pts, geometry: spindleGeometry(pts, p, pathFlat(pose, p)) };
    });
    return { sk, pose, muscles, bones: buildBones(sk) };
  }, []);

  const palette = useMemo(() => readPalette(createPalette()), []);
  const shared = useMemo(() => createShared(palette, dpr), [palette, dpr]);
  const mats = useMemo(() => {
    const bone = createPlateMaterial(shared, { base: palette.bone, cut: { value: 9 }, ghost: { value: 0 }, hatch: 1 });
    const muscle = new Map<string, PlateMaterial>();
    for (const m of model.muscles) {
      // Corte por músculo: 9 = sólido; −9 = tudo vira fantasma (só contorno pontilhado).
      muscle.set(m.path.key, createPlateMaterial(shared, { base: palette.bone, cut: { value: 9 }, ghost: { value: 0.38 }, fiber: 1, hatch: 0.85, stain: OFF }));
    }
    return { bone, muscle };
  }, [shared, palette, model]);

  useEffect(
    () => () => {
      model.bones.forEach((g) => g.dispose());
      model.muscles.forEach((m) => m.geometry.dispose());
      mats.bone.dispose();
      mats.muscle.forEach((m) => m.dispose());
    },
    [model, mats],
  );

  const resolved = useTheme((s) => s.resolved);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      readPalette(palette);
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [resolved, palette, invalidate]);

  // Destaque: o alvo em eosina; se for profundo, os superficiais viram fantasma para ele aparecer.
  const muscleId = useAtlas((s) => s.muscleId);
  const view = useAtlas((s) => s.view);
  const target = useMemo(() => model.muscles.filter((m) => m.path.muscleId === muscleId), [model, muscleId]);
  useEffect(() => {
    const deep = target.length > 0 && target.every((m) => m.path.layer === 'deep');
    for (const m of model.muscles) {
      const mat = must(mats.muscle, m.path.key);
      const on = m.path.muscleId === muscleId;
      mat.uniforms.uStain.value = on ? ON : OFF;
      mat.uniforms.uCut.value = !on && deep && m.path.layer === 'superficial' ? -9 : 9;
    }
    invalidate();
  }, [model, mats, muscleId, target, invalidate]);

  const frame = useMemo(() => {
    const box = target.length ? frameFor(target.map((m) => sampleCurve(m.points, 9))) : { center: [0, 0.93, 0] as Vec3, size: [0.5, 1.8, 0.3] as Vec3 };
    const h = Math.min(1.95, Math.max(0.75, box.size[1] * 2.2));
    const cy = Math.min(1.82 - h / 2, Math.max(h / 2 - 0.04, box.center[1]));
    const across = view === 'side' ? box.size[2] : box.size[0];
    const w = Math.max(0.55, across * 1.35 + 0.12, h * 0.42);
    return { cy, h, w, cz: view === 'side' ? box.center[2] : 0 };
  }, [target, view]);

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
      {model.muscles.map((m) => (
        <mesh key={m.path.key} geometry={m.geometry} material={must(mats.muscle, m.path.key)} renderOrder={m.path.layer === 'deep' ? 1 : 2} />
      ))}
      {[...model.bones.entries()].map(([seg, g]) => {
        const tr = must(model.pose.world, seg, 'segmento');
        return (
          <mesh
            key={seg}
            geometry={g}
            material={mats.bone}
            position={tr.position as [number, number, number]}
            quaternion={tr.rotation as [number, number, number, number]}
          />
        );
      })}
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
