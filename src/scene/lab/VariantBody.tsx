import { OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CylinderGeometry, type Group, MeshBasicMaterial, type OrthographicCamera as OrthoCam, SRGBColorSpace, TorusGeometry, Vector3 } from 'three';
import { muscleDefs } from '@/data';
import { depthAt } from '@/engine/exercises/squat';
import type { Vec3 } from '@/engine/math/vec';
import { relativeCapacity } from '@/engine/muscle/capacity';
import { capacityCurves, getLabBody, makeSolver, variantById } from '@/features/lab/model';
import { useLab } from '@/features/lab/store';
import { useTheme } from '@/ui/theme';
import type { BodyModel } from '../body/model';
import { useBodyInstance } from '../body/useBody';
import { createPalette, readPalette } from '../palette';
import { writeOverlay } from './overlay';

const VISIBLE_HEIGHT = 2.15;
const TARGET = new Vector3(0, 0.93, -0.04);

/** Articulação cujo esforço tinge cada grupo. */
const GROUP_JOINT: Record<string, 'knee' | 'hip' | 'ankle' | undefined> = {
  quadriceps: 'knee',
  gluteals: 'hip',
  adductors: 'hip',
  hamstrings: 'hip',
  triceps_surae: 'ankle',
};
const GROUP_OF = new Map(muscleDefs.map((m) => [m.id, m.group]));

export function VariantBody({ variantId, slot, overlay, model }: { variantId: string; slot: HTMLElement; overlay: HTMLElement | null; model: BodyModel }) {
  const settings = useLab((s) => s.settings);
  const invalidate = useThree((s) => s.invalidate);
  const camRef = useRef<OrthoCam>(null);
  const body = useBodyInstance(model);

  const variant = variantById(variantId);
  const lab = getLabBody(settings);
  const solve = useMemo(() => makeSolver(lab, variant, settings), [lab, variant, settings]);

  // Escala da malha (referência 1,75 m) para o esqueleto do Lab: estatura e comprimento da coxa.
  const scale = useMemo(() => {
    const k = lab.sk.stature / 1.75;
    const thigh = (lab.sk.byId.get('thigh_r')?.tip[1] ?? 1) / (lab.base.byId.get('thigh_r')?.tip[1] ?? 1);
    return (id: string): Vec3 => (id === 'thigh_r' || id === 'thigh_l' ? [k, k * thigh, k] : [k, k, k]);
  }, [lab]);

  const tinted = useMemo(
    () =>
      (['knee', 'hip', 'ankle'] as const).map((joint) => ({
        joint,
        slots: [...model.byMuscle].filter(([id]) => GROUP_JOINT[GROUP_OF.get(id) ?? ''] === joint).flatMap(([, s]) => s),
      })),
    [model],
  );

  useEffect(() => {
    body?.layer('skin', { visible: false });
  }, [body]);

  // ---- Barra (ferro): cilindro e aros; de perfil, um disco cheio taparia o corpo ----
  const palette = useMemo(() => readPalette(createPalette()), []);
  const bar = useMemo(() => {
    const barGeo = new CylinderGeometry(0.0145, 0.0145, 2.0, 10);
    barGeo.rotateZ(Math.PI / 2);
    const plateGeo = new TorusGeometry(0.225, 0.007, 6, 64);
    plateGeo.rotateY(Math.PI / 2);
    const hubGeo = new TorusGeometry(0.03, 0.006, 6, 24);
    hubGeo.rotateY(Math.PI / 2);
    const iron = new MeshBasicMaterial();
    return { barGeo, plateGeo, hubGeo, iron };
  }, []);
  const resolved = useTheme((s) => s.resolved);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const c = readPalette(palette)['ink-2'];
      bar.iron.color.setRGB(c.x, c.y, c.z, SRGBColorSpace);
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [resolved, palette, bar, invalidate]);
  useEffect(
    () => () => {
      bar.barGeo.dispose();
      bar.plateGeo.dispose();
      bar.hubGeo.dispose();
      bar.iron.dispose();
    },
    [bar],
  );

  const barRef = useRef<Group>(null);
  const tmp = useMemo(() => new Vector3(), []);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam || !body) return;
    const rect = slot.getBoundingClientRect();
    cam.zoom = Math.min(rect.height / VISIBLE_HEIGHT, rect.width / 1.25);
    cam.updateProjectionMatrix();

    const { t, effortRef } = useLab.getState();
    const f = solve(depthAt(t));

    const knee = capacityCurves.find((c) => c.joint === 'knee');
    const hip = capacityCurves.find((c) => c.joint === 'hip');
    const effort = {
      knee: Math.max(0, f.demand.knee.moment) / effortRef.knee / (knee ? relativeCapacity(knee, f.angles.knee) : 1),
      hip: Math.max(0, f.demand.hip.moment) / effortRef.hip / (hip ? relativeCapacity(hip, f.angles.hip) : 1),
      ankle: Math.max(0, f.demand.ankle.moment) / effortRef.ankle,
    };
    for (const g of tinted) body.fill('activation', 0.1 + 0.85 * Math.min(1, effort[g.joint]), g.slots);
    body.setPose(lab.sk, f.pose, { scale });

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
      {body && <primitive object={body.group} />}
      <group ref={barRef}>
        <mesh geometry={bar.barGeo} material={bar.iron} />
        <mesh geometry={bar.plateGeo} material={bar.iron} position={[-0.72, 0, 0]} />
        <mesh geometry={bar.plateGeo} material={bar.iron} position={[0.72, 0, 0]} />
        <mesh geometry={bar.hubGeo} material={bar.iron} position={[-0.72, 0, 0]} />
        <mesh geometry={bar.hubGeo} material={bar.iron} position={[0.72, 0, 0]} />
      </group>
    </>
  );
}
