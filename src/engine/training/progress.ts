/**
 * Contas do tracker: 1RM estimado, resumo por sessão, séries por semana.
 * Puro e determinístico. Datas em ms; "semana" e "dia" usam o fuso local do processo.
 */

/** O mínimo de uma série que as contas precisam (o storage tem mais campos). */
export interface SetLike {
  sessionId: string;
  exerciseId: string;
  createdAt: number;
  loadKg: number;
  reps: number;
  kind: 'aquecimento' | 'trabalho' | 'drop' | 'rest-pause';
  deletedAt?: number;
}

/** Acima disto a fórmula erra demais para valer a pena mostrar. */
export const E1RM_MAX_REPS = 10;

/**
 * 1RM estimado por Epley: carga × (1 + reps / 30). Uma repetição = a própria carga.
 * `undefined` fora de 1..E1RM_MAX_REPS ou sem carga.
 */
export function epley1RM(loadKg: number, reps: number): number | undefined {
  if (!(loadKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > E1RM_MAX_REPS) return undefined;
  return reps === 1 ? loadKg : loadKg * (1 + reps / 30);
}

/** Aquecimento não conta como série de trabalho. */
export const isWorkSet = (s: SetLike): boolean => s.kind !== 'aquecimento' && !s.deletedAt;

export interface SessionPoint {
  sessionId: string;
  /** Hora da primeira série do exercício na sessão. */
  at: number;
  workSets: number;
  /** Série de maior carga (empate: mais repetições). */
  top: { loadKg: number; reps: number };
  /** Maior 1RM estimado entre as séries de trabalho; undefined se nenhuma está na faixa. */
  e1rm: number | undefined;
  /** Soma de carga × repetições nas séries de trabalho. */
  volumeKg: number;
}

/** Uma linha por sessão em que o exercício apareceu com série de trabalho, da mais antiga à mais nova. */
export function exerciseProgress(sets: readonly SetLike[], exerciseId: string): SessionPoint[] {
  const bySession = new Map<string, SetLike[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || !isWorkSet(s)) continue;
    const list = bySession.get(s.sessionId);
    if (list) list.push(s);
    else bySession.set(s.sessionId, [s]);
  }
  const out: SessionPoint[] = [];
  for (const [sessionId, list] of bySession) {
    let at = Infinity, volumeKg = 0;
    let top = { loadKg: -Infinity, reps: 0 };
    let e1rm: number | undefined;
    for (const s of list) {
      at = Math.min(at, s.createdAt);
      volumeKg += s.loadKg * s.reps;
      if (s.loadKg > top.loadKg || (s.loadKg === top.loadKg && s.reps > top.reps)) top = { loadKg: s.loadKg, reps: s.reps };
      const e = epley1RM(s.loadKg, s.reps);
      if (e !== undefined && (e1rm === undefined || e > e1rm)) e1rm = e;
    }
    out.push({ sessionId, at, workSets: list.length, top, e1rm, volumeKg });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Início (00:00 local) da segunda-feira da semana de `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7; // domingo = 6 dias depois da segunda
  d.setDate(d.getDate() - back);
  return d.getTime();
}

/** Segundas-feiras das últimas `n` semanas, a mais antiga primeiro, terminando na semana de `now`. */
export function lastWeeks(now: number, n: number): number[] {
  const out: number[] = [];
  const d = new Date(weekStart(now));
  for (let i = 0; i < n; i++) {
    out.unshift(d.getTime());
    d.setDate(d.getDate() - 7);
  }
  return out;
}

/**
 * Séries de trabalho por grupo e semana. `groupsOf` diz quais grupos um exercício trabalha
 * como alvo; cada série conta 1 para cada grupo-alvo (sem contagem fracionada de sinergista).
 * Retorna grupo → contagem por semana, na ordem de `weeks`.
 */
export function weeklySetsByGroup(
  sets: readonly SetLike[],
  weeks: readonly number[],
  groupsOf: (exerciseId: string) => readonly string[],
): Map<string, number[]> {
  const index = new Map(weeks.map((w, i) => [w, i]));
  const out = new Map<string, number[]>();
  for (const s of sets) {
    if (!isWorkSet(s)) continue;
    const i = index.get(weekStart(s.createdAt));
    if (i === undefined) continue;
    for (const g of new Set(groupsOf(s.exerciseId))) {
      let row = out.get(g);
      if (!row) {
        row = weeks.map(() => 0);
        out.set(g, row);
      }
      row[i] = (row[i] ?? 0) + 1;
    }
  }
  return out;
}
