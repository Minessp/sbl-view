/**
 * Contas do voo entre rotas (sem three): o recorte do corpo desliza, a câmera faz um arco em torno do assunto.
 */
import type { Vec3 } from '@/engine/math/vec';
import type { Rect, Shot } from './handoff';

/** Duração do voo (câmera, recorte); a pose chega antes (70%), o equipamento se monta em 35–100%. */
export const SHOT_MS = 900;

/** In-out cúbica. */
export function shotEase(k: number): number {
  const x = Math.min(1, Math.max(0, k));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Trecho [a, b] do voo remapeado para 0..1. */
export const window01 = (k: number, a: number, b: number) => Math.min(1, Math.max(0, (k - a) / (b - a)));

export function lerpRect(a: Rect, b: Rect, k: number): Rect {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

type Cam = Shot['camera'];

function spherical(pos: Vec3, target: Vec3) {
  const d: Vec3 = [pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]];
  const dist = Math.max(1e-6, Math.hypot(d[0], d[1], d[2]));
  return { dist, yaw: Math.atan2(d[0], d[2]), pitch: Math.asin(Math.min(1, Math.max(-1, d[1] / dist))) };
}

/** Alvo em linha reta; posição em arco em torno do alvo (ângulo pelo caminho curto, distância em escala log). */
export function arcCamera(a: Cam, b: Cam, k: number): Cam {
  const target: Vec3 = [a.target[0] + (b.target[0] - a.target[0]) * k, a.target[1] + (b.target[1] - a.target[1]) * k, a.target[2] + (b.target[2] - a.target[2]) * k];
  const sa = spherical(a.pos, a.target), sb = spherical(b.pos, b.target);
  let dy = sb.yaw - sa.yaw;
  dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
  const yaw = sa.yaw + dy * k;
  const pitch = sa.pitch + (sb.pitch - sa.pitch) * k;
  const dist = Math.exp(Math.log(sa.dist) + (Math.log(sb.dist) - Math.log(sa.dist)) * k);
  const c = Math.cos(pitch);
  const pos: Vec3 = [target[0] + dist * c * Math.sin(yaw), target[1] + dist * Math.sin(pitch), target[2] + dist * c * Math.cos(yaw)];
  return { pos, target, fovDeg: a.fovDeg + (b.fovDeg - a.fovDeg) * k };
}
