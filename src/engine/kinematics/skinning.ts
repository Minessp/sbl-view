import { must } from '../math/arr';
import { rotate, type Transform, type Vec3 } from '../math/vec';
import type { EngineSkeleton, Pose } from './types';

/**
 * Skinning linear (LBS) na CPU. Referência do shader e base dos testes de deformação.
 *
 * Pose de ligação: a neutra, com todos os frames paralelos ao mundo. Logo a matriz de skinning da junta j é
 * M_j(p) = R_j · (p − o_j) + t_j, onde (t_j, R_j) é a transformação mundo do segmento na pose e o_j a origem neutra.
 */

export interface SkinMatrixOptions {
  /** Origem de ligação de cada junta (a da malha). Padrão: a neutra do próprio esqueleto. */
  readonly bind?: ReadonlyMap<string, Vec3>;
  /** Escala no frame local do segmento (diagonal), aplicada antes de girar. Padrão: nenhuma. */
  readonly scale?: (id: string) => Vec3 | undefined;
}

/**
 * 12 números por junta: matriz 3×3 linha a linha e a translação final (t − R·S·o).
 * Com `scale`, M = R·S·(p − o) + t: a malha da estatura de referência acompanha um esqueleto escalado.
 */
export function skinMatrices(sk: EngineSkeleton, pose: Pose, jointIds: readonly string[], opts: SkinMatrixOptions = {}): Float64Array {
  const out = new Float64Array(jointIds.length * 12);
  jointIds.forEach((id, j) => {
    const t: Transform = must(pose.world, id, 'segmento');
    const o = opts.bind?.get(id) ?? must(sk.neutralOrigin, id, 'segmento');
    const [sx, sy, sz] = opts.scale?.(id) ?? [1, 1, 1];
    const ex = rotate(t.rotation, [sx, 0, 0]);
    const ey = rotate(t.rotation, [0, sy, 0]);
    const ez = rotate(t.rotation, [0, 0, sz]);
    const ro = [ex[0] * o[0] + ey[0] * o[1] + ez[0] * o[2], ex[1] * o[0] + ey[1] * o[1] + ez[1] * o[2], ex[2] * o[0] + ey[2] * o[1] + ez[2] * o[2]] as const;
    out.set([ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2], t.position[0] - ro[0], t.position[1] - ro[1], t.position[2] - ro[2]], j * 12);
  });
  return out;
}

/** Um ponto pela matriz m (índice da junta em `matrices`). */
export function skinPoint(matrices: Float64Array, j: number, x: number, y: number, z: number, out: [number, number, number]): [number, number, number] {
  const m = j * 12;
  const M = (k: number) => matrices[m + k] ?? 0;
  out[0] = M(0) * x + M(1) * y + M(2) * z + M(9);
  out[1] = M(3) * x + M(4) * y + M(5) * z + M(10);
  out[2] = M(6) * x + M(7) * y + M(8) * z + M(11);
  return out;
}

export interface SkinInput {
  /** Posições de ligação, 3 por vértice (lado direito ou linha média). */
  readonly positions: Float32Array;
  /** 4 juntas por vértice. */
  readonly joints: Uint8Array;
  /** 4 pesos por vértice, somam 1. */
  readonly weights: Float32Array;
}

/**
 * Posições posadas. Com `mirror` (índice da junta espelhada), gera a cópia do lado esquerdo:
 * x → −x na ligação e cada junta troca pela do outro lado.
 */
export function skinPositions(input: SkinInput, matrices: Float64Array, mirror?: Uint8Array, out?: Float32Array): Float32Array {
  const { positions: P, joints: Jn, weights: W } = input;
  const n = P.length / 3;
  const res = out ?? new Float32Array(n * 3);
  const sx = mirror ? -1 : 1;
  for (let v = 0; v < n; v++) {
    const x = sx * (P[v * 3] ?? 0), y = P[v * 3 + 1] ?? 0, z = P[v * 3 + 2] ?? 0;
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < 4; k++) {
      const w = W[v * 4 + k] ?? 0;
      if (w === 0) continue;
      const j0 = Jn[v * 4 + k] ?? 0;
      const m = (mirror ? (mirror[j0] ?? j0) : j0) * 12;
      ax += w * ((matrices[m] ?? 0) * x + (matrices[m + 1] ?? 0) * y + (matrices[m + 2] ?? 0) * z + (matrices[m + 9] ?? 0));
      ay += w * ((matrices[m + 3] ?? 0) * x + (matrices[m + 4] ?? 0) * y + (matrices[m + 5] ?? 0) * z + (matrices[m + 10] ?? 0));
      az += w * ((matrices[m + 6] ?? 0) * x + (matrices[m + 7] ?? 0) * y + (matrices[m + 8] ?? 0) * z + (matrices[m + 11] ?? 0));
    }
    res[v * 3] = ax;
    res[v * 3 + 1] = ay;
    res[v * 3 + 2] = az;
  }
  return res;
}
