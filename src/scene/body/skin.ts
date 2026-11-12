/**
 * Envelope da pele: união suave de primitivas presas aos segmentos.
 * Autorado em mundo neutro (lado direito, m); o motor posa e malha.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { pointToWorld } from '@/engine/kinematics/fk';
import type { EngineSkeleton, Pose } from '@/engine/kinematics/types';
import { must } from '@/engine/math/arr';
import { meshSdf } from '@/engine/geometry/surfaceNets';
import type { SdfPrimitive } from '@/engine/geometry/sdf';
import { mirrorX, sub, type Vec3 } from '@/engine/math/vec';
import { mirrorId } from '@/engine/kinematics/skeleton';

type SkinDef =
  | { s: string; kind: 'cone'; a: Vec3; b: Vec3; ra: number; rb: number; bilateral: boolean }
  | { s: string; kind: 'ell'; c: Vec3; r: Vec3; bilateral: boolean };

const B = true, M = false;
const SKIN: SkinDef[] = [
  { s: 'head', kind: 'ell', c: [0, 1.645, 0.008], r: [0.078, 0.104, 0.097], bilateral: M },
  { s: 'head', kind: 'cone', a: [0, 1.43, -0.012], b: [0, 1.56, 0.0], ra: 0.06, rb: 0.052, bilateral: M },
  { s: 'trunk', kind: 'ell', c: [0, 1.315, 0.0], r: [0.152, 0.17, 0.106], bilateral: M },
  { s: 'trunk', kind: 'cone', a: [-0.165, 1.425, -0.012], b: [0.165, 1.425, -0.012], ra: 0.058, rb: 0.058, bilateral: M },
  { s: 'trunk', kind: 'ell', c: [0, 1.11, 0.012], r: [0.132, 0.14, 0.096], bilateral: M },
  { s: 'pelvis', kind: 'ell', c: [0, 0.965, -0.005], r: [0.168, 0.11, 0.112], bilateral: M },
  { s: 'pelvis', kind: 'ell', c: [-0.072, 0.9, -0.058], r: [0.085, 0.088, 0.072], bilateral: B },
  { s: 'thigh_r', kind: 'cone', a: [-0.092, 0.885, 0.004], b: [-0.0875, 0.53, 0.004], ra: 0.086, rb: 0.054, bilateral: B },
  { s: 'thigh_r', kind: 'ell', c: [-0.0875, 0.505, 0.012], r: [0.05, 0.058, 0.052], bilateral: B },
  { s: 'shank_r', kind: 'cone', a: [-0.0875, 0.46, -0.008], b: [-0.0875, 0.1, -0.004], ra: 0.052, rb: 0.032, bilateral: B },
  { s: 'shank_r', kind: 'ell', c: [-0.0885, 0.365, -0.03], r: [0.048, 0.088, 0.048], bilateral: B },
  { s: 'foot_r', kind: 'cone', a: [-0.0875, 0.045, -0.038], b: [-0.088, 0.028, 0.165], ra: 0.036, rb: 0.026, bilateral: B },
  { s: 'upperarm_r', kind: 'ell', c: [-0.192, 1.4, -0.01], r: [0.054, 0.068, 0.058], bilateral: B },
  { s: 'upperarm_r', kind: 'cone', a: [-0.186, 1.39, -0.01], b: [-0.185, 1.12, -0.01], ra: 0.047, rb: 0.037, bilateral: B },
  { s: 'forearm_r', kind: 'cone', a: [-0.185, 1.085, -0.01], b: [-0.185, 0.865, -0.01], ra: 0.04, rb: 0.026, bilateral: B },
  { s: 'hand_r', kind: 'ell', c: [-0.185, 0.775, -0.006], r: [0.021, 0.074, 0.044], bilateral: B },
];

/** Primitivas em mundo para uma pose. `tag` = índice do segmento (para amarração rígida futura). */
export function posedSkinPrimitives(sk: EngineSkeleton, pose: Pose, inflate = 0.011): SdfPrimitive[] {
  const k = sk.stature / 1.75;
  const g = inflate * k;
  const segIndex = new Map(sk.segments.map((s, i) => [s.id, i]));
  const out: SdfPrimitive[] = [];
  const sc = (v: Vec3): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
  for (const d of SKIN) {
    const sides: ('r' | 'l')[] = d.bilateral ? ['r', 'l'] : ['r'];
    for (const side of sides) {
      const seg = side === 'r' ? d.s : mirrorId(d.s);
      const flip = (v: Vec3) => (side === 'r' ? sc(v) : mirrorX(sc(v)));
      const o = must(sk.neutralOrigin, seg, 'segmento');
      const toW = (v: Vec3) => pointToWorld(pose, seg, sub(flip(v), o));
      const tag = segIndex.get(seg) ?? 0;
      if (d.kind === 'cone') out.push({ kind: 'roundCone', a: toW(d.a), b: toW(d.b), ra: d.ra * k + g, rb: d.rb * k + g, tag });
      else {
        const r = sc(d.r);
        out.push({ kind: 'ellipsoid', c: toW(d.c), r: [r[0] + g, r[1] + g, r[2] + g], q: must(pose.world, seg, 'segmento').rotation, tag });
      }
    }
  }
  return out;
}

export function buildSkinGeometry(sk: EngineSkeleton, pose: Pose, cell = 0.011): BufferGeometry {
  const mesh = meshSdf(posedSkinPrimitives(sk, pose), { cell, blend: 0.045 });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((mesh.positions.length / 3) * 2), 2));
  g.setIndex(new BufferAttribute(mesh.indices, 1));
  g.computeBoundingSphere();
  return g;
}
