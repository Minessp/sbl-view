/**
 * Câmera do explorador: órbita em volta de um alvo (guinada, arfagem, distância). Puro, sem three.js.
 * Convenção: guinada 0 = câmera em +Z (de frente para o sujeito); −π/2 = câmera em −X (perfil direito do sujeito).
 */
import type { Vec3 } from '@/engine/math/vec';

export interface Orbit {
  readonly yaw: number;
  readonly pitch: number;
  readonly dist: number;
  readonly target: Vec3;
}

export type AtlasView = 'front' | 'back' | 'side';

export const VIEW_YAW: Readonly<Record<AtlasView, number>> = { front: 0, back: Math.PI, side: -Math.PI / 2 };
export const FOV_DEG = 30;
export const PITCH: readonly [number, number] = [-0.7, 1.3];
export const DIST: readonly [number, number] = [0.28, 7.5];
/** Caixa em que o alvo pode andar (m): o corpo com folga; a vista explodida abre no eixo lateral. */
const TARGET_LO: Vec3 = [-2.4, -0.2, -2.4];
const TARGET_HI: Vec3 = [2.4, 2.1, 2.4];
/** Corpo inteiro em pé (pose de referência). */
export const BODY_BOX = { center: [0, 0.9, 0] as Vec3, size: [0.62, 1.82, 0.34] as Vec3 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ângulo em [−π, π). */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

export function clampOrbit(o: Orbit): Orbit {
  return {
    yaw: wrapAngle(o.yaw),
    pitch: clamp(o.pitch, PITCH[0], PITCH[1]),
    dist: clamp(o.dist, DIST[0], DIST[1]),
    target: [clamp(o.target[0], TARGET_LO[0], TARGET_HI[0]), clamp(o.target[1], TARGET_LO[1], TARGET_HI[1]), clamp(o.target[2], TARGET_LO[2], TARGET_HI[2])],
  };
}

export function orbitPosition(o: Orbit): Vec3 {
  const c = Math.cos(o.pitch);
  return [o.target[0] + o.dist * Math.sin(o.yaw) * c, o.target[1] + o.dist * Math.sin(o.pitch), o.target[2] + o.dist * Math.cos(o.yaw) * c];
}

/** Eixos da tela no mundo: direita e cima da câmera. */
export function screenAxes(o: Orbit): { right: Vec3; up: Vec3 } {
  const sy = Math.sin(o.yaw), cy = Math.cos(o.yaw), sp = Math.sin(o.pitch), cp = Math.cos(o.pitch);
  return { right: [cy, 0, -sy], up: [-sp * sy, cp, -sp * cy] };
}

/** Arrasta o alvo no plano da tela; dx, dy em fração da altura da vista (para a direita e para baixo). */
export function panOrbit(o: Orbit, dx: number, dy: number, fovDeg = FOV_DEG): Orbit {
  const span = 2 * o.dist * Math.tan((fovDeg * Math.PI) / 360);
  const { right, up } = screenAxes(o);
  const mx = -dx * span, my = dy * span;
  return clampOrbit({ ...o, target: [o.target[0] + right[0] * mx + up[0] * my, o.target[1] + right[1] * mx + up[1] * my, o.target[2] + right[2] * mx + up[2] * my] });
}

/**
 * Distância para a caixa caber na vista (perspectiva), com margem. Conta a profundidade da caixa (a face da frente
 * fica mais perto) e o lado da caixa visto pela câmera na guinada dada.
 */
export function fitDistance(size: Vec3, yaw: number, aspect: number, margin = 1.18, fovDeg = FOV_DEG): number {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const across = Math.abs(Math.cos(yaw)) * size[0] + Math.abs(Math.sin(yaw)) * size[2];
  const depth = Math.abs(Math.sin(yaw)) * size[0] + Math.abs(Math.cos(yaw)) * size[2];
  const byH = size[1] / 2 / t;
  const byW = across / 2 / (t * Math.max(0.2, aspect));
  return clamp(Math.max(byH, byW) * margin + depth / 2, DIST[0], DIST[1]);
}

/** Aproxima `cur` de `goal` com amortecimento exponencial (guinada pelo caminho mais curto). k = 1 − e^(−dt·taxa). */
export function dampOrbit(cur: Orbit, goal: Orbit, k: number): Orbit {
  const dyaw = wrapAngle(goal.yaw - cur.yaw);
  const f = (a: number, b: number) => a + (b - a) * k;
  return {
    yaw: wrapAngle(cur.yaw + dyaw * k),
    pitch: f(cur.pitch, goal.pitch),
    dist: cur.dist * Math.pow(goal.dist / cur.dist, k),
    target: [f(cur.target[0], goal.target[0]), f(cur.target[1], goal.target[1]), f(cur.target[2], goal.target[2])],
  };
}

/** As duas órbitas são visualmente iguais (para parar de pedir quadro). */
export function orbitsClose(a: Orbit, b: Orbit): boolean {
  return (
    Math.abs(wrapAngle(a.yaw - b.yaw)) < 1e-4 &&
    Math.abs(a.pitch - b.pitch) < 1e-4 &&
    Math.abs(a.dist / b.dist - 1) < 1e-4 &&
    Math.hypot(a.target[0] - b.target[0], a.target[1] - b.target[1], a.target[2] - b.target[2]) < 1e-4
  );
}
