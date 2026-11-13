import { describe, expect, it } from 'vitest';
import { exerciseById, exerciseRegion, exercisesForMuscle, filterExercises, library, muscleById, NO_FILTERS, REGIONS, targetGroups } from './catalog';
import { muscleDefs } from '@/data';

const byId = (id: string) => {
  const e = exerciseById(id);
  if (!e) throw new Error(id);
  return e;
};
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
    const r = ids({ longOnly: true, status: 'hipotese' });
    expect(r).toEqual(expect.arrayContaining(['reclined_leg_extension', 'bayesian_curl']));
    for (const id of r) {
      const e = byId(id);
      expect(e.status).toBe('hipotese');
      expect(e.length.emphasis).toBe('alongado');
    }
    expect(ids({ longOnly: true })).not.toContain('lying_leg_curl');
  });

  it('região pelo primeiro alvo; busca por nome ou músculo, sem acento', () => {
    expect(exerciseRegion(byId('squat'))).toBe('lower');
    expect(exerciseRegion(byId('lat_pulldown'))).toBe('upper');
    expect(exerciseRegion(byId('cable_crunch'))).toBe('trunk');
    expect(ids({ query: 'nordica' })).toEqual(expect.arrayContaining(['nordic_curl', 'reverse_nordic']));
    expect(ids({ query: 'Tríceps braquial' }).length).toBeGreaterThan(3);
    expect(ids({ region: 'trunk' }).every((id) => exerciseRegion(byId(id)) === 'trunk')).toBe(true);
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
