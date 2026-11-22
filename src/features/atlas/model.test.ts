import { describe, expect, it } from 'vitest';
import { muscleDefs } from '@/data';
import { actionCurves, relLength } from './model';

describe('comprimento relativo do mergulho', () => {
  const m = muscleDefs.find((x) => x.id === 'biceps_brachii');
  const c = m ? actionCurves(m)[0] : undefined;

  it('segue a curva do modelo nas pontas e fica em 1 sem curva', () => {
    expect(c).toBeDefined();
    const v = c?.series[0]?.length ?? [];
    expect(relLength(c, 0)).toBeCloseTo(1 + (v[0] ?? 0), 9);
    expect(relLength(c, 1)).toBeCloseTo(1 + (v[v.length - 1] ?? 0), 9);
    expect(relLength(c, 2)).toBeCloseTo(relLength(c, 1), 9);
    expect(relLength(undefined, 0.5)).toBe(1);
  });

  it('interpola entre amostras sem sair do intervalo delas', () => {
    const v = c?.series[0]?.length ?? [];
    const f = 0.5 / (v.length - 1);
    const r = relLength(c, f);
    const [a, b] = [1 + (v[0] ?? 0), 1 + (v[1] ?? 0)];
    expect(r).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-12);
    expect(r).toBeLessThanOrEqual(Math.max(a, b) + 1e-12);
  });
});
