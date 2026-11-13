/**
 * Calculadora de anilhas: quais anilhas pôr de cada lado para chegar à carga total com a barra.
 * Guloso da maior para a menor (com anilhas de jogo comum, é o mínimo de anilhas). Sem unidade.
 */

export interface PlateResult {
  perSide: number[];
  /** Total que dá para montar. */
  total: number;
  /** O que faltou para a carga pedida (menor que 2 × a menor anilha). */
  remainder: number;
}

export function platesPerSide(target: number, bar: number, plates: readonly number[]): PlateResult | undefined {
  if (!(target >= bar) || !(bar >= 0)) return undefined;
  const sorted = [...plates].filter((p) => p > 0).sort((a, b) => b - a);
  let side = (target - bar) / 2;
  const perSide: number[] = [];
  for (const p of sorted) {
    while (side >= p - 1e-9) {
      perSide.push(p);
      side -= p;
    }
  }
  const total = Math.round((bar + 2 * perSide.reduce((s, p) => s + p, 0)) * 1000) / 1000;
  return { perSide, total, remainder: Math.round((target - total) * 1000) / 1000 };
}
