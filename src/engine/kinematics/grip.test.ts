import { describe, expect, it } from 'vitest';
import { skeletonDef } from '@/data';
import { add, distance, scale, type Vec3 } from '@/engine/math/vec';
import { gripBend, gripRig, handSpec } from './grip';

const hand = handSpec(skeletonDef);
const rig = gripRig(hand);
const tip = skeletonDef.segments.find((s) => s.id === 'hand_r')?.tip as Vec3;
const mcpMean = scale(hand.mcp.reduce((a, b) => add(a, b), [0, 0, 0] as Vec3), 1 / hand.mcp.length);
// Centro da palma, na pele: meio do caminho entre o punho e as cabeças dos metacarpos, 2 cm para a palma.
const palmCenter = add(scale(add(hand.origin, mcpMean), 0.5), scale(hand.palm, 0.02));

describe('mão que fecha', () => {
  it('g = 0 é identidade', () => {
    for (const p of [tip, hand.thumb.tip, hand.origin, add(tip, [0.01, -0.02, 0.005])]) expect(gripBend(p, 0, rig)).toEqual(p);
  });

  it('a mão fechada leva a ponta do dedo médio a menos de 3 cm do centro da palma', () => {
    expect(distance(tip, palmCenter)).toBeGreaterThan(0.08);
    expect(distance(gripBend(tip, 1, rig), palmCenter)).toBeLessThan(0.03);
  });

  it('o polegar fecha para a palma e para o lado do mínimo; o punho não se move', () => {
    const [, w0, h0] = rig.local(hand.thumb.tip);
    const [, w1, h1] = rig.local(gripBend(hand.thumb.tip, 1, rig));
    expect(h1 - h0).toBeGreaterThan(0.02);
    expect(w1 - w0).toBeLessThan(-0.03);
    expect(distance(gripBend(hand.origin, 1, rig), hand.origin)).toBeLessThan(1e-9);
  });

  it('contínuo em g e sem NaN numa grade em volta da mão', () => {
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const p: Vec3 = add(hand.origin, [Math.sin(i * 1.7) * 0.06, -Math.abs(Math.sin(i * 0.37)) * 0.2, Math.cos(i * 2.3) * 0.05]);
      let prev = p;
      for (let k = 1; k <= 100; k++) {
        const q = gripBend(p, k / 100, rig);
        expect(q.every(Number.isFinite)).toBe(true);
        worst = Math.max(worst, distance(q, prev));
        prev = q;
      }
    }
    // Um passo de 1% de g não leva vértice nenhum a mais de 1 cm.
    expect(worst).toBeLessThan(0.01);
  });
});
