/**
 * Demonstração de uma ação articular: o ângulo percorre a faixa em vaivém (cosseno), começando na posição em pé.
 * Puro. Fase 0..1 = um ciclo: em pé → extremo positivo → extremo negativo → em pé.
 */

/** Segundos por ciclo na velocidade 1×. */
export const DEMO_SECONDS = 4.5;
export const DEMO_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type DemoSpeed = (typeof DEMO_SPEEDS)[number];

const TAU = 2 * Math.PI;

/** Fase do cosseno em que o ângulo vale a posição em pé (0°, preso à faixa), no ramo que sobe. */
function phase0(range: readonly [number, number]): number {
  const [lo, hi] = range;
  const span = hi - lo;
  if (span <= 0) return 0;
  const u = Math.min(1, Math.max(0, (0 - lo) / span));
  return Math.acos(1 - 2 * u) / TAU;
}

/** Ângulo (graus) na fase dada. */
export function demoAngle(range: readonly [number, number], phase: number): number {
  const [lo, hi] = range;
  const u = (1 - Math.cos(TAU * (phase + phase0(range)))) / 2;
  return lo + (hi - lo) * u;
}

/** Fase em que o ângulo vale `deg` no ramo que sobe (o cursor manual devolve a fase). */
export function demoPhaseOf(range: readonly [number, number], deg: number): number {
  const [lo, hi] = range;
  const span = hi - lo;
  if (span <= 0) return 0;
  const u = Math.min(1, Math.max(0, (deg - lo) / span));
  const p = Math.acos(1 - 2 * u) / TAU - phase0(range);
  return ((p % 1) + 1) % 1;
}

/** Avança a fase; sem repetição, para no fim do ciclo (de volta à posição em pé). */
export function advanceDemo(phase: number, dt: number, speed: number, loop: boolean): { phase: number; done: boolean } {
  const p = phase + (Math.max(0, dt) * speed) / DEMO_SECONDS;
  if (p < 1) return { phase: p, done: false };
  return loop ? { phase: p % 1, done: false } : { phase: 0, done: true };
}

/** Deformação para a cor: razão do comprimento sobre o comprimento em pé → −1 (alongado) … +1 (encurtado). */
export const STRAIN_FULL = 0.15;
export function strainOf(length: number, standing: number): number {
  if (standing <= 0) return 0;
  return Math.min(1, Math.max(-1, -(length / standing - 1) / STRAIN_FULL));
}
