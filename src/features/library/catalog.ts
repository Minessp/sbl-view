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
/** Cartaz do exercício (scripts/posters.mjs). Slug à mão: o palco importa este arquivo e `@/app/routes` depende do idioma. */
export const posterSrc = (id: string): string => `${import.meta.env.BASE_URL}posters/${id.replaceAll('_', '-')}.webp`;

/** Ordem de leitura do Atlas: de cima para baixo, de dentro para fora. */
export const REGIONS: { id: string; groups: MuscleGroup[] }[] = [
  { id: 'head', groups: ['face', 'jaw', 'hyoid'] },
  { id: 'trunk', groups: ['neck', 'thorax', 'abdominals', 'spinal_erectors'] },
  { id: 'upper', groups: ['traps', 'scapular', 'lats', 'chest', 'delts', 'rotator_cuff', 'shoulder', 'elbow_flexors', 'elbow_extensors', 'forearm', 'hand'] },
  { id: 'hip', groups: ['gluteals', 'hip_flexors', 'adductors', 'quadriceps', 'hamstrings'] },
  { id: 'leg', groups: ['triceps_surae', 'shin', 'foot'] },
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

/** Parte do corpo do exercício: a região do Atlas do primeiro músculo-alvo (quadril e perna = inferiores). */
export type ExerciseRegion = 'lower' | 'upper' | 'trunk';
export const EXERCISE_REGIONS: readonly ExerciseRegion[] = ['lower', 'upper', 'trunk'];

const groupRegion = new Map(REGIONS.flatMap((r) => r.groups.map((g) => [g, r.id] as const)));

export function exerciseRegion(e: LibraryExercise): ExerciseRegion {
  const first = e.targets.find((t) => t.role === 'alvo');
  const g = first ? muIndex.get(first.muscle)?.group : undefined;
  const r = g ? groupRegion.get(g) : undefined;
  return r === 'upper' ? 'upper' : r === 'trunk' || r === 'head' ? 'trunk' : 'lower';
}

/** Texto para busca: minúsculo e sem acento. */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export interface ExerciseFilters {
  /** Busca por nome ou por músculo-alvo. */
  query: string;
  region: ExerciseRegion | null;
  group: MuscleGroup | null;
  equipment: readonly Equipment[];
  pattern: MovementPattern | null;
  status: 'consolidado' | 'hipotese' | null;
  /** Só exercícios que carregam o alvo alongado. */
  longOnly: boolean;
  /** Músculo tocado no corpo: exercícios em que ele trabalha (alvo ou sinergista). */
  muscle: string | null;
}

export const NO_FILTERS: ExerciseFilters = { query: '', region: null, group: null, equipment: [], pattern: null, status: null, longOnly: false, muscle: null };

/**
 * Filtro da biblioteca. Equipamento é "tem tudo isto?": marcar barra e banco mostra
 * só o que usa os dois. Grupo considera só músculos-alvo, não sinergistas.
 */
export function filterExercises(list: readonly LibraryExercise[], f: ExerciseFilters): LibraryExercise[] {
  const q = fold(f.query.trim());
  return list.filter((e) => {
    if (f.region && exerciseRegion(e) !== f.region) return false;
    if (q && !fold(e.name).includes(q) && !e.targets.some((t) => t.role === 'alvo' && fold(muIndex.get(t.muscle)?.name ?? '').includes(q))) return false;
    if (f.pattern && e.pattern !== f.pattern) return false;
    if (f.status && e.status !== f.status) return false;
    if (f.longOnly && e.length.emphasis !== 'alongado') return false;
    if (f.equipment.some((q) => !e.equipment.includes(q))) return false;
    if (f.group && !e.targets.some((t) => t.role === 'alvo' && muIndex.get(t.muscle)?.group === f.group)) return false;
    if (f.muscle && !e.targets.some((t) => t.muscle === f.muscle)) return false;
    return true;
  });
}

/** Filtros na URL (`?q=&parte=&grupo=&musculo=&eq=&padrao=&status=&longo=1`); só o que difere do vazio. */
export function toQuery(f: ExerciseFilters): string {
  const p = new URLSearchParams();
  if (f.query.trim()) p.set('q', f.query.trim());
  if (f.region) p.set('parte', f.region);
  if (f.group) p.set('grupo', f.group);
  if (f.muscle) p.set('musculo', f.muscle);
  if (f.equipment.length) p.set('eq', f.equipment.join(','));
  if (f.pattern) p.set('padrao', f.pattern);
  if (f.status) p.set('status', f.status);
  if (f.longOnly) p.set('longo', '1');
  const s = p.toString();
  return s ? `?${s}` : '';
}

const KNOWN_EQUIPMENT = new Set(library.flatMap((e) => e.equipment));
const KNOWN_PATTERNS = new Set(library.map((e) => e.pattern));
const KNOWN_GROUPS = new Set(REGIONS.flatMap((r) => r.groups));
const pick = <T extends string>(v: string | null, ok: (v: string) => boolean): T | null => (v && ok(v) ? (v as T) : null);

/** Lê a URL; valor desconhecido (link velho, digitado à mão) é ignorado. */
export function fromQuery(search: string): ExerciseFilters {
  const p = new URLSearchParams(search);
  return {
    query: p.get('q') ?? '',
    region: pick<ExerciseRegion>(p.get('parte'), (v) => (EXERCISE_REGIONS as readonly string[]).includes(v)),
    group: pick<MuscleGroup>(p.get('grupo'), (v) => KNOWN_GROUPS.has(v as MuscleGroup)),
    muscle: pick<string>(p.get('musculo'), (v) => muIndex.has(v)),
    equipment: (p.get('eq') ?? '').split(',').filter((q): q is Equipment => KNOWN_EQUIPMENT.has(q as Equipment)),
    pattern: pick<MovementPattern>(p.get('padrao'), (v) => KNOWN_PATTERNS.has(v as MovementPattern)),
    status: pick<'consolidado' | 'hipotese'>(p.get('status'), (v) => v === 'consolidado' || v === 'hipotese'),
    longOnly: p.get('longo') === '1',
  };
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
