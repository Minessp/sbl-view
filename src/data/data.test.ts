/**
 * Validação do banco: roda no CI. Garante schema, referências existentes
 * e consistência entre músculos e esqueleto.
 */
import { describe, expect, it } from 'vitest';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import { buildMusclePaths } from '@/engine/muscle/paths';
import musclesJson from './muscles.json';
import referencesJson from './references.json';
import skeletonJson from './skeleton.json';
import { Reference, type Evidence } from './schema/evidence';
import { MuscleFile } from './schema/muscle';
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
    const all = [...collectEvidence(skeletonJson), ...collectEvidence(musclesJson)];
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
});
