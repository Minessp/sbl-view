import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDexieRepository, newId, SblDb } from './db';

let n = 0;
const fresh = () => createDexieRepository(new SblDb(`test-${n++}`));

describe('repositório de treino (IndexedDB)', () => {
  it('ids são ordenáveis por tempo', () => {
    expect(newId(1000) < newId(2000)).toBe(true);
  });

  it('agrupa séries próximas na mesma sessão e numera em ordem', async () => {
    const repo = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    const a = await repo.logSet({ exerciseId: 'squat', variantId: 'high_bar', reps: 5, loadKg: 100, rir: 2 }, t0);
    const b = await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0 + 3 * 60_000);
    expect(b.sessionId).toBe(a.sessionId);
    expect([a.order, b.order]).toEqual([0, 1]);
    expect(a.rir).toBe(2);
    expect('rir' in b).toBe(false);
  });

  it('abre nova sessão depois de 4 h', async () => {
    const repo = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    const a = await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0);
    const b = await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0 + 5 * 3_600_000);
    expect(b.sessionId).not.toBe(a.sessionId);
  });

  it('lista as mais recentes primeiro e esconde as apagadas (lápide)', async () => {
    const repo = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    const s1 = await repo.logSet({ exerciseId: 'squat', reps: 8, loadKg: 80 }, t0);
    await repo.logSet({ exerciseId: 'squat', reps: 6, loadKg: 90 }, t0 + 60_000);
    await repo.logSet({ exerciseId: 'bench', reps: 6, loadKg: 60 }, t0 + 120_000);
    await repo.deleteSet(s1.id, t0 + 180_000);
    const list = await repo.recentSets('squat');
    expect(list.map((s) => s.loadKg)).toEqual([90]);
  });
});
