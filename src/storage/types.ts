/**
 * Entidades do tracker. `updatedAt` e `deletedAt` (lápide) existem desde já para que um
 * adaptador de sincronização possa ser escrito no futuro sem migração destrutiva.
 */
export interface Entity {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Session extends Entity {
  mesocycleId?: string;
  week?: number;
  dayId?: string;
  startedAt: number;
  endedAt?: number;
  notes?: string;
}

export type SetKind = 'aquecimento' | 'trabalho' | 'drop' | 'rest-pause';

export interface SetEntry extends Entity {
  sessionId: string;
  exerciseId: string;
  variantId?: string;
  order: number;
  kind: SetKind;
  reps: number;
  loadKg: number;
  rir?: number;
  rpe?: number;
  restSec?: number;
  note?: string;
}

export interface NewSet {
  exerciseId: string;
  variantId?: string;
  kind?: SetKind;
  reps: number;
  loadKg: number;
  rir?: number;
  note?: string;
}

/** Porta do armazenamento. A UI depende disto, não do Dexie. */
export interface TrainingRepository {
  logSet(input: NewSet, now?: number): Promise<SetEntry>;
  recentSets(exerciseId: string, limit?: number): Promise<SetEntry[]>;
  deleteSet(id: string, now?: number): Promise<void>;
}
