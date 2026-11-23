import { describe, expect, it } from 'vitest';
import { skeletonDef } from '@/data';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { MotionClip } from '@/data/schema/motion';
import { boxDistance, penetrations, segmentDistance } from './collide';
import { compileClip, evaluateClip } from './evaluate';

const sk = buildSkeleton(skeletonDef);
const standing = (equipment: MotionClip['equipment'] = []): MotionClip => ({
  id: 'probe',
  support: 'standing',
  root: { mode: 'plant' },
  hold: {},
  tracks: [],
  reach: [],
  equipment,
  load: { kind: 'gravity' },
  tempo: { eccentric: 1, stretched: 0, concentric: 1, shortened: 0, start: 'stretched' },
  view: 'side',
  evidence: { source: [{ refId: 'sbl_authored' }], confidence: 'especulativo' },
});

describe('atravessamento', () => {
  it('distâncias: segmento–segmento e caixa com sinal', () => {
    expect(segmentDistance([0, 0, 0], [1, 0, 0], [0.5, 1, 0], [0.5, 2, 0])).toBeCloseTo(1);
    expect(segmentDistance([0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0])).toBeCloseTo(1);
    expect(boxDistance([0, 0, 0], [0, 0, 0], [2, 2, 2], 0)).toBeCloseTo(-1);
    expect(boxDistance([0, 2, 0], [0, 0, 0], [2, 2, 2], 0)).toBeCloseTo(1);
    // Caixa inclinada 90° em X: a espessura (0,2 m) passa a ser a profundidade.
    expect(boxDistance([0, 0, 0.9], [0, 0, 0], [1, 0.2, 2], 90)).toBeCloseTo(0.8);
  });

  it('em pé sem nada: nenhum atravessamento', () => {
    const c = compileClip(standing(), sk);
    expect(penetrations(evaluateClip(c, 0), c).map((h) => `${h.a}×${h.b} ${h.depthM.toFixed(3)}`)).toEqual([]);
  });

  it('caixa no meio da coxa é relatada; o pino declarado não', () => {
    const box = { kind: 'block' as const, role: 'bench' as const, center: [-0.09, 0.65, 0] as const, size: [0.1, 0.1, 0.1] as const };
    const c = compileClip(standing([box]), sk);
    const hits = penetrations(evaluateClip(c, 0), c);
    expect(hits.some((h) => h.a === 'thigh_r' && h.b === 'peça:bench' && h.depthM > 0.05)).toBe(true);
  });
});
