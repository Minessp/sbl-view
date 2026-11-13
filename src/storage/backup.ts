/**
 * Validação do arquivo de backup. Zod fica aqui (chunk da página de dados), nunca na shell.
 * A mescla está em `merge.ts`.
 */
import { z } from 'zod';
import { SPLIT_IDS } from '@/engine/planning/splits';
import { DAY_FOCI, TECHNIQUES } from '@/engine/planning/types';
import { migratePlan } from './migrate';
import { BACKUP_APP, BACKUP_VERSION, MEASURE_KINDS, SET_KINDS, type Backup } from './types';

const ms = z.number().int().nonnegative();
const entity = {
  id: z.string().min(1).max(64),
  createdAt: ms,
  updatedAt: ms,
  deletedAt: ms.optional(),
};

const SessionSchema = z.strictObject({
  ...entity,
  mesocycleId: z.string().max(64).optional(),
  week: z.number().int().optional(),
  dayId: z.string().max(64).optional(),
  startedAt: ms,
  endedAt: ms.optional(),
  notes: z.string().max(2000).optional(),
});

const SetSchema = z.strictObject({
  ...entity,
  sessionId: z.string().min(1).max(64),
  exerciseId: z.string().min(1).max(64),
  variantId: z.string().max(64).optional(),
  order: z.number().int().nonnegative(),
  kind: z.enum(SET_KINDS as [string, ...string[]]),
  reps: z.number().int().positive().max(1000),
  loadKg: z.number().nonnegative().max(2000),
  rir: z.number().int().min(0).max(20).optional(),
  rpe: z.number().min(0).max(10).optional(),
  restSec: z.number().nonnegative().optional(),
  note: z.string().max(2000).optional(),
});

const PlanItemSchema = z.strictObject({
  exerciseId: z.string().min(1).max(64),
  sets: z.number().int().positive().max(40),
  reps: z.tuple([z.number().int().positive().max(100), z.number().int().positive().max(100)]),
  restSec: z.number().int().nonnegative().max(1800).optional(),
  rir: z.number().int().min(0).max(10).optional(),
  technique: z.enum(TECHNIQUES as [string, ...string[]]).optional(),
  superset: z.boolean().optional(),
});

const PlanSchema = z.strictObject({
  ...entity,
  name: z.string().max(200),
  split: z.enum(SPLIT_IDS as [string, ...string[]]).optional(),
  weeks: z.number().int().min(1).max(16),
  deload: z.boolean(),
  equipment: z.array(z.string().max(64)).max(32),
  priorities: z.record(z.string().max(64), z.enum(['priorizar', 'manter', 'fora'])),
  targets: z.record(z.string().max(64), z.number().int().nonnegative().max(60)),
  days: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(16),
        focus: z.enum(DAY_FOCI as [string, ...string[]]),
        groups: z.array(z.string().max(64)).max(40).optional(),
        items: z.array(PlanItemSchema).max(30),
      }),
    )
    .min(1)
    .max(7),
  startedAt: ms.optional(),
  endedAt: ms.optional(),
});

const ProfileSchema = z.strictObject({ id: z.string().min(1).max(64), name: z.string().max(80), equipment: z.array(z.string().max(64)).max(32) });
const SettingSchema = z.union([
  z.strictObject({ ...entity, id: z.literal('unit'), value: z.enum(['kg', 'lb']) }),
  z.strictObject({ ...entity, id: z.literal('profiles'), value: z.array(ProfileSchema).max(50) }),
]);
const MeasureSchema = z.strictObject({ ...entity, at: ms, kind: z.enum(MEASURE_KINDS as [string, ...string[]]), value: z.number().positive().max(1000) });

const BackupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int(),
  exportedAt: ms,
  sessions: z.array(SessionSchema),
  sets: z.array(SetSchema),
  plans: z.array(PlanSchema).optional(),
  settings: z.array(SettingSchema).optional(),
  measures: z.array(MeasureSchema).optional(),
});

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export type ParseError = 'not-json' | 'not-backup' | 'newer-version' | 'invalid' | 'orphan-sets' | 'too-big';
export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: ParseError; detail?: string };

/** Lê o texto de um arquivo de backup. Nunca lança. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'too-big' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== BACKUP_APP) return { ok: false, error: 'not-backup' };
  const v = (raw as { version?: unknown }).version;
  if (typeof v === 'number' && v > BACKUP_VERSION) return { ok: false, error: 'newer-version' };
  const r = BackupSchema.safeParse(raw);
  if (!r.success || r.data.version < 1) {
    const issue = r.success ? undefined : r.error.issues[0];
    return { ok: false, error: 'invalid', ...(issue && { detail: `${issue.path.join('.')}: ${issue.message}` }) };
  }
  const sessionIds = new Set(r.data.sessions.map((s) => s.id));
  if (r.data.sets.some((s) => !sessionIds.has(s.sessionId))) return { ok: false, error: 'orphan-sets' };
  // v1 não tinha divisão no plano: mesma dedução da atualização do banco.
  const backup = r.data as Backup;
  return { ok: true, backup: { ...backup, ...(backup.plans && { plans: backup.plans.map(migratePlan) }) } };
}

/** Nome de arquivo com data local: sbl-view-2026-11-12.json */
export function backupFileName(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `sbl-view-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
