/**
 * Catálogo: biblioteca de exercícios + músculos + movimentos, com consultas puras.
 * Sem three.js e sem React: usado pelas páginas, pela cena do Atlas e pelos testes.
 */
import libraryJson from '@/data/exercises/library.json';
import movementsJson from '@/data/movements.json';
import { muscleDefs } from '@/data';
import type { Equipment, LengthEmphasis, LibraryExercise, MovementPattern } from '@/data/schema/exercise';
import type { MuscleDef, MuscleGroup, Movement } from '@/data/schema/muscle';

export const library = libraryJson as unknown as LibraryExercise[];
export const movements = movementsJson as unknown as Movement[];

const exIndex = new Map(library.map((e) => [e.id, e]));
const muIndex = new Map(muscleDefs.map((m) => [m.id, m]));
const mvIndex = new Map(movements.map((m) => [m.id, m]));

export const exerciseById = (id: string): LibraryExercise | undefined => exIndex.get(id);
export const muscleById = (id: string): MuscleDef | undefined => muIndex.get(id);
export const movementById = (id: string): Movement | undefined => mvIndex.get(id);

/** Ordem de leitura do Atlas: de cima para baixo, de dentro para fora. */
export const REGIONS: { id: string; groups: MuscleGroup[] }[] = [
  { id: 'trunk', groups: ['neck', 'abdominals', 'spinal_erectors'] },
  { id: 'upper', groups: ['traps', 'scapular', 'lats', 'chest', 'delts', 'rotator_cuff', 'elbow_flexors', 'elbow_extensors', 'forearm'] },
  { id: 'hip', groups: ['gluteals', 'hip_flexors', 'adductors', 'quadriceps', 'hamstrings'] },
  { id: 'leg', groups: ['triceps_surae', 'shin'] },
];

export const musclesInGroup = (g: MuscleGroup): MuscleDef[] => muscleDefs.filter((m) => m.group === g);

/** Grupos que aparecem como alvo em algum exercício (opções do filtro). */
export function targetGroups(list: readonly LibraryExercise[] = library): MuscleGroup[] {
  const seen = new Set<MuscleGroup>();
  for (const e of list) for (const t of e.targets) if (t.role === 'alvo') {
    const m = muIndex.get(t.muscle);
    if (m) seen.add(m.group);
  }
  return REGIONS.flatMap((r) => r.groups).filter((g) => seen.has(g));
}

export interface ExerciseFilters {
  group: MuscleGroup | null;
  equipment: readonly Equipment[];
  pattern: MovementPattern | null;
  status: 'consolidado' | 'hipotese' | null;
  /** Só exercícios que carregam o alvo alongado. */
  longOnly: boolean;
}

export const NO_FILTERS: ExerciseFilters = { group: null, equipment: [], pattern: null, status: null, longOnly: false };

/**
 * Filtro da biblioteca. Equipamento é "tem tudo isto?": marcar barra e banco mostra
 * só o que usa os dois. Grupo considera só músculos-alvo, não sinergistas.
 */
export function filterExercises(list: readonly LibraryExercise[], f: ExerciseFilters): LibraryExercise[] {
  return list.filter((e) => {
    if (f.pattern && e.pattern !== f.pattern) return false;
    if (f.status && e.status !== f.status) return false;
    if (f.longOnly && e.length.emphasis !== 'alongado') return false;
    if (f.equipment.some((q) => !e.equipment.includes(q))) return false;
    if (f.group && !e.targets.some((t) => t.role === 'alvo' && muIndex.get(t.muscle)?.group === f.group)) return false;
    return true;
  });
}

export interface MuscleUse {
  exercise: LibraryExercise;
  role: 'alvo' | 'sinergista';
  emphasis: LengthEmphasis;
}

/** Exercícios que usam o músculo, alvos primeiro. */
export function exercisesForMuscle(muscleId: string): MuscleUse[] {
  const out: MuscleUse[] = [];
  for (const e of library) {
    const t = e.targets.find((x) => x.muscle === muscleId);
    if (t) out.push({ exercise: e, role: t.role, emphasis: e.length.emphasis });
  }
  return out.sort((a, b) => (a.role === b.role ? 0 : a.role === 'alvo' ? -1 : 1));
}

/** Ids de referência citados por um músculo (anatomia, ações, geometria). */
export function muscleRefIds(m: MuscleDef): string[] {
  const ids = new Set<string>();
  m.anatomy.source.forEach((s) => ids.add(s.refId));
  m.actions.forEach((a) => a.evidence.source.forEach((s) => ids.add(s.refId)));
  // Geometria: malha do Z-Anatomy; contornos de cilindro são autorais.
  ids.add('zanatomy');
  m.parts.forEach((p) => p.wrap?.evidence.source.forEach((s) => ids.add(s.refId)));
  return [...ids];
}
