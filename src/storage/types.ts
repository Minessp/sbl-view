/**
 * Entidades do tracker. `updatedAt` e `deletedAt` (lápide) existem desde já para que um
 * adaptador de sincronização possa ser escrito no futuro sem migração destrutiva.
 * O backup mescla pelas mesmas regras: vence o registro com `updatedAt` maior.
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
export const SET_KINDS: readonly SetKind[] = ['trabalho', 'aquecimento', 'drop', 'rest-pause'];

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

/** Edição de série. `null` apaga o campo opcional. */
export interface SetPatch {
  loadKg?: number;
  reps?: number;
  kind?: SetKind;
  rir?: number | null;
  note?: string | null;
}

/** Sessão com as séries vivas, em ordem de registro. */
export interface SessionWithSets {
  session: Session;
  sets: SetEntry[];
}

/** Arquivo de backup. Versão sobe quando o formato muda de modo incompatível. */
export const BACKUP_APP = 'sbl-view';
export const BACKUP_VERSION = 1;
export interface Backup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  sessions: Session[];
  sets: SetEntry[];
}

export interface ImportReport {
  added: number;
  updated: number;
  /** Já estavam iguais ou mais novos neste aparelho. */
  kept: number;
}

/** Porta do armazenamento. A UI depende disto, não do Dexie. */
export interface TrainingRepository {
  logSet(input: NewSet, now?: number): Promise<SetEntry>;
  recentSets(exerciseId: string, limit?: number): Promise<SetEntry[]>;
  /** Últimas séries de qualquer exercício, mais recentes primeiro. */
  recentAll(limit?: number): Promise<SetEntry[]>;
  deleteSet(id: string, now?: number): Promise<void>;
  updateSet(id: string, patch: SetPatch, now?: number): Promise<void>;
  /** Sessão que ainda recebe séries (aberta, com menos de 4 h). */
  openSession(now?: number): Promise<SessionWithSets | undefined>;
  endSession(id: string, now?: number): Promise<void>;
  setSessionNotes(id: string, notes: string, now?: number): Promise<void>;
  /** Apaga a sessão e as séries dela (lápide). */
  deleteSession(id: string, now?: number): Promise<void>;
  /** Sessões com ao menos uma série viva, mais recentes primeiro. */
  listSessions(limit?: number): Promise<SessionWithSets[]>;
  /** Todas as séries vivas, da mais antiga à mais nova. */
  allSets(): Promise<SetEntry[]>;
  counts(): Promise<{ sessions: number; sets: number }>;
  /** Tudo, inclusive lápides (para a mescla funcionar em outro aparelho). */
  exportAll(now?: number): Promise<Backup>;
  importBackup(backup: Backup): Promise<ImportReport>;
  /** Apaga de verdade, sem lápide. */
  wipe(): Promise<void>;
}
