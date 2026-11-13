/**
 * Progressão dupla: dentro da faixa de repetições, sobe repetição; quando todas as séries na carga
 * mais alta chegam ao topo da faixa, sobe a carga e volta ao início da faixa. Sem unidade: carga e
 * incremento chegam na mesma (kg ou lb).
 */

export interface LoggedSet {
  load: number;
  reps: number;
}

export type SuggestReason = 'up' | 'hold' | 'down' | 'reps';

export interface Suggestion {
  load: number;
  /** Repetições-alvo da primeira série. */
  reps: number;
  reason: SuggestReason;
}

/** Arredonda para o passo (0 = sem arredondar), sem ruído de ponto flutuante. */
export const roundTo = (x: number, step: number): number => (step > 0 ? Math.round(Math.round(x / step) * step * 1000) / 1000 : Math.round(x * 1000) / 1000);

/**
 * Sugestão para hoje a partir das séries de trabalho da última sessão do exercício.
 * - todas as séries na carga mais alta ≥ topo da faixa: carga + incremento, reps = início ('up');
 * - a melhor série nessa carga abaixo do início da faixa: carga − incremento ('down');
 * - senão, mesma carga, uma repetição a mais que a pior série, até o topo ('hold');
 * - incremento 0 (peso do corpo): só repetições, uma a mais que a melhor ('reps').
 */
export function doubleProgression(last: readonly LoggedSet[], range: readonly [number, number], increment: number): Suggestion | undefined {
  const work = last.filter((s) => s.reps > 0 && s.load >= 0);
  if (work.length === 0) return undefined;
  const [lo, hi] = range;
  const top = Math.max(...work.map((s) => s.load));
  const atTop = work.filter((s) => s.load === top).map((s) => s.reps);
  const best = Math.max(...atTop);
  const worst = Math.min(...atTop);
  if (increment <= 0) return { load: top, reps: best + 1, reason: 'reps' };
  if (worst >= hi) return { load: roundTo(top + increment, 0), reps: lo, reason: 'up' };
  if (best < lo && top - increment >= 0) return { load: roundTo(top - increment, 0), reps: lo, reason: 'down' };
  return { load: top, reps: Math.min(hi, Math.max(lo, worst + 1)), reason: 'hold' };
}
