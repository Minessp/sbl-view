import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { parseBackup } from './backup';
import { createDexieRepository, newId, SblDb } from './db';
import { mergeById } from './merge';

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

  it('lista geral junta exercícios, mais recentes primeiro, sem apagadas', async () => {
    const repo = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0);
    const b = await repo.logSet({ exerciseId: 'leg_extension', reps: 12, loadKg: 40 }, t0 + 60_000);
    await repo.logSet({ exerciseId: 'seated_leg_curl', reps: 10, loadKg: 35 }, t0 + 120_000);
    await repo.deleteSet(b.id, t0 + 130_000);
    const all = await repo.recentAll(10);
    expect(all.map((s) => s.exerciseId)).toEqual(['seated_leg_curl', 'squat']);
  });

  it('edita série: muda campos, apaga opcionais com null e avança updatedAt', async () => {
    const repo = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    const a = await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100, rir: 2, note: 'ok' }, t0);
    await repo.updateSet(a.id, { loadKg: 102.5, reps: 4, rir: null, note: null, kind: 'drop' }, t0 + 1000);
    const [b] = await repo.recentSets('squat');
    expect(b).toMatchObject({ loadKg: 102.5, reps: 4, kind: 'drop', updatedAt: t0 + 1000 });
    expect(b && 'rir' in b).toBe(false);
    expect(b && 'note' in b).toBe(false);
  });

  it('sessão aberta, encerrar e nova sessão logo depois', async () => {
    const repo = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    const a = await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0);
    const open = await repo.openSession(t0 + 60_000);
    expect(open?.session.id).toBe(a.sessionId);
    expect(open?.sets).toHaveLength(1);
    await repo.endSession(a.sessionId, t0 + 120_000);
    expect(await repo.openSession(t0 + 130_000)).toBeUndefined();
    const b = await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0 + 180_000);
    expect(b.sessionId).not.toBe(a.sessionId);
  });

  it('histórico lista sessões com série viva, mais recentes primeiro; apagar sessão apaga as séries', async () => {
    const repo = fresh();
    const t0 = Date.UTC(2026, 10, 10, 10);
    const a = await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0);
    const b = await repo.logSet({ exerciseId: 'bench', reps: 5, loadKg: 60 }, t0 + 86_400_000);
    await repo.logSet({ exerciseId: 'bench', reps: 5, loadKg: 62.5 }, t0 + 86_400_000 + 60_000);
    const c = await repo.logSet({ exerciseId: 'row', reps: 8, loadKg: 50 }, t0 + 2 * 86_400_000);
    await repo.deleteSet(c.id, t0 + 2 * 86_400_000 + 1);
    await repo.setSessionNotes(b.sessionId, '  pesado  ', t0 + 86_400_000 + 120_000);
    const list = await repo.listSessions();
    expect(list.map((s) => s.session.id)).toEqual([b.sessionId, a.sessionId]);
    expect(list[0]?.sets.map((s) => s.loadKg)).toEqual([60, 62.5]);
    expect(list[0]?.session.notes).toBe('pesado');
    await repo.deleteSession(b.sessionId, t0 + 3 * 86_400_000);
    expect((await repo.listSessions()).map((s) => s.session.id)).toEqual([a.sessionId]);
    expect(await repo.counts()).toEqual({ sessions: 2, sets: 1 });
  });

  it('backup ida e volta: exporta, valida, importa em outro aparelho; reimportar não duplica', async () => {
    const src = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    await src.logSet({ exerciseId: 'squat', variantId: 'high_bar', reps: 5, loadKg: 100, rir: 2 }, t0);
    const gone = await src.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0 + 60_000);
    await src.deleteSet(gone.id, t0 + 70_000);
    const file = JSON.stringify(await src.exportAll(t0 + 80_000));

    const parsed = parseBackup(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const dst = fresh();
    expect(await dst.importBackup(parsed.backup)).toEqual({ added: 2, updated: 0, kept: 0 });
    expect(await dst.importBackup(parsed.backup)).toEqual({ added: 0, updated: 0, kept: 2 });
    const live = await dst.allSets();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ variantId: 'high_bar', rir: 2 });
  });

  it('importar traz a lápide mais nova e não ressuscita o que foi apagado aqui', async () => {
    const a = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    const s = await a.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 }, t0);
    const snapshot = await a.exportAll(t0 + 1);
    await a.deleteSet(s.id, t0 + 2);
    const r = parseBackup(JSON.stringify(snapshot));
    if (!r.ok) throw new Error(r.error);
    expect(await a.importBackup(r.backup)).toEqual({ added: 0, updated: 0, kept: 1 });
    expect(await a.allSets()).toHaveLength(0);
  });

  it('planos: grava, ativo é o começado mais recente, sessão leva o contexto, backup carrega', async () => {
    const repo = fresh();
    const t0 = Date.UTC(2026, 10, 12, 10);
    const base = {
      name: 'Plano',
      weeks: 5,
      deload: true,
      equipment: [],
      priorities: { quadriceps: 'priorizar' as const },
      targets: { quadriceps: 12 },
      days: [{ id: 'A', focus: 'full' as const, items: [{ exerciseId: 'squat', sets: 4, reps: [6, 10] as [number, number] }] }],
      createdAt: t0,
      updatedAt: t0,
    };
    await repo.savePlan({ ...base, id: 'p1' }, t0);
    expect(await repo.activePlan()).toBeUndefined();
    await repo.savePlan({ ...base, id: 'p2', startedAt: t0 }, t0 + 1);
    await repo.savePlan({ ...base, id: 'p3', startedAt: t0 + 10 }, t0 + 2);
    expect((await repo.activePlan())?.id).toBe('p3');
    await repo.savePlan({ ...base, id: 'p3', startedAt: t0 + 10, endedAt: t0 + 20 }, t0 + 3);
    expect((await repo.activePlan())?.id).toBe('p2');
    await repo.deletePlan('p2', t0 + 4);
    expect(await repo.activePlan()).toBeUndefined();
    expect((await repo.listPlans()).map((p) => p.id)).toEqual(['p3', 'p1']);

    await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100, plan: { mesocycleId: 'p1', week: 1, dayId: 'A' } }, t0 + 100);
    const ps = await repo.planSessions('p1');
    expect(ps).toHaveLength(1);
    expect(ps[0]?.session).toMatchObject({ mesocycleId: 'p1', week: 1, dayId: 'A' });

    const parsed = parseBackup(JSON.stringify(await repo.exportAll(t0 + 200)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const dst = fresh();
    await dst.importBackup(parsed.backup);
    expect((await dst.listPlans()).map((p) => p.id)).toEqual(['p3', 'p1']);
  });

  it('backup sem planos (anterior à Fase 5) continua válido', () => {
    const r = parseBackup(JSON.stringify({ app: 'sbl-view', version: 1, exportedAt: 1, sessions: [], sets: [] }));
    expect(r.ok).toBe(true);
  });

  it('apagar tudo esvazia o banco', async () => {
    const repo = fresh();
    await repo.logSet({ exerciseId: 'squat', reps: 5, loadKg: 100 });
    await repo.wipe();
    expect(await repo.counts()).toEqual({ sessions: 0, sets: 0 });
  });
});

describe('arquivo de backup', () => {
  const base = { app: 'sbl-view', version: 1, exportedAt: 1, sessions: [], sets: [] };
  it('recusa o que não é JSON, não é backup, é de versão mais nova ou está quebrado', () => {
    expect(parseBackup('{oi')).toMatchObject({ ok: false, error: 'not-json' });
    expect(parseBackup('{"app":"outro"}')).toMatchObject({ ok: false, error: 'not-backup' });
    expect(parseBackup(JSON.stringify({ ...base, version: 2 }))).toMatchObject({ ok: false, error: 'newer-version' });
    const bad = { ...base, sessions: [{ id: 's', createdAt: 1, updatedAt: 1, startedAt: 1 }], sets: [{ id: 'x', createdAt: 1, updatedAt: 1, sessionId: 's', exerciseId: 'squat', order: 0, kind: 'trabalho', reps: -1, loadKg: 10 }] };
    expect(parseBackup(JSON.stringify(bad))).toMatchObject({ ok: false, error: 'invalid' });
    const extra = { ...base, sessions: [{ id: 's', createdAt: 1, updatedAt: 1, startedAt: 1, evil: '<script>' }] };
    expect(parseBackup(JSON.stringify(extra))).toMatchObject({ ok: false, error: 'invalid' });
  });
  it('recusa série sem sessão no arquivo', () => {
    const orphan = { ...base, sets: [{ id: 'x', createdAt: 1, updatedAt: 1, sessionId: 'nada', exerciseId: 'squat', order: 0, kind: 'trabalho', reps: 5, loadKg: 10 }] };
    expect(parseBackup(JSON.stringify(orphan))).toMatchObject({ ok: false, error: 'orphan-sets' });
  });
  it('mescla: vence updatedAt maior; empate mantém o local', () => {
    const l = [{ id: 'a', createdAt: 0, updatedAt: 5 }, { id: 'b', createdAt: 0, updatedAt: 5 }];
    const i = [{ id: 'a', createdAt: 0, updatedAt: 9 }, { id: 'b', createdAt: 0, updatedAt: 5 }, { id: 'c', createdAt: 0, updatedAt: 1 }];
    const m = mergeById(l, i);
    expect(m.put.map((x) => x.id)).toEqual(['a', 'c']);
    expect(m.report).toEqual({ added: 1, updated: 1, kept: 1 });
  });
});
