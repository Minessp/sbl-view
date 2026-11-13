/**
 * Análise do treino: frequência por grupo, aderência ao plano e estagnação. Puro; datas em ms com o
 * fuso local do processo (semana começa na segunda, como em `progress.ts`).
 */
import { isWorkSet, weekStart, type SessionPoint, type SetLike } from './progress';

const dayKey = (t: number) => {
  const d = new Date(t);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

/** Dias distintos por semana em que o grupo teve série de trabalho direta. Grupo → contagem por semana. */
export function groupFrequency(sets: readonly SetLike[], weeks: readonly number[], groupsOf: (exerciseId: string) => readonly string[]): Map<string, number[]> {
  const index = new Map(weeks.map((w, i) => [w, i]));
  const days = new Map<string, Set<number>[]>();
  for (const s of sets) {
    if (!isWorkSet(s)) continue;
    const i = index.get(weekStart(s.createdAt));
    if (i === undefined) continue;
    for (const g of new Set(groupsOf(s.exerciseId))) {
      let row = days.get(g);
      if (!row) {
        row = weeks.map(() => new Set<number>());
        days.set(g, row);
      }
      row[i]?.add(dayKey(s.createdAt));
    }
  }
  return new Map([...days].map(([g, row]) => [g, row.map((x) => x.size)]));
}

export interface AdherencePlan {
  weeks: number;
  days: readonly { id: string; items: readonly { exerciseId: string; sets: number }[] }[];
  /** Séries planejadas do item naquela semana (descarga corta). */
  setsIn: (sets: number, week: number) => number;
}

export interface AdherenceSession {
  week: number;
  dayId: string;
  sets: readonly Pick<SetLike, 'exerciseId' | 'kind' | 'deletedAt'>[];
}

export interface AdherenceWeek {
  week: number;
  sessionsPlanned: number;
  sessionsDone: number;
  setsPlanned: number;
  /** Séries de trabalho feitas nos exercícios do dia, até o planejado de cada um. */
  setsDone: number;
}

/**
 * Aderência semana a semana até `upTo`. Semana planeja todos os dias da divisão; sessão conta se
 * tiver ao menos uma série. Série a mais num exercício não compensa a que faltou noutro.
 */
export function adherence(plan: AdherencePlan, sessions: readonly AdherenceSession[], upTo: number): AdherenceWeek[] {
  const out: AdherenceWeek[] = [];
  const last = Math.min(upTo, plan.weeks);
  for (let w = 1; w <= last; w++) {
    const row: AdherenceWeek = { week: w, sessionsPlanned: plan.days.length, sessionsDone: 0, setsPlanned: 0, setsDone: 0 };
    for (const d of plan.days) for (const it of d.items) row.setsPlanned += plan.setsIn(it.sets, w);
    const seenDays = new Set<string>();
    for (const s of sessions) {
      if (s.week !== w) continue;
      const day = plan.days.find((d) => d.id === s.dayId);
      if (!day) continue;
      if (!seenDays.has(s.dayId) && s.sets.some((x) => !x.deletedAt)) {
        seenDays.add(s.dayId);
        row.sessionsDone++;
      }
      for (const it of day.items) {
        const n = s.sets.filter((x) => x.exerciseId === it.exerciseId && x.kind !== 'aquecimento' && !x.deletedAt).length;
        row.setsDone += Math.min(n, plan.setsIn(it.sets, w));
      }
    }
    row.sessionsDone = Math.min(row.sessionsDone, row.sessionsPlanned);
    row.setsDone = Math.min(row.setsDone, row.setsPlanned);
    out.push(row);
  }
  return out;
}

/** Desempenho de uma sessão: 1RM estimado; fora da faixa, a maior carga pesa e as repetições desempatam. */
const score = (p: SessionPoint) => p.e1rm ?? p.top.loadKg * (1 + p.top.reps / 1000);

/**
 * Estagnado: com pelo menos `window` + 1 sessões, nenhuma das últimas `window` passou da melhor
 * anterior a elas.
 */
export function isStalled(points: readonly SessionPoint[], window: number): boolean {
  if (points.length < window + 1) return false;
  const before = Math.max(...points.slice(0, -window).map(score));
  const recent = Math.max(...points.slice(-window).map(score));
  return recent <= before + 1e-9;
}

/** Sugere descarga quando estagnam ao menos `min` exercícios e ao menos `fraction` dos exercícios ativos. */
export const suggestDeload = (stalled: number, active: number, cfg: { minExercises: number; fraction: number }): boolean =>
  active > 0 && stalled >= cfg.minExercises && stalled / active >= cfg.fraction;
