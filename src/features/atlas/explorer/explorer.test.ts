import { describe, expect, it } from 'vitest';
import { advanceDemo, demoAngle, demoPhaseOf, strainOf } from './demo';
import { clampOrbit, dampOrbit, fitDistance, orbitPosition, orbitsClose, panOrbit, VIEW_YAW, wrapAngle, type Orbit } from './orbit';

const O: Orbit = { yaw: 0.4, pitch: 0.2, dist: 3, target: [0, 1, 0] };

describe('órbita', () => {
  it('posição fica à distância pedida do alvo e de frente na guinada 0', () => {
    const p = orbitPosition(O);
    expect(Math.hypot(p[0], p[1] - 1, p[2])).toBeCloseTo(3, 9);
    const f = orbitPosition({ ...O, yaw: VIEW_YAW.front, pitch: 0 });
    expect(f[2]).toBeCloseTo(3, 9);
    const s = orbitPosition({ ...O, yaw: VIEW_YAW.side, pitch: 0 });
    expect(s[0]).toBeCloseTo(-3, 9);
  });

  it('guinada fica em [−π, π) e o amortecimento vai pelo caminho curto', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-0.1 - 2 * Math.PI)).toBeCloseTo(-0.1, 9);
    const d = dampOrbit({ ...O, yaw: 3.0 }, { ...O, yaw: -3.0 }, 0.5);
    expect(Math.abs(d.yaw)).toBeGreaterThan(3.0);
  });

  it('amortecimento converge e limites seguram arfagem e distância', () => {
    let c: Orbit = O;
    const g: Orbit = { yaw: -2, pitch: 0.9, dist: 0.6, target: [0.2, 1.4, 0.1] };
    for (let i = 0; i < 400; i++) c = dampOrbit(c, g, 0.1);
    expect(orbitsClose(c, g)).toBe(true);
    const k = clampOrbit({ ...O, pitch: 9, dist: 0.001, target: [99, -9, 0] });
    expect(k.pitch).toBeLessThan(1.5);
    expect(k.dist).toBeGreaterThan(0.2);
    expect(k.target[0]).toBeLessThan(3);
  });

  it('arrastar para a direita leva o alvo para a esquerda da tela', () => {
    const p = panOrbit({ ...O, yaw: 0, pitch: 0 }, 0.1, 0);
    expect(p.target[0]).toBeLessThan(0);
    expect(p.target[1]).toBeCloseTo(1, 9);
  });

  it('caixa maior pede distância maior; tela estreita também', () => {
    const a = fitDistance([0.3, 0.4, 0.2], 0, 1.5);
    const b = fitDistance([0.6, 1.8, 0.3], 0, 1.5);
    expect(b).toBeGreaterThan(a);
    expect(fitDistance([2, 0.5, 0.3], 0, 0.5)).toBeGreaterThan(fitDistance([2, 0.5, 0.3], 0, 2));
  });
});

describe('demonstração', () => {
  const R = [-20, 120] as const;
  it('começa na posição em pé e cobre a faixa inteira', () => {
    expect(demoAngle(R, 0)).toBeCloseTo(0, 6);
    const xs = Array.from({ length: 401 }, (_, i) => demoAngle(R, i / 400));
    expect(Math.max(...xs)).toBeCloseTo(120, 1);
    expect(Math.min(...xs)).toBeCloseTo(-20, 1);
    expect(demoAngle(R, 1)).toBeCloseTo(0, 6);
  });

  it('faixa sem o zero começa na ponta mais perto', () => {
    expect(demoAngle([30, 90], 0)).toBeCloseTo(30, 6);
  });

  it('cursor manual: fase do ângulo devolve o mesmo ângulo', () => {
    for (const d of [-20, -5, 0, 33, 80, 120]) expect(demoAngle(R, demoPhaseOf(R, d))).toBeCloseTo(d, 6);
  });

  it('sem repetição para ao fim do ciclo; com repetição dá a volta', () => {
    expect(advanceDemo(0.9, 1, 1, false)).toEqual({ phase: 0, done: true });
    const r = advanceDemo(0.9, 1, 1, true);
    expect(r.done).toBe(false);
    expect(r.phase).toBeGreaterThan(0);
    expect(r.phase).toBeLessThan(0.9);
  });

  it('deformação: encurtar é positivo, alongar negativo, limitada', () => {
    expect(strainOf(0.9, 1)).toBeGreaterThan(0);
    expect(strainOf(1.1, 1)).toBeLessThan(0);
    expect(strainOf(2, 1)).toBe(-1);
    expect(strainOf(1, 0)).toBe(0);
  });
});
