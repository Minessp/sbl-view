/**
 * Mistura de duas poses (troca de rota sem corte: a pose de saída vira a da página nova).
 * Graus por DOF em linha reta; raiz com posição linear e rotação por slerp no caminho curto.
 */
import type { Quat, Transform } from '../math/vec';

/** DOF ausente de um lado vale 0 (a pose neutra do DOF). */
export function blendDeg(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>, k: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[d] ?? 0;
    out[d] = x + ((b[d] ?? 0) - x) * k;
  }
  return out;
}

export function slerp(a: Quat, b: Quat, k: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  // q e −q são a mesma rotação: vai pelo caminho curto.
  const s = d < 0 ? -1 : 1;
  d *= s;
  let ka: number, kb: number;
  if (d > 0.9995) {
    ka = 1 - k;
    kb = k * s;
  } else {
    const th = Math.acos(d);
    const sin = Math.sin(th);
    ka = Math.sin((1 - k) * th) / sin;
    kb = (Math.sin(k * th) / sin) * s;
  }
  const q = [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb, a[3] * ka + b[3] * kb] as const;
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function blendRoot(a: Transform, b: Transform, k: number): Transform {
  const p = a.position, q = b.position;
  return { position: [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k], rotation: slerp(a.rotation, b.rotation, k) };
}
