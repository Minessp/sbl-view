/** Tipos do planejador. Puro: sem dado importado, tudo chega por parâmetro. */

export type Priority = 'priorizar' | 'manter' | 'fora';
export const PRIORITIES: readonly Priority[] = ['priorizar', 'manter', 'fora'];

/** Região que decide em quais dias da divisão legada (sem `split`) o grupo pode entrar. */
export type Region = 'upper' | 'lower' | 'trunk';

/**
 * Foco do dia. Os da divisão legada são `full | upper | lower`; as divisões da Fase 14 trazem
 * empurrar/puxar/pernas, Arnold, tronco/membros, por grupo e o dia personalizado.
 */
export type DayFocus =
  | 'full'
  | 'upper'
  | 'lower'
  | 'push'
  | 'pull'
  | 'legs'
  | 'chest_back'
  | 'shoulders_arms'
  | 'torso'
  | 'limbs'
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'custom';

export const DAY_FOCI: readonly DayFocus[] = [
  'full',
  'upper',
  'lower',
  'push',
  'pull',
  'legs',
  'chest_back',
  'shoulders_arms',
  'torso',
  'limbs',
  'chest',
  'back',
  'shoulders',
  'arms',
  'custom',
];

/** Um dia da divisão: o foco e os grupos que podem entrar nele (`null` = qualquer). */
export interface SplitDay {
  focus: DayFocus;
  groups: readonly string[] | null;
}

/** O que o planejador precisa saber de um exercício da biblioteca. */
export interface CatalogEntry {
  id: string;
  /** isolado = monoarticular; o resto conta como composto. */
  isolated: boolean;
  equipment: readonly string[];
  /** Carrega o alvo alongado. */
  long: boolean;
  targets: readonly { muscle: string; group: string; role: 'alvo' | 'sinergista' }[];
}

/** Técnica de intensidade prescrita para a última série (ou todas, nas parciais). */
export type Technique = 'none' | 'lengthened_partials' | 'myo_reps' | 'drop';
export const TECHNIQUES: readonly Technique[] = ['none', 'lengthened_partials', 'myo_reps', 'drop'];

export interface PlanItem {
  exerciseId: string;
  sets: number;
  reps: readonly [number, number];
  /** Descanso entre séries. */
  restSec?: number;
  /** Repetições na reserva fixas para o exercício; ausente = segue o mesociclo. */
  rir?: number;
  technique?: Technique;
  /** Em superssérie com o item seguinte do dia. */
  superset?: boolean;
}

export interface PlanDay {
  id: string;
  focus: DayFocus;
  /** Só no dia personalizado: os grupos escolhidos. */
  groups?: string[];
  items: PlanItem[];
}

export interface PlanConfig {
  maxSetsPerSession: number;
  maxSetsPerSlot: number;
  /** Mínimo de dias por semana para grupo priorizado. */
  frequency: number;
  reps: { composto: readonly [number, number]; isolado: readonly [number, number] };
  preferLong: boolean;
  /** Descanso padrão por tipo de exercício (s). Ausente = item sem descanso prescrito. */
  rest?: { composto: number; isolado: number };
}

export interface GenerateInput {
  days: number;
  /** Divisão explícita. Ausente = legada pelo número de dias (`splitFor` + `regionOf`). */
  split?: readonly SplitDay[];
  /** Séries diretas por semana que cada grupo deve receber (0 = fora). */
  targets: Readonly<Record<string, number>>;
  priorities: Readonly<Record<string, Priority>>;
  /** Equipamento disponível. Vazio = qualquer. */
  equipment: readonly string[];
  regionOf: (group: string) => Region;
  catalog: readonly CatalogEntry[];
  config: PlanConfig;
}
