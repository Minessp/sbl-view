import { describe, expect, it } from 'vitest';
import { library } from '@/features/library/catalog';
import { buildDays, defaultTarget, initialPriorities, plannableGroups, volumeOf } from './model';

describe('planejador com a biblioteca real', () => {
  it('todo grupo planejável tem exercício-alvo', () => {
    expect(plannableGroups.length).toBeGreaterThan(5);
    expect(plannableGroups).toContain('quadriceps');
  });

  it('priorizando pernas e peito em 4 dias, as metas fecham e os exercícios existem', () => {
    const priorities = { ...initialPriorities(), quadriceps: 'priorizar' as const, chest: 'priorizar' as const, gluteals: 'priorizar' as const };
    const targets = Object.fromEntries(Object.entries(priorities).map(([g, p]) => [g, defaultTarget(p)]));
    const days = buildDays({ days: 4, priorities, targets, equipment: [] });
    expect(days).toHaveLength(4);
    const ids = new Set(library.map((e) => e.id));
    for (const d of days) for (const it of d.items) expect(ids.has(it.exerciseId)).toBe(true);
    const v = volumeOf(days).byGroup;
    for (const [g, n] of Object.entries(targets)) expect(v.get(g)?.direct ?? 0, g).toBeGreaterThanOrEqual(n);
  });

  it('sem barra, o plano não usa exercício de barra', () => {
    const priorities = { ...initialPriorities(), quadriceps: 'priorizar' as const };
    const targets = Object.fromEntries(Object.entries(priorities).map(([g, p]) => [g, defaultTarget(p)]));
    const days = buildDays({ days: 3, priorities, targets, equipment: ['maquina', 'polia', 'halteres', 'banco'] });
    for (const d of days) for (const it of d.items) expect(library.find((e) => e.id === it.exerciseId)?.equipment).not.toContain('barra');
  });
});
