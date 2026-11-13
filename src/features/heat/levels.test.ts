import { describe, expect, it } from 'vitest';
import { heatLevel, heatRange } from './levels';

describe('escala do mapa de calor', () => {
  it('degraus absolutos', () => {
    expect([0, 1, 4, 5, 9, 10, 14, 15, 19, 20, 40].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
  it('faixas da legenda', () => {
    expect(heatRange(0)).toEqual([0, 0]);
    expect(heatRange(1)).toEqual([1, 4]);
    expect(heatRange(5)).toEqual([20, null]);
  });
});
