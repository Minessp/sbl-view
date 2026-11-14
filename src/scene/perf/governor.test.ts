import { describe, expect, it } from 'vitest';
import { createGovernor } from './governor';

type G = ReturnType<typeof createGovernor>;

/** Alimenta `n` quadros; `cost(dpr)` dá o intervalo no DPR atual (preenchimento: cai com o DPR; CPU: não muda). */
function run(g: G, cost: (dpr: number) => number, n: number, t0 = 0) {
  const changes: number[] = [];
  let t = t0;
  for (let i = 0; i < n; i++) {
    const ms = cost(g.dpr);
    t += ms;
    const d = g.sample(ms, t);
    if (d !== null) changes.push(d);
  }
  return { t, changes };
}

/** Preenchimento: custo ∝ pixels (dpr²). */
const fill = (base: number) => (dpr: number) => base * dpr * dpr;

describe('governador de quadro', () => {
  it('quadro folgado no máximo não muda nada', () => {
    const g = createGovernor({ min: 0.75, max: 2 });
    expect(run(g, () => 16.7, 600).changes).toEqual([]);
    expect(g.dpr).toBe(2);
  });

  it('gargalo de preenchimento: baixa até caber no orçamento e para', () => {
    const g = createGovernor({ min: 0.75, max: 2 });
    // 2× custa 40 ms; 1,75× 30,6; 1,5× 22,5; 1,25× 15,6.
    const { changes } = run(g, fill(10), 1500);
    expect(changes.slice(0, 3)).toEqual([1.75, 1.5, 1.25]);
    expect(g.dpr).toBe(1.25);
  });

  it('aparelho muito lento (2 quadros/s) decide pelo tempo, sem esperar 60 quadros', () => {
    const g = createGovernor({ min: 0.75, max: 1.5 });
    const { t, changes } = run(g, fill(220), 12);
    expect(changes[0]).toBe(1.25);
    expect(t).toBeLessThan(8000);
  });

  it('gargalo de CPU: a descida não rende, volta ao nível anterior e fica', () => {
    const g = createGovernor({ min: 0.75, max: 1.5 });
    const { changes } = run(g, () => 300, 80);
    expect(changes).toEqual([1.25, 1.5]);
    expect(g.dpr).toBe(1.5);
  });

  it('não desce abaixo do mínimo', () => {
    const g = createGovernor({ min: 1, max: 1.5 });
    run(g, fill(60), 500);
    expect(g.dpr).toBe(1);
  });

  it('sobe depois de folga contínua, mas não volta ao nível que estourou antes de retryMs', () => {
    const g = createGovernor({ min: 0.75, max: 2 });
    // Preenchimento: 2× estoura (28 ms), 1,75× cabe (21,4 ms).
    let { t } = run(g, fill(7), 200);
    expect(g.dpr).toBe(1.75);
    // Cena fica leve: folga, mas o teto aprendido segura em 1,75.
    ({ t } = run(g, () => 15, 400, t));
    expect(g.dpr).toBe(1.75);
    // Teto expira (30 s) e sobe.
    run(g, () => 15, 2400, t);
    expect(g.dpr).toBe(2);
  });

  it('intervalo longo (aba escondida) não conta como quadro lento', () => {
    const g = createGovernor({ min: 0.75, max: 2 });
    let t = 0;
    for (let i = 0; i < 100; i++) {
      t += 1500;
      expect(g.sample(1500, t)).toBeNull();
    }
    expect(g.dpr).toBe(2);
  });

  it('começa no DPR pedido e respeita os limites', () => {
    expect(createGovernor({ min: 0.75, max: 1.5 }, 3).dpr).toBe(1.5);
    expect(createGovernor({ min: 0.75, max: 1.5 }, 1).dpr).toBe(1);
  });
});
