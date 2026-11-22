import { describe, expect, it } from 'vitest';
import { quatFromAxisAngle, type Quat } from '../math/vec';
import { blendDeg, blendRoot, slerp } from './blend';

describe('blendDeg', () => {
  it('devolve as pontas e o meio', () => {
    const a = { knee_r_flex: 10, hip_r_flex: 40 };
    const b = { knee_r_flex: 90, hip_r_flex: 0 };
    expect(blendDeg(a, b, 0)).toEqual(a);
    expect(blendDeg(a, b, 1)).toEqual(b);
    expect(blendDeg(a, b, 0.5)).toEqual({ knee_r_flex: 50, hip_r_flex: 20 });
  });
  it('DOF ausente vale 0', () => {
    expect(blendDeg({ a: 30 }, { b: 60 }, 0.5)).toEqual({ a: 15, b: 30 });
  });
});

describe('blendRoot', () => {
  const q = (deg: number): Quat => quatFromAxisAngle([0, 1, 0], (deg * Math.PI) / 180);
  it('posição linear e rotação nas pontas', () => {
    const a = { position: [0, 1, 0] as const, rotation: q(0) };
    const b = { position: [2, 1, -4] as const, rotation: q(90) };
    const m = blendRoot(a, b, 0.5);
    expect(m.position).toEqual([1, 1, -2]);
    expect(m.rotation[1]).toBeCloseTo(q(45)[1], 9);
    expect(blendRoot(a, b, 1).rotation[1]).toBeCloseTo(q(90)[1], 9);
  });
  it('quaternions opostos (a mesma rotação) não giram e não dão NaN', () => {
    const r = q(30);
    const neg: Quat = [-r[0], -r[1], -r[2], -r[3]];
    for (const k of [0, 0.25, 0.5, 1]) {
      const s = slerp(r, neg, k);
      expect(s.every(Number.isFinite)).toBe(true);
      expect(Math.abs(s[0] * r[0] + s[1] * r[1] + s[2] * r[2] + s[3] * r[3])).toBeCloseTo(1, 9);
    }
  });
  it('meia volta exata sem NaN', () => {
    const s = slerp(q(0), q(180), 0.5);
    expect(s.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...s)).toBeCloseTo(1, 9);
  });
});
