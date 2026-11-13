import { describe, expect, it } from 'vitest';
import { generatePlan, splitFor, spread, targetGroups } from './generate';
import type { CatalogEntry, GenerateInput, PlanConfig, Region } from './types';
import { classify, currentWeek, mesocycle, nextDay, planVolume, scaleSets } from './volume';

const cfg: PlanConfig = { maxSetsPerSession: 8, maxSetsPerSlot: 4, frequency: 2, reps: { composto: [6, 10], isolado: [8, 15] }, preferLong: true };

const ex = (id: string, isolated: boolean, equipment: string[], targets: [string, string, 'alvo' | 'sinergista'][], long = false): CatalogEntry => ({
  id,
  isolated,
  equipment,
  long,
  targets: targets.map(([muscle, group, role]) => ({ muscle, group, role })),
});

const catalog: CatalogEntry[] = [
  ex('squat', false, ['barra', 'rack'], [['vl', 'quads', 'alvo'], ['gm', 'glutes', 'alvo'], ['es', 'back', 'sinergista']], true),
  ex('leg_ext', true, ['maquina'], [['vl', 'quads', 'alvo'], ['rf', 'quads', 'alvo']]),
  ex('rdl', false, ['barra'], [['bf', 'hams', 'alvo'], ['gm', 'glutes', 'alvo']], true),
  ex('curl', true, ['maquina'], [['bf', 'hams', 'alvo']], true),
  ex('bench', false, ['barra', 'banco'], [['pm', 'chest', 'alvo'], ['tri', 'arms', 'sinergista']]),
  ex('fly', true, ['maquina'], [['pm', 'chest', 'alvo']], true),
  ex('row', false, ['polia'], [['ld', 'lats', 'alvo']]),
  ex('pushdown', true, ['polia'], [['tri', 'arms', 'alvo']]),
];
const REG: Record<string, Region> = { quads: 'lower', glutes: 'lower', hams: 'lower', chest: 'upper', lats: 'upper', arms: 'upper', back: 'trunk' };
const base = (over: Partial<GenerateInput> = {}): GenerateInput => ({
  days: 3,
  targets: { quads: 12, glutes: 12, hams: 4, chest: 12, lats: 12, arms: 4 },
  priorities: { quads: 'priorizar', glutes: 'priorizar', hams: 'manter', chest: 'priorizar', lats: 'priorizar', arms: 'manter', back: 'fora' },
  equipment: [],
  regionOf: (g) => REG[g] ?? 'trunk',
  catalog,
  config: cfg,
  ...over,
});
const byId = (id: string) => catalog.find((e) => e.id === id);

describe('planejador', () => {
  it('divisões por número de dias', () => {
    expect(splitFor(3)).toEqual(['full', 'full', 'full']);
    expect(splitFor(4)).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect(splitFor(6).filter((f) => f === 'upper')).toHaveLength(3);
  });

  it('reparte séries com as maiores primeiro', () => {
    expect(spread(12, 2)).toEqual([6, 6]);
    expect(spread(7, 3)).toEqual([3, 2, 2]);
  });

  it('é determinístico', () => {
    expect(generatePlan(base())).toEqual(generatePlan(base()));
  });

  it('cumpre a meta direta de cada grupo e não deixa grupo priorizado num dia só', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const plan = generatePlan(base({ days }));
      const v = planVolume(plan, byId).byGroup;
      for (const [g, n] of Object.entries(base().targets)) expect(v.get(g)?.direct ?? 0, `${g} em ${days} dias`).toBeGreaterThanOrEqual(n);
      for (const g of ['quads', 'chest']) {
        const daysWith = plan.filter((d) => d.items.some((it) => byId(it.exerciseId) && targetGroups(byId(it.exerciseId) as CatalogEntry).includes(g)));
        expect(daysWith.length, `${g} em ${days} dias`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('respeita a divisão superior/inferior', () => {
    const plan = generatePlan(base({ days: 4 }));
    for (const d of plan) {
      for (const it of d.items) {
        const groups = targetGroups(byId(it.exerciseId) as CatalogEntry);
        if (d.focus === 'upper') expect(groups.some((g) => REG[g] === 'lower')).toBe(false);
        if (d.focus === 'lower') expect(groups.some((g) => REG[g] === 'upper')).toBe(false);
      }
    }
  });

  it('sem outro exercício para o grupo, as séries ficam no mesmo', () => {
    const plan = generatePlan(base({ days: 2, targets: { lats: 12 }, priorities: { lats: 'priorizar' } }));
    expect(plan.map((d) => d.items.map((i) => [i.exerciseId, i.sets]))).toEqual([[['row', 6]], [['row', 6]]]);
  });

  it('respeita o teto por exercício e o equipamento disponível', () => {
    const plan = generatePlan(base({ equipment: ['maquina', 'polia', 'barra', 'banco'], targets: { ...base().targets, lats: 8, glutes: 8, quads: 8 } }));
    const ids = plan.flatMap((d) => d.items.map((i) => i.exerciseId));
    expect(ids).not.toContain('squat');
    for (const d of plan) for (const it of d.items) expect(it.sets).toBeLessThanOrEqual(cfg.maxSetsPerSlot + 1);
  });

  it('prefere composto e põe composto antes de isolado', () => {
    const plan = generatePlan(base());
    const first = plan[0]?.items[0];
    expect(first && byId(first.exerciseId)?.isolated).toBe(false);
    for (const d of plan) {
      const iso = d.items.map((i) => byId(i.exerciseId)?.isolated === true);
      expect(iso).toEqual([...iso].sort((a, b) => Number(a) - Number(b)));
    }
  });

  it('grupo fora ou sem exercício possível não recebe meta', () => {
    const plan = generatePlan(base({ targets: { quads: 6, glutes: 0, lats: 6 }, priorities: { quads: 'priorizar', lats: 'fora' }, equipment: ['maquina'] }));
    const v = planVolume(plan, byId).byGroup;
    expect(v.get('lats')).toBeUndefined();
    expect(v.get('quads')?.direct).toBeGreaterThanOrEqual(6);
  });

  it('sinergista conta como indireta, nunca como direta', () => {
    const v = planVolume([{ id: 'A', focus: 'full', items: [{ exerciseId: 'bench', sets: 3, reps: [6, 10] }] }], byId);
    expect(v.byMuscle.get('pm')).toEqual({ direct: 3, indirect: 0 });
    expect(v.byMuscle.get('tri')).toEqual({ direct: 0, indirect: 3 });
    expect(v.byGroup.get('arms')).toEqual({ direct: 0, indirect: 3 });
  });

  it('séries por grupo contam 1 por grupo, não por músculo', () => {
    const v = planVolume([{ id: 'A', focus: 'full', items: [{ exerciseId: 'leg_ext', sets: 3, reps: [8, 15] }] }], byId);
    expect(v.byGroup.get('quads')?.direct).toBe(3);
  });
});

describe('mesociclo', () => {
  const meso = { rirStart: 3, rirEnd: 1, deloadSetsFactor: 0.5, deloadRir: 4 };
  it('RIR cai e a última semana é descarga', () => {
    const w = mesocycle(meso, 5, true);
    expect(w.map((x) => x.rir)).toEqual([3, 2, 2, 1, 4]);
    expect(w.map((x) => x.deload)).toEqual([false, false, false, false, true]);
    expect(w[4]?.setsFactor).toBe(0.5);
  });
  it('sem descarga, todas as semanas são de trabalho', () => {
    expect(mesocycle(meso, 4, false).every((x) => !x.deload && x.setsFactor === 1)).toBe(true);
  });
  it('descarga nunca zera exercício', () => {
    expect(scaleSets(1, 0.5)).toBe(1);
    expect(scaleSets(4, 0.5)).toBe(2);
    expect(scaleSets(3, 1)).toBe(3);
  });
  it('semana corrente por segunda-feira', () => {
    const DAY = 864e5;
    const ws = (t: number) => Math.floor(t / (7 * DAY)) * 7 * DAY;
    expect(currentWeek(0, 3 * DAY, ws)).toBe(1);
    expect(currentWeek(0, 7 * DAY, ws)).toBe(2);
    expect(currentWeek(0, 30 * DAY, ws)).toBe(5);
  });
  it('próximo dia é cíclico', () => {
    expect(nextDay(['A', 'B', 'C'], undefined)).toBe('A');
    expect(nextDay(['A', 'B', 'C'], 'C')).toBe('A');
    expect(nextDay(['A', 'B', 'C'], 'A')).toBe('B');
    expect(nextDay(['A', 'B'], 'Z')).toBe('A');
  });
  it('classifica volume na faixa', () => {
    expect(classify(4, [10, 20])).toBe('abaixo');
    expect(classify(10, [10, 20])).toBe('dentro');
    expect(classify(21, [10, 20])).toBe('acima');
  });
});
