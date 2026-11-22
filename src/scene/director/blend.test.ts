import { describe, expect, it } from 'vitest';
import { arcCamera, lerpRect, shotEase, window01 } from './blend';

describe('voo entre rotas', () => {
  it('recorte desliza em linha reta', () => {
    const a = { x: 0, y: 0, w: 1440, h: 900 };
    const b = { x: 600, y: 120, w: 800, h: 600 };
    expect(lerpRect(a, b, 0)).toEqual(a);
    expect(lerpRect(a, b, 1)).toEqual(b);
    expect(lerpRect(a, b, 0.5)).toEqual({ x: 300, y: 60, w: 1120, h: 750 });
  });

  it('curva de tempo: pontas fixas, monótona, decidida no começo', () => {
    expect(shotEase(0)).toBe(0);
    expect(shotEase(1)).toBeCloseTo(1, 12);
    expect(shotEase(0.25)).toBeGreaterThan(0.8);
    let last = -1;
    for (let i = 0; i <= 50; i++) {
      const v = shotEase(i / 50);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(window01(0.35, 0.35, 1)).toBe(0);
    expect(window01(2, 0, 0.7)).toBe(1);
  });

  it('câmera: pontas exatas, arco mantém a distância ao alvo e vai pelo caminho curto', () => {
    const a = { pos: [0, 1, 4] as const, target: [0, 1, 0] as const, fovDeg: 28 };
    const b = { pos: [-4, 1, 0] as const, target: [0, 1, 0] as const, fovDeg: 28 };
    const s = arcCamera(a, b, 0), e = arcCamera(a, b, 1);
    for (let i = 0; i < 3; i++) {
      expect(s.pos[i]).toBeCloseTo(a.pos[i] ?? 0, 9);
      expect(e.pos[i]).toBeCloseTo(b.pos[i] ?? 0, 9);
    }
    const m = arcCamera(a, b, 0.5);
    expect(Math.hypot(m.pos[0], m.pos[1] - 1, m.pos[2])).toBeCloseTo(4, 9);
    // De +Z a −X pelo caminho curto (90°), não pela volta longa: o meio fica em −X, +Z.
    expect(m.pos[0]).toBeLessThan(0);
    expect(m.pos[2]).toBeGreaterThan(0);
    expect(m.pos.every(Number.isFinite)).toBe(true);
  });

  it('câmera com distâncias diferentes: escala log, sem NaN quando a posição coincide com o alvo', () => {
    const a = { pos: [0, 1, 1] as const, target: [0, 1, 0] as const, fovDeg: 28 };
    const b = { pos: [0, 1, 4] as const, target: [0, 1, 0] as const, fovDeg: 40 };
    expect(arcCamera(a, b, 0.5).pos[2]).toBeCloseTo(2, 9);
    expect(arcCamera(a, b, 0.5).fovDeg).toBe(34);
    const z = { pos: [0, 1, 0] as const, target: [0, 1, 0] as const, fovDeg: 28 };
    expect(arcCamera(z, b, 0.3).pos.every(Number.isFinite)).toBe(true);
  });
});
