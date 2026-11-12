import { at, must } from '../math/arr';
import { distance, mirrorX, rotate, sub, type Vec3 } from '../math/vec';
import { pointToWorld } from '../kinematics/fk';
import { mirrorId } from '../kinematics/skeleton';
import type { EngineSkeleton, Pose } from '../kinematics/types';
import { wrappedLength3D } from './wrap';

type Tuple3 = readonly [number, number, number];

/** Entrada mínima (o JSON de músculos satisfaz). */
export interface MusclePathInput {
  readonly id: string;
  readonly group: string;
  readonly parts: readonly {
    readonly id: string;
    readonly layer: 'superficial' | 'deep';
    readonly radius: number;
    readonly tendon: readonly [number, number];
    readonly path: readonly { readonly s: string; readonly p: Tuple3 }[];
    readonly wrap?: { readonly span: number; readonly segment: string; readonly center: Tuple3; readonly radius: number; readonly side: Tuple3 } | undefined;
  }[];
}

export type Side = 'r' | 'l';

export interface PathWrap {
  readonly span: number;
  readonly segment: string;
  readonly center: Vec3;
  readonly radius: number;
  readonly side: Vec3;
}

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
  readonly wrap: PathWrap | null;
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
        const seg = (s: string) => (side === 'r' ? s : mirrorId(s));
        const place = (p: Tuple3): Vec3 => {
          const w: Vec3 = [p[0] * k, p[1] * k, p[2] * k];
          return side === 'r' ? w : mirrorX(w);
        };
        const points = part.path.map((pt) => {
          const segment = seg(pt.s);
          const origin = sk.neutralOrigin.get(segment);
          if (!origin) throw new Error(`Músculo ${part.id}: segmento ${segment} não existe`);
          return { segment, local: sub(place(pt.p), origin) };
        });
        let wrap: PathWrap | null = null;
        if (part.wrap) {
          const segment = seg(part.wrap.segment);
          if (part.wrap.span >= points.length - 1) throw new Error(`Músculo ${part.id}: contorno fora do caminho`);
          const sideV: Vec3 = [part.wrap.side[0], part.wrap.side[1], part.wrap.side[2]];
          wrap = {
            span: part.wrap.span,
            segment,
            center: sub(place(part.wrap.center), must(sk.neutralOrigin, segment, 'segmento')),
            radius: part.wrap.radius * k,
            side: side === 'r' ? sideV : mirrorX(sideV),
          };
        }
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
          wrap,
        });
      }
    }
  }
  return out;
}

export function pathWorldPoints(pose: Pose, path: MusclePath): Vec3[] {
  return path.points.map((pt) => pointToWorld(pose, pt.segment, pt.local));
}

/** Comprimento como polilinha pelos pontos de passagem (m). */
export function polylineLength(points: readonly Vec3[]): number {
  let L = 0;
  for (let i = 1; i < points.length; i++) L += distance(at(points, i - 1), at(points, i));
  return L;
}

/**
 * Comprimento músculo-tendão (m): polilinha pelos pontos de passagem, com contorno de cilindro
 * no trecho indicado. Modelo geométrico simplificado, não medição.
 */
export function mtuLength(pose: Pose, path: MusclePath): number {
  const pts = pathWorldPoints(pose, path);
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const P = at(pts, i - 1), Q = at(pts, i);
    if (path.wrap && path.wrap.span === i - 1) {
      const t = must(pose.world, path.wrap.segment, 'segmento');
      const c = pointToWorld(pose, path.wrap.segment, path.wrap.center);
      const axis = rotate(t.rotation, [1, 0, 0]);
      const side = rotate(t.rotation, path.wrap.side);
      L += wrappedLength3D(P, Q, c, axis, path.wrap.radius, side).length;
    } else {
      L += distance(P, Q);
    }
  }
  return L;
}
