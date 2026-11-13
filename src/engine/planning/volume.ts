/**
 * Volume semanal do plano, por músculo e por grupo, e o mesociclo (semana a semana).
 * Regra de contagem igual à do Progresso: série direta = exercício que tem o músculo como alvo.
 * Sinergista vira "indireta", mostrada à parte e nunca somada à direta.
 */
import type { CatalogEntry, PlanDay } from './types';

export interface Volume {
  direct: number;
  indirect: number;
}

const add = (m: Map<string, Volume>, k: string, key: keyof Volume, n: number) => {
  const v = m.get(k) ?? { direct: 0, indirect: 0 };
  v[key] += n;
  m.set(k, v);
};

export interface PlanVolume {
  byMuscle: Map<string, Volume>;
  byGroup: Map<string, Volume>;
}

/**
 * Por músculo: alvo soma em direta, sinergista em indireta.
 * Por grupo: cada série conta 1 por grupo-alvo; grupo só sinergista no exercício soma em indireta.
 */
export function planVolume(days: readonly PlanDay[], catalog: (id: string) => CatalogEntry | undefined, setsFactor = 1): PlanVolume {
  const byMuscle = new Map<string, Volume>();
  const byGroup = new Map<string, Volume>();
  for (const d of days)
    for (const it of d.items) {
      const e = catalog(it.exerciseId);
      if (!e) continue;
      const n = scaleSets(it.sets, setsFactor);
      for (const t of e.targets) add(byMuscle, t.muscle, t.role === 'alvo' ? 'direct' : 'indirect', n);
      const direct = new Set(e.targets.filter((t) => t.role === 'alvo').map((t) => t.group));
      const indirect = new Set(e.targets.filter((t) => t.role === 'sinergista' && !direct.has(t.group)).map((t) => t.group));
      for (const g of direct) add(byGroup, g, 'direct', n);
      for (const g of indirect) add(byGroup, g, 'indirect', n);
    }
  return { byMuscle, byGroup };
}

export type VolumeStatus = 'abaixo' | 'dentro' | 'acima';
export function classify(n: number, range: readonly [number, number]): VolumeStatus {
  return n < range[0] ? 'abaixo' : n > range[1] ? 'acima' : 'dentro';
}

/** Séries de uma semana com fator (descarga). Nunca zera um exercício. */
export const scaleSets = (sets: number, factor: number): number => (factor === 1 ? sets : Math.max(1, Math.round(sets * factor)));

export interface MesoConfig {
  rirStart: number;
  rirEnd: number;
  deloadSetsFactor: number;
  deloadRir: number;
}

export interface WeekPrescription {
  week: number;
  rir: number;
  setsFactor: number;
  deload: boolean;
}

/** Semana 1..weeks. Com descarga, a última semana é a de descarga. */
export function weekPrescription(cfg: MesoConfig, weeks: number, deload: boolean, week: number): WeekPrescription {
  if (deload && week === weeks) return { week, rir: cfg.deloadRir, setsFactor: cfg.deloadSetsFactor, deload: true };
  const work = deload ? weeks - 1 : weeks;
  const f = work <= 1 ? 0 : (week - 1) / (work - 1);
  return { week, rir: Math.round(cfg.rirStart + (cfg.rirEnd - cfg.rirStart) * f), setsFactor: 1, deload: false };
}

export function mesocycle(cfg: MesoConfig, weeks: number, deload: boolean): WeekPrescription[] {
  return Array.from({ length: weeks }, (_, i) => weekPrescription(cfg, weeks, deload, i + 1));
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Semana do mesociclo em que `now` cai (1 = a semana em que começou). Contagem por segunda-feira
 * local; arredonda para absorver horário de verão. Pode passar de `weeks` (mesociclo vencido).
 */
export function currentWeek(startedAt: number, now: number, weekStartOf: (t: number) => number): number {
  return Math.max(1, Math.round((weekStartOf(now) - weekStartOf(startedAt)) / (7 * DAY)) + 1);
}

/** Próximo dia da divisão depois do último feito (cíclico). Sem histórico = o primeiro. */
export function nextDay(dayIds: readonly string[], last: string | undefined): string | undefined {
  if (dayIds.length === 0) return undefined;
  const i = last === undefined ? -1 : dayIds.indexOf(last);
  return dayIds[(i + 1) % dayIds.length];
}
