import { must } from '../math/arr';
import { add, mirrorX, scale, sub, type Vec3 } from '../math/vec';
import { pointToWorld } from '../kinematics/fk';
import { mirrorId } from '../kinematics/skeleton';
import type { EngineSkeleton, Pose } from '../kinematics/types';

export interface AnthropometryInput {
  readonly segments: readonly { readonly segment: string; readonly massPct: number; readonly com: readonly [number, number, number] }[];
}

/** Massa pontual presa a um segmento (CM do segmento ou carga externa). */
export interface PointMass {
  readonly id: string;
  readonly segment: string;
  readonly local: Vec3;
  readonly mass: number;
}

/**
 * Massas segmentares para uma massa corporal. Segmentos `_r` geram o par `_l`.
 * O CM autorado na pose neutra (mundo, 1,75 m) é escalado e levado ao frame local.
 */
export function segmentMasses(sk: EngineSkeleton, input: AnthropometryInput, bodyMass: number): PointMass[] {
  const k = sk.stature / 1.75;
  const out: PointMass[] = [];
  for (const s of input.segments) {
    const sides = s.segment.endsWith('_r') ? (['r', 'l'] as const) : (['r'] as const);
    for (const side of sides) {
      const segment = side === 'r' ? s.segment : mirrorId(s.segment);
      const world = scale(s.com as Vec3, k);
      const w = side === 'r' ? world : mirrorX(world);
      out.push({ id: segment, segment, local: sub(w, must(sk.neutralOrigin, segment, 'segmento')), mass: (s.massPct / 100) * bodyMass });
    }
  }
  return out;
}

export const totalMass = (ms: readonly PointMass[]) => ms.reduce((a, m) => a + m.mass, 0);

/** Centro de massa (mundo) de um conjunto de massas pontuais. */
export function centerOfMass(pose: Pose, ms: readonly PointMass[]): Vec3 {
  let acc: Vec3 = [0, 0, 0];
  let M = 0;
  for (const m of ms) {
    acc = add(acc, scale(pointToWorld(pose, m.segment, m.local), m.mass));
    M += m.mass;
  }
  return M > 0 ? scale(acc, 1 / M) : acc;
}
