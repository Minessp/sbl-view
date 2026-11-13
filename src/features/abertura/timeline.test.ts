import { describe, expect, it } from 'vitest';
import { CUT_OFF, CUT_WINDOWS, cutHeight, introCut, introDolly, openingFrame } from './timeline';

describe('coreografia da abertura', () => {
  it('nenhum corte no início; tudo cortado no fim', () => {
    const a = openingFrame(0);
    expect(a.cuts.skin).toBe(CUT_OFF);
    expect(a.activeCut).toBeNull();
    const z = openingFrame(1);
    expect(z.cuts.skin).toBeLessThan(0);
    expect(z.cuts.deep).toBeLessThan(0);
  });

  it('o plano desce de forma monotônica', () => {
    let prev = Infinity;
    for (let p = CUT_WINDOWS.skin[0] + 0.001; p <= CUT_WINDOWS.skin[1]; p += 0.01) {
      const h = cutHeight(p, CUT_WINDOWS.skin);
      expect(h).toBeLessThanOrEqual(prev);
      prev = h;
    }
  });

  it('camadas cortam em ordem: pele antes do superficial antes do profundo', () => {
    expect(CUT_WINDOWS.skin[1]).toBeLessThanOrEqual(CUT_WINDOWS.superficial[0]);
    expect(CUT_WINDOWS.superficial[1]).toBeLessThanOrEqual(CUT_WINDOWS.deep[0]);
  });

  it('câmera termina de perfil', () => {
    expect(openingFrame(0).azimuth).toBeCloseTo(0, 6);
    expect(openingFrame(1).azimuth).toBeCloseTo(-Math.PI / 2, 6);
  });
});

describe('entrada', () => {
  it('plano sobe do chão ao topo e depois desliga', () => {
    expect(introCut(0)).toBeLessThan(0);
    expect(introCut(0.5)).toBeGreaterThan(introCut(0.25));
    expect(introCut(0.999)).toBeGreaterThan(1.8);
    expect(introCut(1)).toBe(CUT_OFF);
  });
  it('câmera termina na distância normal', () => {
    expect(introDolly(0)).toBeGreaterThan(1);
    expect(introDolly(1)).toBe(1);
  });
});
