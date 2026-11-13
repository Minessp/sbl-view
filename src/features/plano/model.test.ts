import { describe, expect, it } from 'vitest';
import { daysAllowed, SPLIT_IDS } from '@/engine/planning/splits';
import { library, REGIONS } from '@/features/library/catalog';
import { buildPlanDays, defaultTarget, FOCUS_GROUPS, initialPriorities, plannableGroups, substitutesFor, unplaced, volumeOf } from './model';

const prioritized = (...gs: string[]) => {
  const priorities = { ...initialPriorities(), ...Object.fromEntries(gs.map((g) => [g, 'priorizar' as const])) };
  const targets = Object.fromEntries(Object.entries(priorities).map(([g, p]) => [g, defaultTarget(p)]));
  return { priorities, targets };
};

describe('planejador com a biblioteca real', () => {
  it('todo grupo planejável tem exercício-alvo e cabe em algum foco de cada divisão', () => {
    expect(plannableGroups.length).toBeGreaterThan(5);
    expect(plannableGroups).toContain('quadriceps');
    for (const id of SPLIT_IDS) {
      if (id === 'custom') continue;
      for (const days of daysAllowed(id)) {
        const { priorities, targets } = prioritized();
        expect(unplaced({ split: id, days, customDays: [], priorities, targets }), `${id} ${days}`).toEqual([]);
      }
    }
  });

  it('focos citam só grupos que existem', () => {
    const all: string[] = REGIONS.flatMap((r) => r.groups);
    for (const gs of Object.values(FOCUS_GROUPS)) for (const g of gs ?? []) expect(all, g).toContain(g);
  });

  it('em toda divisão as metas fecham e os exercícios existem', () => {
    const { priorities, targets } = prioritized('quadriceps', 'chest', 'gluteals', 'lats');
    const ids = new Set(library.map((e) => e.id));
    for (const split of SPLIT_IDS) {
      if (split === 'custom') continue;
      for (const days of daysAllowed(split)) {
        const plan = buildPlanDays({ split, days, customDays: [], priorities, targets, equipment: [] });
        expect(plan).toHaveLength(days);
        for (const d of plan) for (const it of d.items) expect(ids.has(it.exerciseId)).toBe(true);
        const v = volumeOf(plan).byGroup;
        for (const [g, n] of Object.entries(targets)) expect(v.get(g)?.direct ?? 0, `${split}/${days} ${g}`).toBeGreaterThanOrEqual(n);
      }
    }
  });

  it('sem barra, o plano não usa exercício de barra', () => {
    const { priorities, targets } = prioritized('quadriceps');
    const days = buildPlanDays({ split: 'full_body', days: 3, customDays: [], priorities, targets, equipment: ['maquina', 'polia', 'halteres', 'banco'] });
    for (const d of days) for (const it of d.items) expect(library.find((e) => e.id === it.exerciseId)?.equipment).not.toContain('barra');
  });

  it('substituto do agachamento trabalha quadríceps e respeita o equipamento', () => {
    const subs = substitutesFor('squat', ['maquina']);
    expect(subs.length).toBeGreaterThan(0);
    for (const id of subs) {
      const e = library.find((x) => x.id === id);
      expect(e?.equipment.every((q) => q === 'maquina')).toBe(true);
    }
  });
});
