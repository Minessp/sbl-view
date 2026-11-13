import { describe, expect, it } from 'vitest';
import { adherence, groupFrequency, isStalled, suggestDeload } from './analysis';
import { platesPerSide } from './plates';
import { doubleProgression, roundTo } from './progression';
import type { SessionPoint, SetLike } from './progress';
import { beatsRecord, e1rmRecords, repRecords } from './records';
import { warmupSets } from './warmup';

const set = (exerciseId: string, loadKg: number, reps: number, createdAt: number, kind: SetLike['kind'] = 'trabalho', sessionId = 's'): SetLike => ({
  sessionId,
  exerciseId,
  createdAt,
  loadKg,
  reps,
  kind,
});

describe('progressão dupla', () => {
  const s = (load: number, ...reps: number[]) => reps.map((r) => ({ load, reps: r }));
  it('topo da faixa em todas as séries: sobe a carga e volta ao início', () => {
    expect(doubleProgression(s(40, 12, 12, 12), [8, 12], 2.5)).toEqual({ load: 42.5, reps: 8, reason: 'up' });
  });
  it('dentro da faixa: mesma carga, uma repetição a mais que a pior', () => {
    expect(doubleProgression(s(40, 12, 10, 9), [8, 12], 2.5)).toEqual({ load: 40, reps: 10, reason: 'hold' });
  });
  it('abaixo da faixa: desce a carga', () => {
    expect(doubleProgression(s(40, 6, 5), [8, 12], 2.5)).toEqual({ load: 37.5, reps: 8, reason: 'down' });
  });
  it('só olha a carga mais alta da sessão', () => {
    expect(doubleProgression([...s(50, 12), ...s(40, 6)], [8, 12], 5)?.reason).toBe('up');
  });
  it('peso do corpo: só repetições', () => {
    expect(doubleProgression(s(0, 10, 8), [6, 10], 0)).toEqual({ load: 0, reps: 11, reason: 'reps' });
  });
  it('sem histórico: nada a sugerir', () => {
    expect(doubleProgression([], [8, 12], 2.5)).toBeUndefined();
  });
  it('arredonda sem ruído', () => {
    expect(roundTo(0.1 + 0.2, 0)).toBe(0.3);
    expect(roundTo(41.3, 2.5)).toBe(42.5);
  });
});

describe('anilhas e aquecimento', () => {
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
  it('monta a carga por lado', () => {
    expect(platesPerSide(100, 20, plates)).toEqual({ perSide: [25, 15], total: 100, remainder: 0 });
    expect(platesPerSide(20, 20, plates)?.perSide).toEqual([]);
    expect(platesPerSide(101, 20, plates)).toEqual({ perSide: [25, 15], total: 100, remainder: 1 });
    expect(platesPerSide(10, 20, plates)).toBeUndefined();
  });
  it('aquecimento sobe até a carga de trabalho sem repetir carga', () => {
    const steps = [
      { pct: 0.4, reps: 8 },
      { pct: 0.6, reps: 5 },
      { pct: 0.8, reps: 3 },
    ];
    expect(warmupSets(100, steps, { step: 2.5, min: 20 })).toEqual([
      { load: 40, reps: 8 },
      { load: 60, reps: 5 },
      { load: 80, reps: 3 },
    ]);
    expect(warmupSets(30, steps, { step: 2.5, min: 20 })).toEqual([
      { load: 20, reps: 8 },
      { load: 25, reps: 3 },
    ]);
    expect(warmupSets(0, steps, { step: 2.5, min: 0 })).toEqual([]);
  });
});

describe('recordes', () => {
  const hist = [set('bench', 80, 8, 1), set('bench', 90, 3, 2), set('bench', 60, 20, 3), set('bench', 100, 1, 4, 'aquecimento')];
  it('1RM estimado por exercício, sem aquecimento e sem série longa', () => {
    const r = e1rmRecords(hist);
    expect(r).toHaveLength(1);
    expect(r[0]?.loadKg).toBe(80);
    expect(r[0]?.e1rm).toBeCloseTo(80 * (1 + 8 / 30));
  });
  it('recorde por repetição usa ao menos r repetições', () => {
    const r = repRecords(hist, 'bench', 10);
    expect(r.find((x) => x.reps === 3)?.loadKg).toBe(90);
    expect(r.find((x) => x.reps === 5)?.loadKg).toBe(80);
    expect(r.find((x) => x.reps === 10)?.loadKg).toBe(60);
  });
  it('série nova bate o recorde', () => {
    expect(beatsRecord(hist, set('bench', 85, 8, 5))).toEqual({ e1rm: true, reps: true });
    expect(beatsRecord(hist, set('bench', 80, 8, 5))).toEqual({ e1rm: false, reps: false });
    expect(beatsRecord([], set('bench', 85, 8, 5))).toEqual({ e1rm: false, reps: false });
  });
});

describe('análise', () => {
  const DAY = 864e5;
  const mon = new Date(2026, 10, 9).getTime(); // segunda-feira
  it('frequência = dias distintos por semana', () => {
    const sets = [set('a', 1, 5, mon + 3600e3), set('a', 1, 5, mon + 7200e3), set('a', 1, 5, mon + 2 * DAY), set('a', 1, 5, mon + 3 * DAY, 'aquecimento')];
    expect(groupFrequency(sets, [mon], () => ['g']).get('g')).toEqual([2]);
  });
  it('aderência: série a mais não compensa a que faltou', () => {
    const plan = {
      weeks: 4,
      days: [
        { id: 'A', items: [{ exerciseId: 'x', sets: 3 }, { exerciseId: 'y', sets: 3 }] },
        { id: 'B', items: [{ exerciseId: 'z', sets: 2 }] },
      ],
      setsIn: (n: number) => n,
    };
    const w = adherence(plan, [{ week: 1, dayId: 'A', sets: Array.from({ length: 5 }, () => ({ exerciseId: 'x', kind: 'trabalho' as const })) }], 2);
    expect(w).toEqual([
      { week: 1, sessionsPlanned: 2, sessionsDone: 1, setsPlanned: 8, setsDone: 3 },
      { week: 2, sessionsPlanned: 2, sessionsDone: 0, setsPlanned: 8, setsDone: 0 },
    ]);
  });
  it('estagnação e descarga', () => {
    const p = (e1rm: number): SessionPoint => ({ sessionId: String(e1rm), at: 0, workSets: 3, top: { loadKg: e1rm, reps: 5 }, e1rm, volumeKg: 0 });
    expect(isStalled([p(100), p(98), p(100), p(99)], 3)).toBe(true);
    expect(isStalled([p(100), p(98), p(101), p(99)], 3)).toBe(false);
    expect(isStalled([p(100), p(98)], 3)).toBe(false);
    expect(suggestDeload(3, 5, { minExercises: 3, fraction: 0.5 })).toBe(true);
    expect(suggestDeload(3, 8, { minExercises: 3, fraction: 0.5 })).toBe(false);
  });
});
