/**
 * Divisões de treino: quais focos cada dia da semana recebe. Puro: os grupos de cada foco chegam
 * por parâmetro (vêm do Atlas, na camada de feature).
 */
import type { DayFocus, SplitDay } from './types';

export type SplitId = 'full_body' | 'upper_lower' | 'ppl' | 'ppl_ul' | 'arnold' | 'torso_limbs' | 'body_part' | 'custom';
export const SPLIT_IDS: readonly SplitId[] = ['full_body', 'upper_lower', 'ppl', 'ppl_ul', 'arnold', 'torso_limbs', 'body_part', 'custom'];

const cycle = (pattern: readonly DayFocus[], n: number): DayFocus[] => Array.from({ length: n }, (_, i) => pattern[i % pattern.length] ?? 'full');

interface SplitTemplate {
  /** Dias por semana que a divisão aceita. */
  days: readonly number[];
  focus: (n: number) => DayFocus[];
}

export const SPLITS: Readonly<Record<Exclude<SplitId, 'custom'>, SplitTemplate>> = {
  full_body: { days: [1, 2, 3, 4, 5, 6], focus: (n) => cycle(['full'], n) },
  // 3 e 5 dias: o dia que sobra é de corpo inteiro (S/I/C e S/I/C/S/I), para a semana fechar igual.
  upper_lower: {
    days: [2, 3, 4, 5, 6],
    focus: (n) => (n === 3 ? ['upper', 'lower', 'full'] : n === 5 ? ['upper', 'lower', 'full', 'upper', 'lower'] : cycle(['upper', 'lower'], n)),
  },
  ppl: { days: [3, 6], focus: (n) => cycle(['push', 'pull', 'legs'], n) },
  ppl_ul: { days: [5], focus: () => ['push', 'pull', 'legs', 'upper', 'lower'] },
  arnold: { days: [3, 6], focus: (n) => cycle(['chest_back', 'shoulders_arms', 'legs'], n) },
  torso_limbs: { days: [2, 3, 4, 5, 6], focus: (n) => cycle(['torso', 'limbs'], n) },
  body_part: {
    days: [4, 5, 6],
    focus: (n) => (n === 4 ? ['chest', 'back', 'legs', 'shoulders_arms'] : cycle(['chest', 'back', 'legs', 'shoulders', 'arms'], n)),
  },
};

export const CUSTOM_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

export const daysAllowed = (id: SplitId): readonly number[] => (id === 'custom' ? CUSTOM_DAYS : SPLITS[id].days);

/** Número de dias mais perto do pedido que a divisão aceita (empate: o menor). */
export function fitDays(id: SplitId, wanted: number): number {
  const ok = daysAllowed(id);
  let best = ok[0] ?? wanted;
  for (const n of ok) if (Math.abs(n - wanted) < Math.abs(best - wanted)) best = n;
  return best;
}

/**
 * Dias da divisão. `groupsOf` diz os grupos de cada foco (`null` = qualquer); no personalizado,
 * `custom[i]` são os grupos do dia i escolhidos pela pessoa.
 */
export function splitDays(id: SplitId, n: number, groupsOf: (f: DayFocus) => readonly string[] | null, custom: readonly (readonly string[])[] = []): SplitDay[] {
  if (id === 'custom') return Array.from({ length: n }, (_, i) => ({ focus: 'custom' as const, groups: [...(custom[i] ?? [])] }));
  return SPLITS[id].focus(fitDays(id, n)).map((focus) => ({ focus, groups: groupsOf(focus) }));
}

/** Divisão que um plano antigo (sem `split`) usava: até 3 dias corpo inteiro, senão superior/inferior. */
export const legacySplit = (days: number): SplitId => (days <= 3 ? 'full_body' : 'upper_lower');

/** Grupos com meta que nenhum dia da divisão aceita: ficam sem séries. */
export function unplacedGroups(split: readonly SplitDay[], targets: Readonly<Record<string, number>>): string[] {
  return Object.entries(targets)
    .filter(([g, n]) => n > 0 && !split.some((d) => d.groups === null || d.groups.includes(g)))
    .map(([g]) => g)
    .sort();
}
