import type { DayFocus, Technique } from '@/engine/planning/types';
import type { SplitId } from '@/engine/planning/splits';

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

/** Item de um dia do plano: a prescrição do exercício. */
export interface PlanItemEntry {
  exerciseId: string;
  sets: number;
  reps: [number, number];
  /** Descanso entre séries (s). */
  restSec?: number;
  /** RIR fixo; ausente = segue o mesociclo. */
  rir?: number;
  technique?: Technique;
  /** Em superssérie com o item seguinte. */
  superset?: boolean;
}

export interface PlanDayEntry {
  id: string;
  focus: DayFocus;
  /** Dia personalizado: os grupos escolhidos. */
  groups?: string[];
  items: PlanItemEntry[];
}

export type PlanPriority = 'priorizar' | 'manter' | 'fora';

/**
 * Plano (mesociclo). Começado = `startedAt`; o ativo é o começado mais recente sem `endedAt`.
 * Sessões registradas com o plano levam `mesocycleId` = id do plano.
 */
export interface Plan extends Entity {
  name: string;
  /** Divisão. Planos da Fase 5 não tinham: `migratePlan` deduz pelo número de dias. */
  split: SplitId;
  weeks: number;
  deload: boolean;
  equipment: string[];
  priorities: Record<string, PlanPriority>;
  /** Séries diretas por semana por grupo. */
  targets: Record<string, number>;
  days: PlanDayEntry[];
  startedAt?: number;
  endedAt?: number;
}

/** Contexto do plano no momento do registro. */
export interface PlanContext {
  mesocycleId: string;
  week: number;
  dayId: string;
}

export interface NewSet {
  /** Sessão nova nasce com este contexto; sessão aberta sem plano o recebe. */
  plan?: PlanContext;
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

export type Unit = 'kg' | 'lb';

export interface EquipmentProfile {
  id: string;
  name: string;
  equipment: string[];
}

/** Preferência salva. Um registro por chave (`id`), mescla como as outras entidades. */
export type Setting = Entity & ({ id: 'unit'; value: Unit } | { id: 'profiles'; value: EquipmentProfile[] });
export type SettingId = Setting['id'];
export type SettingValue<K extends SettingId> = Extract<Setting, { id: K }>['value'];

export type MeasureKind = 'weight' | 'waist' | 'hips' | 'chest' | 'arm' | 'thigh' | 'calf';
export const MEASURE_KINDS: readonly MeasureKind[] = ['weight', 'waist', 'hips', 'chest', 'arm', 'thigh', 'calf'];

/** Medida corporal: peso em kg, circunferências em cm. */
export interface Measure extends Entity {
  at: number;
  kind: MeasureKind;
  value: number;
}

/**
 * Arquivo de backup. Versão sobe quando o formato muda; a leitura aceita as anteriores.
 * v1 (Fases 4–13): sessões, séries, planos. v2 (Fase 14): + preferências e medidas; plano com divisão.
 */
export const BACKUP_APP = 'sbl-view';
export const BACKUP_VERSION = 2;
export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: number;
  sessions: Session[];
  sets: SetEntry[];
  /** Ausente em backups anteriores à Fase 5. */
  plans?: Plan[];
  /** Ausentes em backups v1. */
  settings?: Setting[];
  measures?: Measure[];
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
  /** Planos vivos, mais recentes primeiro. */
  listPlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  /** Grava (cria ou substitui) e carimba `updatedAt`. */
  savePlan(plan: Plan, now?: number): Promise<Plan>;
  deletePlan(id: string, now?: number): Promise<void>;
  /** Começado e não encerrado, o mais recente. */
  activePlan(): Promise<Plan | undefined>;
  /** Sessões vivas do mesociclo, mais antigas primeiro, com as séries. */
  planSessions(planId: string): Promise<SessionWithSets[]>;
  getSetting<K extends SettingId>(id: K): Promise<SettingValue<K> | undefined>;
  putSetting<K extends SettingId>(id: K, value: SettingValue<K>, now?: number): Promise<void>;
  /** Medidas vivas, mais antigas primeiro. */
  listMeasures(): Promise<Measure[]>;
  addMeasure(m: { kind: MeasureKind; value: number; at?: number }, now?: number): Promise<Measure>;
  deleteMeasure(id: string, now?: number): Promise<void>;
}
