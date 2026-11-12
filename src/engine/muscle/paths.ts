import { at } from '../math/arr';
import { distance, mirrorX, sub, type Vec3 } from '../math/vec';
import { pointToWorld } from '../kinematics/fk';
import { mirrorId } from '../kinematics/skeleton';
import type { EngineSkeleton, Pose } from '../kinematics/types';

/** Entrada mínima (o JSON de músculos satisfaz). */
export interface MusclePathInput {
  readonly id: string;
  readonly group: string;
  readonly parts: readonly {
    readonly id: string;
    readonly layer: 'superficial' | 'deep';
    readonly radius: number;
    readonly tendon: readonly [number, number];
    readonly path: readonly { readonly s: string; readonly p: readonly [number, number, number] }[];
  }[];
}

export type Side = 'r' | 'l';

/** Uma parte muscular de um lado, com pontos no frame local dos segmentos. */
export interface MusclePath {
  /** `vastus_lateralis_r` */
  readonly key: string;
  readonly muscleId: string;
  readonly partId: string;
  readonly group: string;
  readonly side: Side;
  readonly layer: 'superficial' | 'deep';
  readonly radius: number;
  readonly tendon: readonly [number, number];
  readonly points: readonly { readonly segment: string; readonly local: Vec3 }[];
}

/**
 * Converte o caminho autorado (mundo neutro, lado direito) em pontos locais
 * e gera o lado esquerdo por espelhamento.
 */
export function buildMusclePaths(sk: EngineSkeleton, muscles: readonly MusclePathInput[]): MusclePath[] {
  const k = sk.stature / 1.75;
  const out: MusclePath[] = [];
  for (const m of muscles) {
    for (const part of m.parts) {
      for (const side of ['r', 'l'] as const) {
        const points = part.path.map((pt) => {
          const segment = side === 'r' ? pt.s : mirrorId(pt.s);
          const origin = sk.neutralOrigin.get(segment);
          if (!origin) throw new Error(`Músculo ${part.id}: segmento ${segment} não existe`);
          const world: Vec3 = [pt.p[0] * k, pt.p[1] * k, pt.p[2] * k];
          const w = side === 'r' ? world : mirrorX(world);
          return { segment, local: sub(w, origin) };
        });
        out.push({
          key: `${part.id}_${side}`,
          muscleId: m.id,
          partId: part.id,
          group: m.group,
          side,
          layer: part.layer,
          radius: part.radius * k,
          tendon: part.tendon,
          points,
        });
      }
    }
  }
  return out;
}

export function pathWorldPoints(pose: Pose, path: MusclePath): Vec3[] {
  return path.points.map((pt) => pointToWorld(pose, pt.segment, pt.local));
}

/** Comprimento músculo-tendão como polilinha pelos pontos de passagem (m). */
export function polylineLength(points: readonly Vec3[]): number {
  let L = 0;
  for (let i = 1; i < points.length; i++) L += distance(at(points, i - 1), at(points, i));
  return L;
}
