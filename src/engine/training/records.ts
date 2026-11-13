/**
 * Recordes: 1RM estimado (Epley, até E1RM_MAX_REPS) e recorde por repetição (maior carga feita com
 * ao menos r repetições: 100 × 5 também vale como recorde de 3). Só séries de trabalho.
 */
import { epley1RM, isWorkSet, type SetLike } from './progress';

export interface E1rmRecord {
  exerciseId: string;
  e1rm: number;
  loadKg: number;
  reps: number;
  at: number;
}

/** Melhor 1RM estimado de cada exercício, do maior para o menor. */
export function e1rmRecords(sets: readonly SetLike[]): E1rmRecord[] {
  const best = new Map<string, E1rmRecord>();
  for (const s of sets) {
    if (!isWorkSet(s)) continue;
    const e = epley1RM(s.loadKg, s.reps);
    if (e === undefined) continue;
    const cur = best.get(s.exerciseId);
    if (!cur || e > cur.e1rm + 1e-9) best.set(s.exerciseId, { exerciseId: s.exerciseId, e1rm: e, loadKg: s.loadKg, reps: s.reps, at: s.createdAt });
  }
  return [...best.values()].sort((a, b) => b.e1rm - a.e1rm || a.exerciseId.localeCompare(b.exerciseId));
}

export interface RepRecord {
  reps: number;
  loadKg: number;
  /** Repetições de fato feitas na série que bateu o recorde. */
  done: number;
  at: number;
}

/** Recorde para cada número de repetições de 1 a `maxReps` com alguma série; o primeiro a chegar vence o empate. */
export function repRecords(sets: readonly SetLike[], exerciseId: string, maxReps = 12): RepRecord[] {
  const work = sets.filter((s) => s.exerciseId === exerciseId && isWorkSet(s) && s.loadKg > 0).sort((a, b) => a.createdAt - b.createdAt);
  const out: RepRecord[] = [];
  for (let r = 1; r <= maxReps; r++) {
    let rec: RepRecord | undefined;
    for (const s of work) if (s.reps >= r && (!rec || s.loadKg > rec.loadKg)) rec = { reps: r, loadKg: s.loadKg, done: s.reps, at: s.createdAt };
    if (rec) out.push(rec);
  }
  return out;
}

export interface NewRecord {
  e1rm: boolean;
  /** Recorde por repetição para as repetições da série. */
  reps: boolean;
}

/** A série `s` bate algum recorde do histórico `before` (que não a contém)? Sem histórico, nada é recorde. */
export function beatsRecord(before: readonly SetLike[], s: SetLike): NewRecord {
  const prior = before.filter((x) => x.exerciseId === s.exerciseId && isWorkSet(x));
  if (!isWorkSet(s) || prior.length === 0) return { e1rm: false, reps: false };
  const e = epley1RM(s.loadKg, s.reps);
  const bestE = Math.max(0, ...prior.map((x) => epley1RM(x.loadKg, x.reps) ?? 0));
  const bestAtReps = Math.max(0, ...prior.filter((x) => x.reps >= s.reps).map((x) => x.loadKg));
  return { e1rm: e !== undefined && bestE > 0 && e > bestE + 1e-9, reps: s.loadKg > 0 && s.loadKg > bestAtReps + 1e-9 };
}
