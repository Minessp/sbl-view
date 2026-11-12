import { cross, dot, normalize, scale, sub, type Vec3 } from '../math/vec';

type V2 = readonly [number, number];

const wrapAngle = (a: number) => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};

/** Distância da origem ao segmento p→q (2D). */
function segmentDistance(p: V2, q: V2): number {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, -(p[0] * dx + p[1] * dy) / l2)) : 0;
  return Math.hypot(p[0] + t * dx, p[1] + t * dy);
}

/**
 * Comprimento do caminho p→q que contorna um círculo de raio r na origem (2D), pelo lado `side`.
 * Se a reta não penetra o círculo, é a distância reta. Ponto dentro do círculo: reta (degenerado).
 */
export function wrappedLength2D(p: V2, q: V2, r: number, side: V2): { length: number; wrapped: boolean } {
  const straight = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const dp = Math.hypot(p[0], p[1]);
  const dq = Math.hypot(q[0], q[1]);
  if (dp <= r || dq <= r || segmentDistance(p, q) >= r) return { length: straight, wrapped: false };

  const tp = Math.atan2(p[1], p[0]), ap = Math.acos(r / dp);
  const tq = Math.atan2(q[1], q[0]), aq = Math.acos(r / dq);
  const phiSide = Math.atan2(side[1], side[0]);
  let best = { score: -Infinity, length: straight };
  for (const s of [1, -1]) {
    const t1 = tp + s * ap;
    const t2 = tq - s * aq;
    const delta = wrapAngle(t2 - t1);
    const mid = t1 + delta / 2;
    const score = Math.cos(mid - phiSide);
    const T1: V2 = [r * Math.cos(t1), r * Math.sin(t1)];
    const T2: V2 = [r * Math.cos(t2), r * Math.sin(t2)];
    const L = Math.hypot(T1[0] - p[0], T1[1] - p[1]) + r * Math.abs(delta) + Math.hypot(q[0] - T2[0], q[1] - T2[1]);
    if (score > best.score) best = { score, length: L };
  }
  return { length: best.length, wrapped: true };
}

/**
 * Contorno de cilindro em 3D (eixo `axis`, centro `c`, raio r): resolve no plano perpendicular
 * e soma a variação ao longo do eixo como hélice.
 */
export function wrappedLength3D(P: Vec3, Q: Vec3, c: Vec3, axis: Vec3, r: number, side: Vec3): { length: number; wrapped: boolean } {
  const a = normalize(axis);
  const helper: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(a, helper));
  const v = cross(a, u);
  const to2 = (X: Vec3): V2 => {
    const d = sub(X, c);
    return [dot(d, u), dot(d, v)];
  };
  const s3 = sub(side, scale(a, dot(side, a)));
  const res = wrappedLength2D(to2(P), to2(Q), r, [dot(s3, u), dot(s3, v)]);
  const dAxis = dot(sub(Q, P), a);
  return { length: Math.hypot(res.length, dAxis), wrapped: res.wrapped };
}
