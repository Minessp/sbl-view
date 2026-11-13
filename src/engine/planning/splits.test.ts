import { describe, expect, it } from 'vitest';
import { generatePlan, targetGroups } from './generate';
import { daysAllowed, fitDays, legacySplit, SPLIT_IDS, SPLITS, splitDays, unplacedGroups } from './splits';
import { substitutes } from './substitute';
import type { CatalogEntry, DayFocus, PlanConfig } from './types';

const cfg: PlanConfig = {
  maxSetsPerSession: 8,
  maxSetsPerSlot: 4,
  frequency: 2,
  reps: { composto: [6, 10], isolado: [8, 15] },
  preferLong: true,
  rest: { composto: 150, isolado: 90 },
};
const ex = (id: string, isolated: boolean, equipment: string[], targets: [string, string][], long = false): CatalogEntry => ({
  id,
  isolated,
  equipment,
  long,
  targets: targets.map(([muscle, group]) => ({ muscle, group, role: 'alvo' as const })),
});
const catalog: CatalogEntry[] = [
  ex('squat', false, ['barra'], [['vl', 'quads'], ['gm', 'glutes']], true),
  ex('leg_ext', true, ['maquina'], [['vl', 'quads']]),
  ex('hack', false, ['maquina'], [['vl', 'quads'], ['gm', 'glutes']], true),
  ex('bench', false, ['barra'], [['pm', 'chest']]),
  ex('fly', true, ['polia'], [['pm', 'chest']], true),
  ex('row', false, ['polia'], [['ld', 'lats']]),
  ex('pulldown', false, ['polia'], [['ld', 'lats']], true),
  ex('raise', true, ['halteres'], [['dl', 'delts']]),
  ex('curl', true, ['halteres'], [['bb', 'biceps']], true),
  ex('pushdown', true, ['polia'], [['tri', 'triceps']]),
];
const FOCUS: Record<DayFocus, string[] | null> = {
  full: null,
  upper: ['chest', 'lats', 'delts', 'biceps', 'triceps'],
  lower: ['quads', 'glutes'],
  push: ['chest', 'delts', 'triceps'],
  pull: ['lats', 'biceps'],
  legs: ['quads', 'glutes'],
  chest_back: ['chest', 'lats'],
  shoulders_arms: ['delts', 'biceps', 'triceps'],
  torso: ['chest', 'lats', 'delts'],
  limbs: ['biceps', 'triceps', 'quads', 'glutes'],
  chest: ['chest'],
  back: ['lats'],
  shoulders: ['delts'],
  arms: ['biceps', 'triceps'],
  custom: [],
};
const groupsOf = (f: DayFocus) => FOCUS[f];
const targets = { quads: 12, glutes: 6, chest: 12, lats: 12, delts: 8, biceps: 6, triceps: 6 };
const priorities = Object.fromEntries(Object.keys(targets).map((g) => [g, 'priorizar' as const]));
const plan = (split: ReturnType<typeof splitDays>) =>
  generatePlan({ days: split.length, split, targets, priorities, equipment: [], regionOf: () => 'trunk', catalog, config: cfg });
const byId = (id: string) => catalog.find((e) => e.id === id) as CatalogEntry;

describe('divisões', () => {
  it('cada divisão gera o número de dias aceito e só focos conhecidos', () => {
    for (const id of SPLIT_IDS) {
      if (id === 'custom') continue;
      for (const n of daysAllowed(id)) {
        const days = splitDays(id, n, groupsOf);
        expect(days, `${id} ${n}`).toHaveLength(n);
        for (const d of days) expect(Object.keys(FOCUS)).toContain(d.focus);
      }
    }
    expect(SPLITS.ppl.focus(6)).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs']);
    expect(SPLITS.ppl_ul.focus(5)).toEqual(['push', 'pull', 'legs', 'upper', 'lower']);
    expect(SPLITS.arnold.focus(3)).toEqual(['chest_back', 'shoulders_arms', 'legs']);
  });

  it('número de dias fora da divisão vai para o mais perto', () => {
    expect(fitDays('ppl', 4)).toBe(3);
    expect(fitDays('ppl', 5)).toBe(6);
    expect(fitDays('ppl_ul', 3)).toBe(5);
    expect(splitDays('ppl', 4, groupsOf)).toHaveLength(3);
  });

  it('plano antigo: até 3 dias corpo inteiro, senão superior/inferior', () => {
    expect(legacySplit(3)).toBe('full_body');
    expect(legacySplit(4)).toBe('upper_lower');
  });

  it('nenhum exercício entra num dia que não aceita o grupo dele', () => {
    for (const id of ['ppl', 'arnold', 'torso_limbs', 'body_part', 'upper_lower'] as const) {
      for (const n of daysAllowed(id)) {
        const split = splitDays(id, n, groupsOf);
        plan(split).forEach((d, i) => {
          const ok = split[i]?.groups;
          for (const it of d.items) {
            const tg = targetGroups(byId(it.exerciseId));
            if (ok) expect(tg.some((g) => ok.includes(g)), `${id}/${n} ${d.focus}: ${it.exerciseId}`).toBe(true);
          }
        });
      }
    }
  });

  it('PPL em 6 dias treina cada grupo priorizado 2 vezes', () => {
    const days = plan(splitDays('ppl', 6, groupsOf));
    for (const g of ['chest', 'lats', 'quads']) {
      const n = days.filter((d) => d.items.some((it) => targetGroups(byId(it.exerciseId)).includes(g))).length;
      expect(n, g).toBe(2);
    }
  });

  it('dia personalizado leva só os grupos escolhidos e grava os grupos', () => {
    const split = splitDays('custom', 2, groupsOf, [['chest', 'triceps'], ['quads']]);
    const days = plan(split);
    expect(days[0]?.focus).toBe('custom');
    expect(days[0]?.groups).toEqual(['chest', 'triceps']);
    for (const it of days[1]?.items ?? []) expect(targetGroups(byId(it.exerciseId))).toContain('quads');
    expect(unplacedGroups(split, targets)).toEqual(['biceps', 'delts', 'glutes', 'lats']);
  });

  it('descanso padrão por tipo de exercício', () => {
    const days = plan(splitDays('full_body', 3, groupsOf));
    for (const d of days) for (const it of d.items) expect(it.restSec).toBe(byId(it.exerciseId).isolated ? 90 : 150);
  });
});

describe('substituição', () => {
  it('troca por mesmo alvo, com equipamento disponível', () => {
    const s = substitutes('squat', catalog).map((x) => x.id);
    expect(s[0]).toBe('hack');
    expect(s).toContain('leg_ext');
    expect(s).not.toContain('bench');
    expect(substitutes('squat', catalog, ['barra', 'halteres']).map((x) => x.id)).toEqual([]);
    expect(substitutes('squat', catalog, [], ['hack']).map((x) => x.id)).toEqual(['leg_ext']);
  });
});
