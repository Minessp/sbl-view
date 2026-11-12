import { describe, expect, it } from 'vitest';
import { at, last } from '../math/arr';
import { cross, dot, length, sub, QUAT_IDENTITY, type Vec3 } from '../math/vec';
import { sdEllipsoid, sdRoundCone, smin } from './sdf';
import { radiusProfile, sampleCurve, spindleIndices, vertexCount, writeSpindle } from './spindle';
import { meshSdf } from './surfaceNets';

describe('sdf', () => {
  it('round cone com raios iguais é uma cápsula', () => {
    const a: Vec3 = [0, 0, 0], b: Vec3 = [0, 1, 0];
    expect(sdRoundCone([0.5, 0.5, 0], a, b, 0.1, 0.1)).toBeCloseTo(0.4, 9);
    expect(sdRoundCone([0, 1.5, 0], a, b, 0.1, 0.1)).toBeCloseTo(0.4, 9);
    expect(sdRoundCone([0, 0.5, 0], a, b, 0.1, 0.1)).toBeCloseTo(-0.1, 9);
  });

  it('elipsoide: zero na superfície, negativo dentro', () => {
    expect(sdEllipsoid([0.2, 0, 0], [0.2, 0.1, 0.1])).toBeCloseTo(0, 6);
    expect(sdEllipsoid([0, 0, 0], [0.2, 0.1, 0.1])).toBeLessThan(0);
  });

  it('smin nunca passa do mínimo e é contínuo', () => {
    expect(smin(1, 2, 0.1)).toBe(1);
    expect(smin(1, 1, 0.1)).toBeCloseTo(1 - 0.025, 9);
  });
});

describe('surface nets', () => {
  const mesh = meshSdf(
    [{ kind: 'ellipsoid', c: [0, 0, 0], r: [0.1, 0.1, 0.1], q: QUAT_IDENTITY, tag: 0 }],
    { cell: 0.01, blend: 0.02 },
  );
  const P = (i: number): Vec3 => [at(mesh.positions, i * 3), at(mesh.positions, i * 3 + 1), at(mesh.positions, i * 3 + 2)];
  const N = (i: number): Vec3 => [at(mesh.normals, i * 3), at(mesh.normals, i * 3 + 1), at(mesh.normals, i * 3 + 2)];
  const count = mesh.positions.length / 3;

  it('vértices ficam perto da superfície da esfera', () => {
    let maxErr = 0;
    for (let i = 0; i < count; i++) maxErr = Math.max(maxErr, Math.abs(length(P(i)) - 0.1));
    expect(maxErr).toBeLessThan(0.01);
  });

  it('triângulos têm orientação para fora', () => {
    let outward = 0, total = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = P(at(mesh.indices, t)), b = P(at(mesh.indices, t + 1)), c = P(at(mesh.indices, t + 2));
      const n = cross(sub(b, a), sub(c, a));
      if (length(n) < 1e-12) continue;
      total++;
      if (dot(n, a) > 0) outward++;
    }
    expect(total).toBeGreaterThan(100);
    expect(outward / total).toBeGreaterThan(0.99);
  });

  it('normais apontam para fora', () => {
    for (let i = 0; i < count; i++) expect(dot(N(i), P(i))).toBeGreaterThan(0);
  });
});

describe('fuso', () => {
  it('reamostra a curva passando pelas pontas', () => {
    const pts = sampleCurve([[0, 0, 0], [0, 0.5, 0.1], [0, 1, 0]], 9);
    expect(pts).toHaveLength(9);
    expect(at(pts, 0)).toEqual([0, 0, 0]);
    expect(last(pts)[1]).toBeCloseTo(1, 9);
  });

  it('perfil: tendão fino, ventre no raio máximo', () => {
    expect(radiusProfile(0.5, 0.03, [0.1, 0.1])).toBeCloseTo(0.03, 9);
    expect(radiusProfile(0.05, 0.03, [0.1, 0.1])).toBeLessThan(0.006);
  });

  it('preenche buffers sem NaN', () => {
    const layout = { rings: 16, sides: 10 };
    const pos = new Float32Array(vertexCount(layout) * 3);
    const nor = new Float32Array(vertexCount(layout) * 3);
    writeSpindle(layout, [[0, 0, 0], [0.02, 0.2, 0.01], [0, 0.4, 0]], 0.03, [0.1, 0.2], pos, nor);
    expect(pos.every(Number.isFinite)).toBe(true);
    expect(spindleIndices(layout).length).toBe(15 * 10 * 6);
  });

  it('triângulos do fuso apontam para fora (mesmo lado da normal do vértice)', () => {
    const layout = { rings: 12, sides: 8 };
    const pos = new Float32Array(vertexCount(layout) * 3);
    const nor = new Float32Array(vertexCount(layout) * 3);
    writeSpindle(layout, [[0, 0, 0], [0, 0.4, 0]], 0.05, [0, 0], pos, nor);
    const idx = spindleIndices(layout);
    const P = (i: number): Vec3 => [at(pos, i * 3), at(pos, i * 3 + 1), at(pos, i * 3 + 2)];
    const N = (i: number): Vec3 => [at(nor, i * 3), at(nor, i * 3 + 1), at(nor, i * 3 + 2)];
    let agree = 0, total = 0;
    for (let k = 0; k < idx.length; k += 3) {
      const a = at(idx, k), b = at(idx, k + 1), c = at(idx, k + 2);
      const face = cross(sub(P(b), P(a)), sub(P(c), P(a)));
      if (length(face) < 1e-12) continue;
      total++;
      if (dot(face, N(a)) > 0) agree++;
    }
    expect(agree / total).toBeGreaterThan(0.99);
  });
});
