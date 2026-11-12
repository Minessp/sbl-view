import { at } from '../math/arr';
import { quatConj, rotate, sub, type Quat, type Vec3 } from '../math/vec';

/** Primitivas em coordenadas de mundo (já posadas). */
export type SdfPrimitive =
  | { readonly kind: 'roundCone'; readonly a: Vec3; readonly b: Vec3; readonly ra: number; readonly rb: number; readonly tag: number }
  | { readonly kind: 'ellipsoid'; readonly c: Vec3; readonly r: Vec3; readonly q: Quat; readonly tag: number };

/** União suave polinomial (Quilez). k = raio de arredondamento (m). */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Cone de pontas arredondadas, raios distintos (Quilez, "round cone" arbitrário). */
export function sdRoundCone(p: Vec3, a: Vec3, b: Vec3, r1: number, r2: number): number {
  const ba = sub(b, a);
  const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pa = sub(p, a);
  const y = pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2];
  const z = y - l2;
  const qx = pa[0] * l2 - ba[0] * y;
  const qy = pa[1] * l2 - ba[1] * y;
  const qz = pa[2] * l2 - ba[2] * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Elipsoide (aproximação limitada de Quilez). */
export function sdEllipsoid(p: Vec3, r: Vec3): number {
  const k0 = Math.hypot(p[0] / r[0], p[1] / r[1], p[2] / r[2]);
  const k1 = Math.hypot(p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2]));
  return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}

export function primitiveDistance(prim: SdfPrimitive, p: Vec3): number {
  if (prim.kind === 'roundCone') return sdRoundCone(p, prim.a, prim.b, prim.ra, prim.rb);
  return sdEllipsoid(rotate(quatConj(prim.q), sub(p, prim.c)), prim.r);
}

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

export function primitiveBounds(prim: SdfPrimitive, pad: number): Aabb {
  if (prim.kind === 'roundCone') {
    const r = Math.max(prim.ra, prim.rb) + pad;
    return {
      min: [Math.min(prim.a[0], prim.b[0]) - r, Math.min(prim.a[1], prim.b[1]) - r, Math.min(prim.a[2], prim.b[2]) - r],
      max: [Math.max(prim.a[0], prim.b[0]) + r, Math.max(prim.a[1], prim.b[1]) + r, Math.max(prim.a[2], prim.b[2]) + r],
    };
  }
  const r = Math.max(prim.r[0], prim.r[1], prim.r[2]) + pad;
  return { min: [prim.c[0] - r, prim.c[1] - r, prim.c[2] - r], max: [prim.c[0] + r, prim.c[1] + r, prim.c[2] + r] };
}

/** Distância da união suave + índice da primitiva dominante. */
export function sceneDistance(prims: readonly SdfPrimitive[], p: Vec3, k: number): { d: number; nearest: number } {
  let d = Infinity;
  let best = Infinity;
  let nearest = -1;
  for (let i = 0; i < prims.length; i++) {
    const di = primitiveDistance(at(prims, i), p);
    if (di < best) {
      best = di;
      nearest = i;
    }
    d = d === Infinity ? di : smin(d, di, k);
  }
  return { d, nearest };
}
