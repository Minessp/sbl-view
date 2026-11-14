import { describe, expect, it } from 'vitest';
import { applyPatches } from './patch';

const clip = {
  params: { recline: 40, implement: { kind: 'cable', pulley: [0, 0.95, -0.9] } },
  equipment: [
    { kind: 'block', center: [0, 0.4, 0] },
    { kind: 'cable', pulley: [-0.9, 1.5, 0] },
  ],
  reach: [{ limb: 'leg', target: { point: [{ u: 0, p: [0, 1, 2] }, { u: 1, p: [0, 3, 4] }] } }],
};

describe('remendo de clipe', () => {
  it('troca e soma, com índice, curinga e seletor', () => {
    const out = applyPatches(clip, [
      { path: 'params.recline', op: 'set', value: 55 },
      { path: 'params.implement.pulley.1', op: 'add', value: 0.05 },
      { path: 'equipment.kind=cable.pulley.1', op: 'set', value: 2 },
      { path: 'reach.limb=leg.target.point.*.p.2', op: 'add', value: -1 },
    ]);
    expect(out.params.recline).toBe(55);
    expect(out.params.implement.pulley[1]).toBeCloseTo(1);
    expect(out.equipment[1]?.pulley?.[1]).toBe(2);
    expect(out.equipment[0]?.center?.[1]).toBe(0.4);
    expect(out.reach[0]?.target.point.map((k) => k.p[2])).toEqual([1, 3]);
  });

  it('não mexe no original e falha alto em caminho sem número', () => {
    applyPatches(clip, [{ path: 'params.recline', op: 'set', value: 10 }]);
    expect(clip.params.recline).toBe(40);
    expect(() => applyPatches(clip, [{ path: 'params.nada', op: 'set', value: 1 }])).toThrow(/sem alvo/);
    expect(() => applyPatches(clip, [{ path: 'equipment.kind=rail.from.0', op: 'set', value: 1 }])).toThrow(/sem alvo/);
  });
});
