/**
 * Demonstração de uma ação articular: o ângulo vai da ponta em que o músculo está alongado à ponta em que está
 * encurtado e volta (cosseno). Puro. Fase 0..1 = um ciclo: alongado → encurtado (½) → alongado.
 */

/** Segundos por ciclo na velocidade 1×. */
export const DEMO_SECONDS = 4.5;
export const DEMO_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type DemoSpeed = (typeof DEMO_SPEEDS)[number];

const TAU = 2 * Math.PI;

/**
 * Pontas da ação: o músculo encurta quando a junta gira no sentido do movimento (`sign`), então começa na ponta oposta.
 */
export function demoEnds(range: readonly [number, number], sign: 1 | -1): { from: number; to: number } {
  return sign > 0 ? { from: range[0], to: range[1] } : { from: range[1], to: range[0] };
}

/** Ângulo (graus) na fase dada. */
export function demoAngle(from: number, to: number, phase: number): number {
  return from + (to - from) * ((1 - Math.cos(TAU * phase)) / 2);
}

/** Fase em que o ângulo vale `deg` na ida (alongado → encurtado); o cursor manual devolve a fase. */
export function demoPhaseOf(from: number, to: number, deg: number): number {
  if (to === from) return 0;
  const u = Math.min(1, Math.max(0, (deg - from) / (to - from)));
  return Math.acos(1 - 2 * u) / TAU;
}

/** Metade do ciclo em que o músculo encurta (ida) ou alonga (volta). */
export const demoStage = (phase: number): 'shortening' | 'lengthening' => (((phase % 1) + 1) % 1 < 0.5 ? 'shortening' : 'lengthening');

/** Entrada suave da pose em pé até a ponta alongada (s). */
export const DEMO_ENTER_SECONDS = 0.6;
/** Suavização da entrada: 0 = em pé, 1 = pose da demonstração. */
export const enterEase = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Avança a fase; sem repetição, para no fim do ciclo (de volta à ponta alongada). */
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
