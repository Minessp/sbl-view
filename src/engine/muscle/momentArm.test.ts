import { describe, expect, it } from 'vitest';
import { skeletonDef } from '@/data';
import { musclePathDefs } from '@/data/paths';
import { buildSkeleton } from '../kinematics/skeleton';
import { DEG } from '../math/vec';
import { lengthAt, momentArm, sweepJoint } from './momentArm';
import { buildMusclePaths } from './paths';

const sk = buildSkeleton(skeletonDef);
const paths = buildMusclePaths(sk, musclePathDefs);
const P = (key: string) => {
  const p = paths.find((x) => x.key === key);
  if (!p) throw new Error(key);
  return p;
};

describe('braço de momento por excursão do tendão', () => {
  it('é −dL/dθ: confere com diferença finita larga', () => {
    const vl = P('vastus_lateralis_r');
    const L = (d: number) => lengthAt(sk, vl, { knee_flex_r: d * DEG });
    const fd = -(L(62) - L(58)) / (4 * DEG);
    expect(momentArm(sk, vl, {}, 'knee_flex_r', 60)).toBeCloseTo(fd, 4);
  });

  it('sinal: vasto é extensor (negativo na flexão), isquiotibial é flexor do joelho', () => {
    expect(momentArm(sk, P('vastus_lateralis_r'), {}, 'knee_flex_r', 45)).toBeLessThan(-0.02);
    expect(momentArm(sk, P('semitendinosus_r'), {}, 'knee_flex_r', 45)).toBeGreaterThan(0.02);
  });

  it('lado esquerdo espelhado tem o mesmo braço', () => {
    const r = momentArm(sk, P('gluteus_maximus_r'), {}, 'hip_flex_r', 40);
    const l = momentArm(sk, P('gluteus_maximus_l'), {}, 'hip_flex_l', 40);
    expect(l).toBeCloseTo(r, 9);
  });

  it('na borda da amplitude vira diferença unilateral, sem NaN', () => {
    const r = momentArm(sk, P('vastus_lateralis_r'), {}, 'knee_flex_r', -5);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeLessThan(0);
  });

  it('varredura: comprimento relativo é zero na pose de referência', () => {
    const s = sweepJoint(sk, P('semimembranosus_r'), {}, 'hip_flex_r', -10, 110, 13);
    expect(s.deg).toHaveLength(13);
    expect(s.length[1]).toBeCloseTo(0, 9); // −10, 0, … → índice 1 = 0°
    expect(s.length[12]).toBeGreaterThan(0.05);
  });

  it('DOF inexistente falha alto', () => {
    expect(() => momentArm(sk, P('soleus_r'), {}, 'nao_existe', 0)).toThrow();
  });
});
