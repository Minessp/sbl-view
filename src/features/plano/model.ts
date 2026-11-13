/**
 * Ponte entre o banco (biblioteca, planning.json) e o motor do planejador.
 * Sem three.js, sem Zod: os JSON são validados em teste.
 */
import planningJson from '@/data/planning.json';
import type { MuscleGroup } from '@/data/schema/muscle';
import type { PlanningFile } from '@/data/schema/planning';
import { generatePlan, targetGroups } from '@/engine/planning/generate';
import type { CatalogEntry, Priority, Region } from '@/engine/planning/types';
import { mesocycle, planVolume, type PlanVolume } from '@/engine/planning/volume';
import { weekStart } from '@/engine/training/progress';
import { library, muscleById, REGIONS } from '@/features/library/catalog';
import type { Plan, PlanDayEntry } from '@/storage/types';

export const planning = planningJson as unknown as PlanningFile;

const catalogList: CatalogEntry[] = library.map((e) => ({
  id: e.id,
  isolated: e.pattern === 'isolado',
  equipment: e.equipment,
  long: e.length.emphasis === 'alongado',
  targets: e.targets.flatMap((t) => {
    const m = muscleById(t.muscle);
    return m ? [{ muscle: m.id, group: m.group, role: t.role }] : [];
  }),
}));
const catalogIndex = new Map(catalogList.map((e) => [e.id, e]));
export const catalogEntry = (id: string): CatalogEntry | undefined => catalogIndex.get(id);
export const groupsOfExercise = (id: string): string[] => {
  const e = catalogIndex.get(id);
  return e ? targetGroups(e) : [];
};

const LOWER: ReadonlySet<string> = new Set(REGIONS.filter((r) => r.id === 'hip' || r.id === 'leg').flatMap((r) => r.groups));
const UPPER: ReadonlySet<string> = new Set(REGIONS.find((r) => r.id === 'upper')?.groups ?? []);
export const regionOf = (g: string): Region => (LOWER.has(g) ? 'lower' : UPPER.has(g) ? 'upper' : 'trunk');

/** Grupos que algum exercício da biblioteca tem como alvo, na ordem do Atlas. */
export const plannableGroups: MuscleGroup[] = REGIONS.flatMap((r) => r.groups).filter((g) => catalogList.some((e) => targetGroups(e).includes(g)));

export const rangeFor = (p: Priority): readonly [number, number] | null => (p === 'fora' ? null : planning.volume[p].value);
export const defaultTarget = (p: Priority): number => (p === 'fora' ? 0 : planning.defaultSets.value[p]);

export const config = {
  maxSetsPerSession: planning.maxSetsPerSession.value,
  maxSetsPerSlot: planning.maxSetsPerSlot.value,
  frequency: planning.frequency.value,
  reps: planning.reps.value,
  preferLong: planning.preferLong.value,
};

export function buildDays(input: { days: number; priorities: Record<string, Priority>; targets: Record<string, number>; equipment: string[] }): PlanDayEntry[] {
  return generatePlan({ ...input, regionOf, catalog: catalogList, config }).map((d) => ({
    id: d.id,
    focus: d.focus,
    items: d.items.map((i) => ({ exerciseId: i.exerciseId, sets: i.sets, reps: [i.reps[0], i.reps[1]] as [number, number] })),
  }));
}

export const volumeOf = (days: readonly PlanDayEntry[], setsFactor = 1): PlanVolume => planVolume(days, catalogEntry, setsFactor);

export const weeksOf = (p: Pick<Plan, 'weeks' | 'deload'>) => mesocycle(planning.mesocycle.value, p.weeks, p.deload);

export { weekStart };

/** Prioridade inicial sugerida: nada priorizado, tudo mantido. A pessoa escolhe. */
export function initialPriorities(): Record<string, Priority> {
  return Object.fromEntries(plannableGroups.map((g) => [g, 'manter' as Priority]));
}
