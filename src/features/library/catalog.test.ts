import { describe, expect, it } from 'vitest';
import { exercisesForMuscle, filterExercises, library, muscleById, NO_FILTERS, REGIONS, targetGroups } from './catalog';
import { muscleDefs } from '@/data';

const ids = (f: Partial<typeof NO_FILTERS>) => filterExercises(library, { ...NO_FILTERS, ...f }).map((e) => e.id);

describe('catálogo de exercícios', () => {
  it('sem filtro devolve tudo, na ordem do banco', () => {
    expect(ids({})).toEqual(library.map((e) => e.id));
  });

  it('grupo conta só alvos: isquiotibiais não incluem a elevação pélvica (sinergista)', () => {
    const r = ids({ group: 'hamstrings' });
    expect(r).toContain('seated_leg_curl');
    expect(r).toContain('romanian_deadlift');
    expect(r).not.toContain('hip_thrust');
  });

  it('equipamento exige todos os marcados', () => {
    const r = ids({ equipment: ['barra', 'banco'] });
    expect(r).toEqual(expect.arrayContaining(['hip_thrust', 'bench_press']));
    expect(r).not.toContain('squat');
  });

  it('ênfase em comprimento longo + status combinam', () => {
    expect(ids({ longOnly: true, status: 'hipotese' })).toEqual(['reclined_leg_extension']);
    expect(ids({ longOnly: true })).not.toContain('lying_leg_curl');
  });

  it('filtro que não casa nada devolve lista vazia', () => {
    expect(ids({ pattern: 'empurrar_vertical', group: 'hamstrings' })).toEqual([]);
  });

  it('opções de grupo saem dos alvos e seguem a ordem das regiões', () => {
    const g = targetGroups();
    const order = REGIONS.flatMap((r) => r.groups);
    expect(g.length).toBeGreaterThan(5);
    expect([...g].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(g);
  });

  it('exercícios de um músculo: alvos antes de sinergistas', () => {
    const uses = exercisesForMuscle('gastrocnemius');
    expect(uses[0]?.role).toBe('alvo');
    expect(uses.map((u) => u.role).lastIndexOf('alvo')).toBeLessThan(uses.map((u) => u.role).indexOf('sinergista'));
  });

  it('todo músculo cabe em uma região do Atlas', () => {
    const all = new Set(REGIONS.flatMap((r) => r.groups));
    for (const m of muscleDefs) expect(all, m.id).toContain(m.group);
    expect(muscleById('soleus')?.latin).toBe('Soleus');
  });
});
