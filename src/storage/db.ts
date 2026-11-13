/**
 * IndexedDB via Dexie. Esquema versionado: toda mudança de índice = nova `version()` com `upgrade`.
 * Fica só neste navegador; limpar os dados do site apaga tudo.
 */
import Dexie, { type EntityTable } from 'dexie';
import { mergeById } from './merge';
import { BACKUP_APP, BACKUP_VERSION, type NewSet, type Session, type SessionWithSets, type SetEntry, type TrainingRepository } from './types';

export class SblDb extends Dexie {
  sessions!: EntityTable<Session, 'id'>;
  sets!: EntityTable<SetEntry, 'id'>;

  constructor(name = 'sbl-view') {
    super(name);
    this.version(1).stores({
      sessions: 'id, startedAt, mesocycleId, updatedAt',
      sets: 'id, sessionId, exerciseId, [exerciseId+createdAt], createdAt, updatedAt',
    });
  }
}

/** Id ordenável por tempo (estilo ULID simplificado): tempo em base36 + aleatório. */
export function newId(now = Date.now()): string {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${now.toString(36).padStart(9, '0')}${Array.from(rand, (n) => n.toString(36).padStart(7, '0')).join('')}`;
}

/** Sessão aberta = começou há menos de 4 h e não foi encerrada. */
export const OPEN_WINDOW_MS = 4 * 60 * 60 * 1000;

const alive = <T extends { deletedAt?: number }>(x: T) => !x.deletedAt;
const byOrder = (a: SetEntry, b: SetEntry) => a.order - b.order || a.createdAt - b.createdAt;

export function createDexieRepository(db: SblDb): TrainingRepository {
  const findOpen = (now: number) =>
    db.sessions
      .where('startedAt')
      .above(now - OPEN_WINDOW_MS)
      .filter((s) => !s.endedAt && !s.deletedAt)
      .last();

  const liveSetsOf = async (sessionId: string) => (await db.sets.where('sessionId').equals(sessionId).filter(alive).toArray()).sort(byOrder);

  return {
    async logSet(input: NewSet, now = Date.now()) {
      return db.transaction('rw', db.sessions, db.sets, async () => {
        let session = await findOpen(now);
        if (!session) {
          session = { id: newId(now), createdAt: now, updatedAt: now, startedAt: now };
          await db.sessions.add(session);
        }
        // Ordem conta lápides também: nunca reaproveita número.
        const order = await db.sets.where('sessionId').equals(session.id).count();
        const entry: SetEntry = {
          id: newId(now),
          createdAt: now,
          updatedAt: now,
          sessionId: session.id,
          exerciseId: input.exerciseId,
          order,
          kind: input.kind ?? 'trabalho',
          reps: input.reps,
          loadKg: input.loadKg,
          ...(input.variantId !== undefined && { variantId: input.variantId }),
          ...(input.rir !== undefined && { rir: input.rir }),
          ...(input.note ? { note: input.note } : {}),
        };
        await db.sets.add(entry);
        await db.sessions.update(session.id, { updatedAt: now });
        return entry;
      });
    },
    async recentSets(exerciseId, limit = 12) {
      return db.sets
        .where('[exerciseId+createdAt]')
        .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
        .reverse()
        .filter(alive)
        .limit(limit)
        .toArray();
    },
    async recentAll(limit = 40) {
      return db.sets.orderBy('createdAt').reverse().filter(alive).limit(limit).toArray();
    },
    async deleteSet(id, now = Date.now()) {
      await db.sets.update(id, { deletedAt: now, updatedAt: now });
    },
    async updateSet(id, patch, now = Date.now()) {
      await db.sets
        .where('id')
        .equals(id)
        .modify((s) => {
          if (patch.loadKg !== undefined) s.loadKg = patch.loadKg;
          if (patch.reps !== undefined) s.reps = patch.reps;
          if (patch.kind !== undefined) s.kind = patch.kind;
          if (patch.rir === null) delete s.rir;
          else if (patch.rir !== undefined) s.rir = patch.rir;
          if (patch.note === null || patch.note === '') delete s.note;
          else if (patch.note !== undefined) s.note = patch.note;
          s.updatedAt = now;
        });
    },
    async openSession(now = Date.now()) {
      const session = await findOpen(now);
      return session && { session, sets: await liveSetsOf(session.id) };
    },
    async endSession(id, now = Date.now()) {
      await db.sessions.update(id, { endedAt: now, updatedAt: now });
    },
    async setSessionNotes(id, notes, now = Date.now()) {
      await db.sessions
        .where('id')
        .equals(id)
        .modify((s) => {
          const n = notes.trim();
          if (n) s.notes = n;
          else delete s.notes;
          s.updatedAt = now;
        });
    },
    async deleteSession(id, now = Date.now()) {
      await db.transaction('rw', db.sessions, db.sets, async () => {
        await db.sessions.update(id, { deletedAt: now, updatedAt: now });
        await db.sets
          .where('sessionId')
          .equals(id)
          .filter(alive)
          .modify({ deletedAt: now, updatedAt: now });
      });
    },
    async listSessions(limit = 60) {
      return db.transaction('r', db.sessions, db.sets, async () => {
        // Sessão sem série viva (todas apagadas) é rara: folga de 2× no recorte basta.
        const sessions = (await db.sessions.orderBy('startedAt').reverse().filter(alive).toArray()).slice(0, limit * 2);
        const sets = await db.sets
          .where('sessionId')
          .anyOf(sessions.map((s) => s.id))
          .filter(alive)
          .toArray();
        const bySession = new Map<string, SetEntry[]>();
        for (const s of sets) {
          const l = bySession.get(s.sessionId);
          if (l) l.push(s);
          else bySession.set(s.sessionId, [s]);
        }
        const out: SessionWithSets[] = [];
        for (const session of sessions) {
          const list = bySession.get(session.id);
          if (list?.length) out.push({ session, sets: list.sort(byOrder) });
          if (out.length >= limit) break;
        }
        return out;
      });
    },
    async allSets() {
      return db.sets.orderBy('createdAt').filter(alive).toArray();
    },
    async counts() {
      const [sessions, sets] = await Promise.all([db.sessions.filter(alive).count(), db.sets.filter(alive).count()]);
      return { sessions, sets };
    },
    async exportAll(now = Date.now()) {
      const [sessions, sets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()]);
      return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, sessions, sets };
    },
    async importBackup(backup) {
      return db.transaction('rw', db.sessions, db.sets, async () => {
        const [ls, lx] = await Promise.all([
          db.sessions.where('id').anyOf(backup.sessions.map((s) => s.id)).toArray(),
          db.sets.where('id').anyOf(backup.sets.map((s) => s.id)).toArray(),
        ]);
        const s = mergeById(ls, backup.sessions);
        const x = mergeById(lx, backup.sets);
        await db.sessions.bulkPut(s.put);
        await db.sets.bulkPut(x.put);
        // O relatório fala em séries: é o que a pessoa reconhece.
        return x.report;
      });
    },
    async wipe() {
      await db.transaction('rw', db.sessions, db.sets, async () => {
        await db.sessions.clear();
        await db.sets.clear();
      });
    },
  };
}

let instance: TrainingRepository | null = null;
export function repository(): TrainingRepository {
  instance ??= createDexieRepository(new SblDb());
  return instance;
}

/** Pede ao navegador para não despejar os dados sob pressão de espaço. Retorna se foi concedido. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageStatus {
  persisted: boolean | null;
  usageBytes: number | null;
}

export async function storageStatus(): Promise<StorageStatus> {
  try {
    const [persisted, est] = await Promise.all([
      navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(null),
      navigator.storage?.estimate ? navigator.storage.estimate() : Promise.resolve(null),
    ]);
    return { persisted, usageBytes: est?.usage ?? null };
  } catch {
    return { persisted: null, usageBytes: null };
  }
}
