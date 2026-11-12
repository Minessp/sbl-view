/**
 * Validação do banco: roda no CI. Garante schema, referências existentes
 * e consistência entre músculos e esqueleto.
 */
import { describe, expect, it } from 'vitest';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import { buildMusclePaths } from '@/engine/muscle/paths';
import { momentArm } from '@/engine/muscle/momentArm';
import anthropometryJson from './anthropometry.json';
import capacityJson from './capacity.json';
import squatJson from './exercises/squat.json';
import libraryJson from './exercises/library.json';
import movementsJson from './movements.json';
import musclesJson from './muscles.json';
import referencesJson from './references.json';
import skeletonJson from './skeleton.json';
import { Reference, type Evidence } from './schema/evidence';
import { Exercise as ExerciseSchema, LibraryFile } from './schema/exercise';
import { MovementFile, MuscleFile } from './schema/muscle';
import { SkeletonDef } from './schema/skeleton';
import { z } from 'zod';

const refs = z.array(Reference).parse(referencesJson);
const refIds = new Set(refs.map((r) => r.id));

/** Coleta todo objeto com forma de Evidence em qualquer profundidade. */
function collectEvidence(node: unknown, out: Evidence[] = []): Evidence[] {
  if (Array.isArray(node)) node.forEach((n) => collectEvidence(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (Array.isArray(o.source) && typeof o.confidence === 'string') out.push(o as unknown as Evidence);
    Object.values(o).forEach((v) => collectEvidence(v, out));
  }
  return out;
}

const allEvidence = () =>
  [skeletonJson, musclesJson, anthropometryJson, capacityJson, squatJson, libraryJson].flatMap((j) => collectEvidence(j));

describe('banco de dados', () => {
  it('referências: ids únicos', () => {
    expect(refIds.size).toBe(refs.length);
  });

  it('esqueleto segue o schema', () => {
    expect(() => SkeletonDef.parse(skeletonJson)).not.toThrow();
  });

  it('músculos seguem o schema', () => {
    expect(() => MuscleFile.parse(musclesJson)).not.toThrow();
  });

  it('toda fonte citada existe em references.json', () => {
    const all = allEvidence();
    expect(all.length).toBeGreaterThan(20);
    for (const ev of all) for (const s of ev.source) expect(refIds, `refId ${s.refId}`).toContain(s.refId);
  });

  it('caminhos musculares apontam para segmentos existentes e ids são únicos', () => {
    const sk = buildSkeleton(SkeletonDef.parse(skeletonJson));
    const paths = buildMusclePaths(sk, MuscleFile.parse(musclesJson));
    const keys = new Set(paths.map((p) => p.key));
    expect(keys.size).toBe(paths.length);
  });

  it('geometria autoral nunca aparece como "estabelecido"', () => {
    for (const ev of [...collectEvidence(skeletonJson), ...collectEvidence(musclesJson)]) {
      if (ev.source.every((s) => s.refId === 'sbl_authored')) expect(ev.confidence).not.toBe('estabelecido');
    }
  });

  it('"estabelecido" exige ao menos uma fonte conferida', () => {
    const verified = new Set(refs.filter((r) => r.verified).map((r) => r.id));
    for (const ev of allEvidence()) {
      if (ev.confidence !== 'estabelecido') continue;
      expect(ev.source.some((s) => verified.has(s.refId)), JSON.stringify(ev.source)).toBe(true);
    }
  });

  it('raciocínio próprio nunca passa de "especulativo"', () => {
    for (const ev of allEvidence()) {
      if (ev.source.every((s) => s.refId === 'sbl_reasoning' || s.refId === 'sbl_authored')) expect(ev.confidence).toBe('especulativo');
    }
  });
});

describe('biblioteca de exercícios', () => {
  const lib = LibraryFile.parse(libraryJson);
  const muscles = new Map(MuscleFile.parse(musclesJson).map((m) => [m.id, m]));

  it('ids únicos e alvos apontam para músculos e partes existentes', () => {
    expect(new Set(lib.map((e) => e.id)).size).toBe(lib.length);
    for (const e of lib) {
      expect(e.targets.some((t) => t.role === 'alvo'), `${e.id} sem alvo`).toBe(true);
      for (const t of e.targets) {
        const m = muscles.get(t.muscle);
        expect(m, `${e.id}: ${t.muscle}`).toBeDefined();
        for (const p of t.parts ?? []) expect(m?.parts.map((x) => x.id), `${e.id}: ${p}`).toContain(p);
      }
    }
  });

  it('exercício com Lab aponta para um exercício do Lab que existe', () => {
    const lab = new Set([ExerciseSchema.parse(squatJson).id]);
    for (const e of lib) if (e.labId) expect(lab, e.id).toContain(e.labId);
  });

  it('hipótese nunca se apoia em "estabelecido"', () => {
    for (const e of lib) if (e.status === 'hipotese') expect(e.length.confidence).not.toBe('estabelecido');
  });
});

describe('ações articulares', () => {
  const movements = MovementFile.parse(movementsJson);
  const byId = new Map(movements.map((m) => [m.id, m]));
  const muscles = MuscleFile.parse(musclesJson);

  it('movimentos com ids únicos; DOF existe no esqueleto', () => {
    expect(byId.size).toBe(movements.length);
    const dofs = new Set(SkeletonDef.parse(skeletonJson).segments.flatMap((s) => s.dofs.map((d) => d.id.replace(/_r$/, ''))));
    for (const m of movements) if (m.dof) expect(dofs, m.id).toContain(m.dof);
  });

  it('toda ação aponta para movimento e partes existentes; sem ação repetida', () => {
    for (const mu of muscles) {
      const parts = new Set(mu.parts.map((p) => p.id));
      const seen = new Set<string>();
      for (const a of mu.actions) {
        expect(byId.has(a.movement), `${mu.id}: ${a.movement}`).toBe(true);
        for (const p of a.parts ?? []) expect(parts, `${mu.id}: parte ${p}`).toContain(p);
        const key = `${a.movement}|${(a.parts ?? []).join(',')}`;
        expect(seen.has(key), `${mu.id}: ${key} repetida`).toBe(false);
        seen.add(key);
      }
    }
  });

  // O caminho desenhado à mão precisa concordar com a anatomia pelo menos no sinal:
  // se a ação é extensão do quadril, o braço de momento do modelo tem de ser de extensor.
  it('braço de momento do modelo tem o sinal da ação, na faixa conferida', () => {
    const sk = buildSkeleton(SkeletonDef.parse(skeletonJson));
    const paths = buildMusclePaths(sk, muscles).filter((p) => p.side === 'r');
    const dofIds = new Set(sk.segments.flatMap((s) => s.dofs.map((d) => d.id)));
    const failures: string[] = [];
    for (const mu of muscles) {
      for (const a of mu.actions) {
        const mv = byId.get(a.movement);
        if (!mv?.dof || !mv.sign) continue;
        const range = a.rangeDeg ?? mv.rangeDeg;
        if (!range) continue;
        const dof = dofIds.has(`${mv.dof}_r`) ? `${mv.dof}_r` : mv.dof;
        for (const p of paths.filter((q) => q.muscleId === mu.id && (!a.parts || a.parts.includes(q.partId)))) {
          for (let d = range[0]; d <= range[1] + 1e-9; d += 10) {
            const r = momentArm(sk, p, {}, dof, d) * mv.sign;
            if (r < 0.002) failures.push(`${p.partId} ${a.movement} @${d}°: ${(r * 100).toFixed(1)} cm`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
