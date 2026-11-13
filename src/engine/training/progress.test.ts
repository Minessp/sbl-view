import { describe, expect, it } from 'vitest';
import { epley1RM, exerciseProgress, lastWeeks, weekStart, weeklySetsByGroup, type SetLike } from './progress';

const set = (p: Partial<SetLike> & Pick<SetLike, 'createdAt'>): SetLike => ({
  sessionId: 's1',
  exerciseId: 'squat',
  loadKg: 100,
  reps: 5,
  kind: 'trabalho',
  ...p,
});

describe('1RM estimado (Epley)', () => {
  it('1 repetição é a própria carga; 10 reps somam um terço', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(90, 10)).toBeCloseTo(120, 9);
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 3);
  });
  it('fora da faixa não estima', () => {
    expect(epley1RM(100, 11)).toBeUndefined();
    expect(epley1RM(100, 0)).toBeUndefined();
    expect(epley1RM(0, 5)).toBeUndefined();
    expect(epley1RM(100, 2.5)).toBeUndefined();
  });
});

describe('progresso por exercício', () => {
  it('uma linha por sessão, em ordem de data, sem aquecimento nem apagadas', () => {
    const t = Date.UTC(2026, 10, 2, 12);
    const sets = [
      set({ sessionId: 'b', createdAt: t + 86_400_000, loadKg: 105, reps: 3 }),
      set({ sessionId: 'a', createdAt: t, loadKg: 60, reps: 8, kind: 'aquecimento' }),
      set({ sessionId: 'a', createdAt: t + 60_000, loadKg: 100, reps: 5 }),
      set({ sessionId: 'a', createdAt: t + 120_000, loadKg: 100, reps: 6 }),
      set({ sessionId: 'a', createdAt: t + 180_000, loadKg: 200, reps: 1, deletedAt: t + 200_000 }),
      set({ sessionId: 'a', createdAt: t + 240_000, exerciseId: 'bench', loadKg: 70, reps: 5 }),
    ];
    const p = exerciseProgress(sets, 'squat');
    expect(p.map((x) => x.sessionId)).toEqual(['a', 'b']);
    const a = p[0];
    expect(a?.workSets).toBe(2);
    expect(a?.top).toEqual({ loadKg: 100, reps: 6 });
    expect(a?.volumeKg).toBe(1100);
    expect(a?.at).toBe(t + 60_000);
    expect(a?.e1rm).toBeCloseTo(120, 9);
  });
  it('série só acima de 10 reps fica sem 1RM estimado', () => {
    const p = exerciseProgress([set({ createdAt: 0, reps: 15 })], 'squat');
    expect(p[0]?.e1rm).toBeUndefined();
  });
});

describe('semanas', () => {
  it('semana começa na segunda 00:00 local', () => {
    const wed = new Date(2026, 10, 11, 15, 30).getTime(); // quarta
    const sun = new Date(2026, 10, 15, 23, 0).getTime(); // domingo
    const mon = new Date(2026, 10, 9).getTime();
    expect(weekStart(wed)).toBe(mon);
    expect(weekStart(sun)).toBe(mon);
    expect(weekStart(mon)).toBe(mon);
  });
  it('últimas n semanas terminam na atual', () => {
    const w = lastWeeks(new Date(2026, 10, 11).getTime(), 3);
    expect(w).toEqual([new Date(2026, 9, 26).getTime(), new Date(2026, 10, 2).getTime(), new Date(2026, 10, 9).getTime()]);
  });
  it('conta séries de trabalho por grupo-alvo e semana', () => {
    const weeks = lastWeeks(new Date(2026, 10, 11).getTime(), 2);
    const groups: Record<string, string[]> = { squat: ['quadriceps', 'gluteals'], curl: ['hamstrings'] };
    const sets = [
      set({ createdAt: new Date(2026, 10, 3).getTime() }),
      set({ createdAt: new Date(2026, 10, 10).getTime() }),
      set({ createdAt: new Date(2026, 10, 10).getTime(), kind: 'aquecimento' }),
      set({ createdAt: new Date(2026, 10, 11).getTime(), exerciseId: 'curl' }),
      set({ createdAt: new Date(2026, 9, 1).getTime() }), // fora da janela
    ];
    const m = weeklySetsByGroup(sets, weeks, (id) => groups[id] ?? []);
    expect(m.get('quadriceps')).toEqual([1, 1]);
    expect(m.get('gluteals')).toEqual([1, 1]);
    expect(m.get('hamstrings')).toEqual([0, 1]);
  });
});
