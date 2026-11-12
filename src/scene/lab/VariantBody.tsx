import { OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  TorusGeometry,
  type Group,
  type Mesh,
  type OrthographicCamera as OrthoCam,
  Vector3,
} from 'three';
import { depthAt } from '@/engine/exercises/squat';
import { spindleIndices, spindleUVs, vertexCount, writeSpindle } from '@/engine/geometry/spindle';
import { must } from '@/engine/math/arr';
import type { Vec3 } from '@/engine/math/vec';
import { relativeCapacity } from '@/engine/muscle/capacity';
import { pathFlat, pathWorldPoints } from '@/engine/muscle/paths';
import { capacityCurves, getLabBody, makeSolver, variantById } from '@/features/lab/model';
import { useLab } from '@/features/lab/store';
import { useTheme } from '@/ui/theme';
import { buildBones } from '../body/bones';
import { createPlateMaterial, createShared, type PlateMaterial } from '../materials/plate';
import { createPalette, readPalette } from '../palette';
import { writeOverlay } from './overlay';

const LAYOUT = { rings: 22, sides: 10 } as const;
const NO_CUT = { value: 9 };
const NO_GHOST = { value: 0 };
const VISIBLE_HEIGHT = 2.15;
const TARGET = new Vector3(0, 0.93, -0.04);

const GROUP_JOINT: Record<string, 'knee' | 'hip' | 'ankle' | undefined> = {
  quadriceps: 'knee',
  gluteals: 'hip',
  adductors: 'hip',
  hamstrings: 'hip',
  triceps_surae: 'ankle',
};

export function VariantBody({ variantId, slot, overlay }: { variantId: string; slot: HTMLElement; overlay: HTMLElement | null }) {
  const settings = useLab((s) => s.settings);
  const invalidate = useThree((s) => s.invalidate);
  const dpr = useThree((s) => s.viewport.dpr);
  const camRef = useRef<OrthoCam>(null);

  const variant = variantById(variantId);
  const body = getLabBody(settings);
  const solve = useMemo(() => makeSolver(body, variant, settings), [body, variant, settings]);

  // ---- Geometria ----
  const bones = useMemo(() => {
    const geo = buildBones(body.base);
    // A coxa pode estar escalada (proporção / projeção sagital): estica o osso junto.
    const s = (body.sk.byId.get('thigh_r')?.tip[1] ?? 1) / (body.base.byId.get('thigh_r')?.tip[1] ?? 1);
    for (const id of ['thigh_r', 'thigh_l']) geo.get(id)?.scale(1, s, 1);
    return geo;
  }, [body]);
  const muscles = useMemo(
    () =>
      body.paths.map((p) => {
        const n = vertexCount(LAYOUT);
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
        g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3), 3));
        g.setAttribute('uv', new BufferAttribute(spindleUVs(LAYOUT), 2));
        g.setIndex(new BufferAttribute(spindleIndices(LAYOUT), 1));
        return { path: p, geometry: g };
      }),
    [body],
  );
  const barGeo = useMemo(() => {
    const g = new CylinderGeometry(0.0145, 0.0145, 2.0, 10);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);
  // Anilha só como aro: de perfil, um disco cheio taparia o corpo.
  const plateGeo = useMemo(() => {
    const g = new TorusGeometry(0.225, 0.007, 6, 64);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  const hubGeo = useMemo(() => {
    const g = new TorusGeometry(0.03, 0.006, 6, 24);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);

  // ---- Materiais ----
  const palette = useMemo(() => readPalette(createPalette()), []);
  const shared = useMemo(() => createShared(palette, dpr), [palette, dpr]);
  const mats = useMemo(() => {
    const bone = createPlateMaterial(shared, { base: palette.bone, cut: NO_CUT, ghost: NO_GHOST, hatch: 1 });
    const iron = createPlateMaterial(shared, { base: palette['ink-2'], cut: NO_CUT, ghost: NO_GHOST, hatch: 0.6 });
    const muscle = new Map<string, PlateMaterial>();
    for (const m of muscles) {
      muscle.set(m.path.key, createPlateMaterial(shared, { base: palette.bone, cut: NO_CUT, ghost: NO_GHOST, fiber: 1, hatch: 0.8, stain: 0.25 }));
    }
    return { bone, iron, muscle };
  }, [shared, palette, muscles]);

  const resolved = useTheme((s) => s.resolved);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      readPalette(palette);
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [resolved, palette, invalidate]);

  useEffect(
    () => () => {
      bones.forEach((g) => g.dispose());
      muscles.forEach((m) => m.geometry.dispose());
      barGeo.dispose();
      plateGeo.dispose();
      hubGeo.dispose();
      mats.bone.dispose();
      mats.iron.dispose();
      mats.muscle.forEach((m) => m.dispose());
    },
    [bones, muscles, barGeo, plateGeo, hubGeo, mats],
  );

  // ---- Refs de cena ----
  const boneRefs = useRef(new Map<string, Mesh>());
  const barRef = useRef<Group>(null);
  const tmp = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam) return;
    const rect = slot.getBoundingClientRect();
    cam.zoom = Math.min(rect.height / VISIBLE_HEIGHT, rect.width / 1.25);
    cam.updateProjectionMatrix();

    const { t, effortRef } = useLab.getState();
    const f = solve(depthAt(t));

    for (const [seg, mesh] of boneRefs.current) {
      const tr = f.pose.world.get(seg);
      if (!tr) continue;
      mesh.position.set(tr.position[0], tr.position[1], tr.position[2]);
      mesh.quaternion.set(tr.rotation[0], tr.rotation[1], tr.rotation[2], tr.rotation[3]);
    }

    const knee = capacityCurves.find((c) => c.joint === 'knee');
    const hip = capacityCurves.find((c) => c.joint === 'hip');
    const effort = {
      knee: Math.max(0, f.demand.knee.moment) / effortRef.knee / (knee ? relativeCapacity(knee, f.angles.knee) : 1),
      hip: Math.max(0, f.demand.hip.moment) / effortRef.hip / (hip ? relativeCapacity(hip, f.angles.hip) : 1),
      ankle: Math.max(0, f.demand.ankle.moment) / effortRef.ankle,
    };

    for (const m of muscles) {
      const pos = m.geometry.getAttribute('position') as BufferAttribute;
      const nor = m.geometry.getAttribute('normal') as BufferAttribute;
      writeSpindle(LAYOUT, pathWorldPoints(f.pose, m.path), m.path.radius, m.path.tendon, pos.array as Float32Array, nor.array as Float32Array, pathFlat(f.pose, m.path));
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      m.geometry.computeBoundingSphere();
      const joint = GROUP_JOINT[m.path.group];
      const mat = must(mats.muscle, m.path.key);
      mat.uniforms.uStain.value = joint ? 0.18 + 0.77 * Math.min(1, effort[joint]) : 0.18;
    }

    if (barRef.current) barRef.current.position.set(0, f.load[1], f.load[2]);

    const project = (v: Vec3) => {
      tmp.set(v[0], v[1], v[2]).project(cam);
      return [(tmp.x * 0.5 + 0.5) * rect.width, (-tmp.y * 0.5 + 0.5) * rect.height] as const;
    };
    if (overlay) {
      // O overlay vive na camada do palco (acima do canvas); acompanha o retângulo do slot.
      overlay.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      writeOverlay(overlay, f, project);
    }
  });

  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault position={[-4, TARGET.y, TARGET.z]} near={0.1} far={20} onUpdate={(c) => c.lookAt(TARGET)} />
      {[...bones.entries()].map(([seg, g]) => (
        <mesh
          key={seg}
          geometry={g}
          material={mats.bone}
          ref={(m) => {
            if (m) boneRefs.current.set(seg, m);
            else boneRefs.current.delete(seg);
          }}
        />
      ))}
      {muscles.map((m) => (
        <mesh key={m.path.key} geometry={m.geometry} material={must(mats.muscle, m.path.key)} frustumCulled={false} />
      ))}
      <group ref={barRef}>
        <mesh geometry={barGeo} material={mats.iron} />
        <mesh geometry={plateGeo} material={mats.iron} position={[-0.72, 0, 0]} />
        <mesh geometry={plateGeo} material={mats.iron} position={[0.72, 0, 0]} />
        <mesh geometry={hubGeo} material={mats.iron} position={[-0.72, 0, 0]} />
        <mesh geometry={hubGeo} material={mats.iron} position={[0.72, 0, 0]} />
      </group>
    </>
  );
}
