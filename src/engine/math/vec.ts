/** Vetores e quatérnios mínimos, imutáveis. O motor não depende de three.js. */

export type Vec3 = readonly [number, number, number];
/** Quatérnio unitário [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

export const DEG = Math.PI / 180;

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const mirrorX = (a: Vec3): Vec3 => [-a[0], a[1], a[2]];

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalize(axis);
  const s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
}

/** Composição a ∘ b: aplica b, depois a. */
export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const quatConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(u×v) + 2u×(u×v), u = parte vetorial
  const u: Vec3 = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}

/** Ângulo (rad) entre dois vetores, em [0, π]. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const c = dot(normalize(a), normalize(b));
  return Math.acos(Math.min(1, Math.max(-1, c)));
}

/** Transformação rígida: posição + orientação. */
export interface Transform {
  readonly position: Vec3;
  readonly rotation: Quat;
}

export const IDENTITY: Transform = { position: [0, 0, 0], rotation: QUAT_IDENTITY };

/** Leva um ponto do frame local para o frame pai. */
export const applyTransform = (t: Transform, p: Vec3): Vec3 => add(t.position, rotate(t.rotation, p));

export function composeTransform(parent: Transform, local: Transform): Transform {
  return {
    position: applyTransform(parent, local.position),
    rotation: quatMul(parent.rotation, local.rotation),
  };
}
