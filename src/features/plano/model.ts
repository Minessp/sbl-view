/**
 * Ponte entre o banco (biblioteca, planning.json) e o motor do planejador.
 * Sem three.js, sem Zod: os JSON são validados em teste.
 */
import planningJson from '@/data/planning.json';
import type { MuscleGroup } from '@/data/schema/muscle';
import type { PlanningFile } from '@/data/schema/planning';
import { generatePlan, targetGroups } from '@/engine/planning/generate';
import { splitDays, unplacedGroups, type SplitId } from '@/engine/planning/splits';
import { hasEquipment, substitutes } from '@/engine/planning/substitute';
import type { CatalogEntry, DayFocus, Priority, Region, SplitDay } from '@/engine/planning/types';
import { mesocycle, planVolume, type PlanVolume } from '@/engine/planning/volume';
import { weekStart } from '@/engine/training/progress';
import { library, muscleById, REGIONS } from '@/features/library/catalog';
import type { Plan, PlanDayEntry, PlanItemEntry, Unit } from '@/storage/types';

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
const regionOf = (g: string): Region => (LOWER.has(g) ? 'lower' : UPPER.has(g) ? 'upper' : 'trunk');

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

export const volumeOf = (days: readonly PlanDayEntry[], setsFactor = 1): PlanVolume => planVolume(days, catalogEntry, setsFactor);

export const weeksOf = (p: Pick<Plan, 'weeks' | 'deload'>) => mesocycle(planning.mesocycle.value, p.weeks, p.deload);

export { weekStart };

/** Prioridade inicial sugerida: nada priorizado, tudo mantido. A pessoa escolhe. */
export function initialPriorities(): Record<string, Priority> {
  return Object.fromEntries(plannableGroups.map((g) => [g, 'manter' as Priority]));
}

// ---- Divisões, prescrição, substituição ----

const TRUNK: readonly string[] = REGIONS.find((r) => r.id === 'trunk')?.groups ?? [];
const UPPER_G = [...UPPER];
const LOWER_G = [...LOWER];

/** Grupos que cada foco aceita. Tronco (abdome, eretores, pescoço) entra onde faz sentido mecânico. */
export const FOCUS_GROUPS: Readonly<Record<DayFocus, readonly string[] | null>> = {
  full: null,
  upper: [...UPPER_G, ...TRUNK],
  lower: [...LOWER_G, ...TRUNK],
  push: ['chest', 'delts', 'elbow_extensors', 'abdominals'],
  pull: ['lats', 'traps', 'scapular', 'rotator_cuff', 'elbow_flexors', 'forearm', 'spinal_erectors', 'neck'],
  legs: [...LOWER_G, 'abdominals', 'spinal_erectors'],
  chest_back: ['chest', 'lats', 'traps', 'scapular', 'spinal_erectors', 'abdominals'],
  shoulders_arms: ['delts', 'rotator_cuff', 'elbow_flexors', 'elbow_extensors', 'forearm', 'neck', 'abdominals'],
  torso: ['chest', 'lats', 'traps', 'scapular', 'delts', 'rotator_cuff', ...TRUNK],
  limbs: ['elbow_flexors', 'elbow_extensors', 'forearm', ...LOWER_G],
  chest: ['chest', 'abdominals'],
  back: ['lats', 'traps', 'scapular', 'spinal_erectors', 'rotator_cuff'],
  shoulders: ['delts', 'rotator_cuff', 'neck', 'abdominals'],
  arms: ['elbow_flexors', 'elbow_extensors', 'forearm'],
  custom: [],
};

export function splitOf(id: SplitId, days: number, custom: readonly (readonly string[])[] = []): SplitDay[] {
  return splitDays(id, days, (f) => FOCUS_GROUPS[f], custom);
}

export interface BuildInput {
  split: SplitId;
  days: number;
  customDays: string[][];
  priorities: Record<string, Priority>;
  targets: Record<string, number>;
  equipment: string[];
}

const cfgFull = { ...config, rest: planning.rest.value };

export function buildPlanDays(input: BuildInput): PlanDayEntry[] {
  const split = splitOf(input.split, input.days, input.customDays);
  return generatePlan({ ...input, days: split.length, split, regionOf, catalog: catalogList, config: cfgFull }).map((d) => ({
    id: d.id,
    focus: d.focus,
    ...(d.groups && { groups: d.groups }),
    items: d.items.map((i) => ({ exerciseId: i.exerciseId, sets: i.sets, reps: [i.reps[0], i.reps[1]] as [number, number], ...(i.restSec && { restSec: i.restSec }) })),
  }));
}

export const unplaced = (input: Pick<BuildInput, 'split' | 'days' | 'customDays' | 'targets' | 'priorities'>): string[] =>
  unplacedGroups(
    splitOf(input.split, input.days, input.customDays),
    Object.fromEntries(Object.entries(input.targets).filter(([g]) => input.priorities[g] !== 'fora' && plannableGroups.includes(g as MuscleGroup))),
  );

/** Prescrição nova para um exercício posto à mão. */
export function defaultItem(exerciseId: string): PlanItemEntry {
  const iso = catalogIndex.get(exerciseId)?.isolated ?? false;
  const reps = iso ? planning.reps.value.isolado : planning.reps.value.composto;
  return { exerciseId, sets: 3, reps: [reps[0], reps[1]], restSec: iso ? planning.rest.value.isolado : planning.rest.value.composto };
}

export const restOf = (it: PlanItemEntry): number =>
  it.restSec ?? ((catalogIndex.get(it.exerciseId)?.isolated ?? false) ? planning.rest.value.isolado : planning.rest.value.composto);

export const substitutesFor = (id: string, equipment: readonly string[], exclude: readonly string[] = []) =>
  substitutes(id, catalogList, equipment, exclude).map((x) => x.id);

export const isIsolated = (id: string): boolean => catalogIndex.get(id)?.isolated ?? false;

/** Equipamento que define o salto de carga do exercício. */
export function incrementKind(exerciseId: string): keyof PlanningFile['progression']['value']['increment']['kg'] {
  const eq = catalogIndex.get(exerciseId)?.equipment ?? [];
  if (eq.includes('barra')) return 'barra';
  if (eq.includes('halteres')) return 'halteres';
  if (eq.includes('maquina')) return 'maquina';
  if (eq.includes('polia')) return 'polia';
  return eq.includes('peso_corporal') ? 'peso_corporal' : 'maquina';
}

export const incrementFor = (exerciseId: string, unit: Unit): number => planning.progression.value.increment[unit][incrementKind(exerciseId)];
export const usesBarbell = (exerciseId: string): boolean => (catalogIndex.get(exerciseId)?.equipment ?? []).includes('barra');

/** Perfis de equipamento prontos. Os salvos pela pessoa ficam no banco (`profiles`). */
export const EQUIPMENT_ALL = ['barra', 'halteres', 'maquina', 'polia', 'banco', 'rack', 'peso_corporal'] as const;
export const BUILTIN_PROFILES: readonly { id: 'gym' | 'machines' | 'home' | 'bodyweight'; equipment: readonly string[] }[] = [
  { id: 'gym', equipment: EQUIPMENT_ALL },
  { id: 'machines', equipment: ['maquina', 'polia', 'banco', 'peso_corporal'] },
  { id: 'home', equipment: ['halteres', 'banco', 'peso_corporal'] },
  { id: 'bodyweight', equipment: ['peso_corporal'] },
];
export const exercisesWith = (equipment: readonly string[]): number => catalogList.filter((e) => hasEquipment(e, equipment)).length;
