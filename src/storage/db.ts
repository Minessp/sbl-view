/**
 * IndexedDB via Dexie. Esquema versionado: toda mudança de índice = nova `version()` com `upgrade`.
 * Fica só neste navegador; limpar os dados do site apaga tudo.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { NewSet, Session, SetEntry, TrainingRepository } from './types';

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
const OPEN_WINDOW_MS = 4 * 60 * 60 * 1000;

export function createDexieRepository(db: SblDb): TrainingRepository {
  return {
    async logSet(input: NewSet, now = Date.now()) {
      return db.transaction('rw', db.sessions, db.sets, async () => {
        let session = await db.sessions
          .where('startedAt')
          .above(now - OPEN_WINDOW_MS)
          .filter((s) => !s.endedAt && !s.deletedAt)
          .last();
        if (!session) {
          session = { id: newId(now), createdAt: now, updatedAt: now, startedAt: now };
          await db.sessions.add(session);
        }
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
        return entry;
      });
    },
    async recentSets(exerciseId, limit = 12) {
      const rows = await db.sets
        .where('[exerciseId+createdAt]')
        .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
        .reverse()
        .filter((s) => !s.deletedAt)
        .limit(limit)
        .toArray();
      return rows;
    },
    async recentAll(limit = 40) {
      return db.sets
        .orderBy('createdAt')
        .reverse()
        .filter((s) => !s.deletedAt)
        .limit(limit)
        .toArray();
    },
    async deleteSet(id, now = Date.now()) {
      await db.sets.update(id, { deletedAt: now, updatedAt: now });
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
