import { describe, expect, it } from 'vitest';
import { skeletonDef } from '@/data';
import { musclePathDefs } from '@/data/paths';
import { forwardKinematics } from '../kinematics/fk';
import { bilateral, buildSkeleton, degToAngles } from '../kinematics/skeleton';
import { buildMusclePaths, mtuLength } from './paths';
import { wrappedLength2D } from './wrap';

describe('contorno de cilindro 2D', () => {
  it('reta que não toca o círculo fica reta', () => {
    const r = wrappedLength2D([-1, 2], [1, 2], 0.5, [0, 1]);
    expect(r.wrapped).toBe(false);
    expect(r.length).toBeCloseTo(2, 9);
  });

  it('pontos opostos: duas tangentes + meia volta', () => {
    // p e q a distância d no eixo X, círculo r=1: tangentes de comprimento sqrt(d²−1) + arco.
    const d = 2;
    const r = wrappedLength2D([-d, 0], [d, 0], 1, [0, 1]);
    const tan = Math.sqrt(d * d - 1);
    const arc = Math.PI - 2 * Math.acos(1 / d);
    expect(r.wrapped).toBe(true);
    expect(r.length).toBeCloseTo(2 * tan + arc, 9);
  });

  it('contorno é sempre ≥ distância reta', () => {
    for (let a = 0; a < 6.28; a += 0.3) {
      const q: [number, number] = [2 * Math.cos(a), 2 * Math.sin(a)];
      const r = wrappedLength2D([0, -2], q, 0.8, [1, 0]);
      expect(r.length).toBeGreaterThanOrEqual(Math.hypot(q[0], q[1] + 2) - 1e-9);
    }
  });
});

describe('comprimento músculo-tendão no modelo', () => {
  const sk = buildSkeleton(skeletonDef);
  const paths = buildMusclePaths(sk, musclePathDefs);
  const P = (key: string) => {
    const p = paths.find((x) => x.key === key);
    if (!p) throw new Error(key);
    return p;
  };
  const L = (key: string, deg: Record<string, number>) => mtuLength(forwardKinematics(sk, degToAngles(bilateral(deg))), P(key));

  it('vastos alongam de forma monotônica com a flexão do joelho', () => {
    let prev = 0;
    for (let k = 0; k <= 140; k += 10) {
      const l = L('vastus_lateralis_r', { knee_flex: k });
      expect(l).toBeGreaterThan(prev);
      prev = l;
    }
  });

  it('braço de momento do quadríceps na faixa de centímetros (2–7 cm) entre 30° e 120°', () => {
    for (let k = 30; k <= 120; k += 15) {
      const d = (L('vastus_lateralis_r', { knee_flex: k + 1 }) - L('vastus_lateralis_r', { knee_flex: k - 1 })) / ((2 * Math.PI) / 180);
      expect(d).toBeGreaterThan(0.02);
      expect(d).toBeLessThan(0.07);
    }
  });

  it('glúteo máximo alonga com a flexão do quadril até 120°', () => {
    let prev = 0;
    for (let h = 0; h <= 120; h += 10) {
      const l = L('gluteus_maximus_r', { hip_flex: h });
      expect(l).toBeGreaterThan(prev);
      prev = l;
    }
  });

  it('reto femoral (biarticular) muda bem menos que os vastos num agachamento', () => {
    const stand = { hip_flex: 0, knee_flex: 0 };
    const squat = { hip_flex: 100, knee_flex: 110, ankle_dorsi: 30 };
    const dRF = L('rectus_femoris_r', squat) / L('rectus_femoris_r', stand) - 1;
    const dVL = L('vastus_lateralis_r', squat) / L('vastus_lateralis_r', stand) - 1;
    expect(Math.abs(dRF)).toBeLessThan(dVL / 2);
  });

  it('caminho espelhado tem o mesmo comprimento', () => {
    const pose = forwardKinematics(sk, degToAngles(bilateral({ knee_flex: 70, hip_flex: 40 })));
    expect(mtuLength(pose, P('vastus_lateralis_l'))).toBeCloseTo(mtuLength(pose, P('vastus_lateralis_r')), 9);
  });
});
