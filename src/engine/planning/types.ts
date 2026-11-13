/** Tipos do planejador. Puro: sem dado importado, tudo chega por parâmetro. */

export type Priority = 'priorizar' | 'manter' | 'fora';
export const PRIORITIES: readonly Priority[] = ['priorizar', 'manter', 'fora'];

/** Região que decide em quais dias da divisão o grupo pode entrar. */
export type Region = 'upper' | 'lower' | 'trunk';
/** Foco do dia na divisão. */
export type DayFocus = 'full' | 'upper' | 'lower';

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

export interface PlanItem {
  exerciseId: string;
  sets: number;
  reps: readonly [number, number];
}

export interface PlanDay {
  id: string;
  focus: DayFocus;
  items: PlanItem[];
}

export interface PlanConfig {
  maxSetsPerSession: number;
  maxSetsPerSlot: number;
  /** Mínimo de dias por semana para grupo priorizado. */
  frequency: number;
  reps: { composto: readonly [number, number]; isolado: readonly [number, number] };
  preferLong: boolean;
}

export interface GenerateInput {
  days: number;
  /** Séries diretas por semana que cada grupo deve receber (0 = fora). */
  targets: Readonly<Record<string, number>>;
  priorities: Readonly<Record<string, Priority>>;
  /** Equipamento disponível. Vazio = qualquer. */
  equipment: readonly string[];
  regionOf: (group: string) => Region;
  catalog: readonly CatalogEntry[];
  config: PlanConfig;
}
