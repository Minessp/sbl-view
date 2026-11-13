/**
 * Escala do mapa de calor: séries diretas por semana em 6 degraus fixos (absolutos, não relativos
 * ao maior valor), para o corpo e a legenda dizerem a mesma coisa em qualquer plano.
 */
export const HEAT_STEPS = [0, 1, 5, 10, 15, 20] as const;
export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5;

export function heatLevel(sets: number): HeatLevel {
  let l = 0;
  for (let i = 1; i < HEAT_STEPS.length; i++) if (sets >= (HEAT_STEPS[i] ?? Infinity)) l = i;
  return l as HeatLevel;
}

/** Intensidade da eosina no 3D para cada degrau (0 = quase sem cor). */
export const HEAT_STAIN: Record<HeatLevel, number> = { 0: 0.05, 1: 0.2, 2: 0.38, 3: 0.56, 4: 0.74, 5: 0.92 };

/** Rótulo do degrau: "1 a 4", "20 ou mais". */
export function heatRange(l: HeatLevel): [number, number | null] {
  const lo = HEAT_STEPS[l];
  const hi = l < 5 ? (HEAT_STEPS[l + 1] ?? 0) - 1 : null;
  return [lo, l === 0 ? 0 : hi];
}
