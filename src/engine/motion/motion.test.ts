import { describe, expect, it } from 'vitest';
import skeletonJson from '@/data/skeleton.json';
import { forwardKinematics, pointToWorld } from '../kinematics/fk';
import { buildSkeleton, type SkeletonInput } from '../kinematics/skeleton';
import { distance, dot, normalize, scale, sub, type Vec3 } from '../math/vec';
import { chainOf, solveTwoBone } from './ik';
import { cycleLength, evalCurve, makeCurve, repAt, repLegs, timeAtU } from './keys';

const sk = buildSkeleton(skeletonJson as unknown as SkeletonInput);

describe('quadros-chave', () => {
  it('curva monótona não passa das chaves e para nas pontas', () => {
    const c = makeCurve([
      { u: 0, v: 0 },
      { u: 0.3, v: 80 },
      { u: 0.6, v: 90 },
      { u: 1, v: 10 },
    ]);
    for (let i = 0; i <= 100; i++) {
      const v = evalCurve(c, i / 100);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(90 + 1e-9);
    }
    expect(evalCurve(c, 0.3)).toBeCloseTo(80);
    expect(evalCurve(c, 1)).toBeCloseTo(10);
  });

  it('relógio: parte da ponta pedida, concêntrica sempre de u = 0 (alongado) a 1 (encurtado)', () => {
    // Agachamento: parte encurtado, desce (excêntrica), pausa alongado, sobe.
    const t = { eccentric: 2, stretched: 0.5, concentric: 1, shortened: 0.5, start: 'shortened' as const };
    expect(repAt(t, 0)).toMatchObject({ u: 1, phase: 'eccentric' });
    expect(repAt(t, 1).u).toBeCloseTo(0.5);
    expect(repAt(t, 2.2)).toMatchObject({ u: 0, phase: 'stretched' });
    expect(repAt(t, 3).phase).toBe('concentric');
    expect(repAt(t, 3.8)).toMatchObject({ u: 1, phase: 'shortened' });
    expect(repAt(t, 4 + 1).u).toBeCloseTo(0.5);
    expect(repLegs(t).map((l) => l.phase)).toEqual(['eccentric', 'stretched', 'concentric', 'shortened']);
    // Rosca: parte alongada.
    const c = { ...t, start: 'stretched' as const };
    expect(repAt(c, 0)).toMatchObject({ u: 0, phase: 'concentric' });
    expect(repAt(c, timeAtU(c, 0.3)).u).toBeCloseTo(0.3, 6);
    expect(repAt(c, timeAtU(c, 0.3, 'eccentric')).u).toBeCloseTo(0.3, 6);
    expect(cycleLength(c)).toBe(4);
  });
});

describe('IK de dois ossos', () => {
  const arm = chainOf(sk, 'upperarm_r', 'forearm_r');
  const base = forwardKinematics(sk, {});
  const grip = (): Vec3 => {
    const fa = base.world.get('forearm_r');
    if (!fa) throw new Error('sem antebraço');
    return sub(pointToWorld(base, 'hand_r', [0, -0.08, 0.03]), pointToWorld(base, 'forearm_r', [0, 0, 0]));
  };
  const shoulder = pointToWorld(base, 'upperarm_r', [0, 0, 0]);

  const cases: { target: Vec3; pole: Vec3 }[] = [
    { target: [-0.2, 1.4, 0.4], pole: [0, -1, 0] },
    { target: [-0.2, 1.4, 0.4], pole: [-1, 0, 0] },
    { target: [-0.3, 1.9, 0.05], pole: [-0.5, -0.5, 0.7] },
    { target: [-0.25, 1.0, 0.2], pole: [0, 0, -1] },
    { target: [-0.45, 1.3, -0.05], pole: [0, -1, 0] },
  ];

  it.each(cases)('alcança $target e o cotovelo vai para o polo $pole', ({ target, pole }) => {
    const res = solveTwoBone(arm, base, grip(), target, pole);
    const pose = forwardKinematics(sk, res.angles);
    const end = pointToWorld(pose, 'hand_r', [0, -0.08, 0.03]);
    expect(distance(end, target)).toBeLessThan(0.005);
    // O cotovelo fica do lado do polo em relação à linha ombro–alvo.
    const elbow = pointToWorld(pose, 'forearm_r', [0, 0, 0]);
    const axis = normalize(sub(target, shoulder));
    const off = sub(sub(elbow, shoulder), scale(axis, dot(sub(elbow, shoulder), axis)));
    const pp = sub(pole, scale(axis, dot(pole, axis)));
    // Quando a amplitude obriga a girar o plano, o cotovelo ainda fica do lado do polo.
    expect(dot(normalize(off), normalize(pp))).toBeGreaterThan(0);
  });
});
