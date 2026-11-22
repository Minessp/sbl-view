import { describe, expect, it } from 'vitest';
import { choose, layout, LABEL_GAP, MAX_LABELS, settle, type Hold, type LabelCandidate } from './labels';

const W = 1440, H = 900;
const cands = (n: number): LabelCandidate[] => Array.from({ length: n }, (_, i) => ({ key: `m${i}`, area: 10 + i, x: 600 + (i % 2) * 240, y: 200 + i * 7 }));

describe('rótulos vivos', () => {
  it('escolhe no máximo 10, os de maior peso, e ignora o que mal aparece', () => {
    const c = [...cands(30), { key: 'tiny', area: 1, x: W / 2, y: H / 2 }];
    const k = choose(c, W, H);
    expect(k).toHaveLength(MAX_LABELS);
    expect(k).not.toContain('tiny');
    // Mesma área: o do centro vence o da borda.
    expect(choose([{ key: 'edge', area: 20, x: 10, y: 10 }, { key: 'mid', area: 20, x: W / 2, y: H / 2 }], W, H, 1)).toEqual(['mid']);
  });

  it('não sobrepõe rótulos da mesma coluna, mesmo com todos os pontos juntos', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, x: i % 2 ? 800 : 640, y: 450 + i }));
    const placed = layout(items, { left: 600, right: 840 }, W, H);
    expect(placed).toHaveLength(10);
    for (const side of ['l', 'r'] as const) {
      const ys = placed.filter((p) => p.side === side).map((p) => p.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThanOrEqual(LABEL_GAP - 1e-9);
      for (const y of ys) expect(y).toBeGreaterThanOrEqual(0);
      for (const y of ys) expect(y).toBeLessThanOrEqual(H);
    }
    // Coluna da esquerda fora do corpo, da direita também.
    expect(placed.filter((p) => p.side === 'l').every((p) => p.x < 600)).toBe(true);
    expect(placed.filter((p) => p.side === 'r').every((p) => p.x > 840)).toBe(true);
  });

  it('tela baixa: a coluna cheia perde os de menor peso e segue sem colisão', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, x: 100, y: 100 }));
    const placed = layout(items, { left: 150, right: 250 }, 390, 160);
    const ys = placed.map((p) => p.y).sort((a, b) => a - b);
    expect(placed.length).toBeLessThan(10);
    expect(new Set(placed.map((p) => p.key))).toEqual(new Set(items.slice(0, placed.length).map((p) => p.key)));
    for (let i = 1; i < ys.length; i++) expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThanOrEqual(LABEL_GAP - 1e-9);
  });

  it('coluna respeita a faixa livre (alavanca à esquerda, cartão à direita)', () => {
    const items = [{ key: 'a', x: 300, y: 400 }, { key: 'b', x: 1300, y: 400 }];
    const placed = layout(items, { left: 100, right: 1400 }, W, H, { xMin: 350, xMax: 1000 });
    expect(placed.find((p) => p.key === 'a')?.x).toBe(350);
    expect(placed.find((p) => p.key === 'b')?.x).toBe(1000);
  });

  it('histerese: entra na hora com a tela vazia; depois troca só se o pedido durar 300 ms', () => {
    const mem = new Map<string, Hold>();
    expect(settle(mem, ['a', 'b'], 0)).toEqual(['a', 'b']);
    // Pedido trocado por 200 ms: nada muda.
    expect(settle(mem, ['a', 'c'], 100)).toEqual(['a', 'b']);
    expect(settle(mem, ['a', 'c'], 300)).toEqual(['a', 'b']);
    // Volta antes dos 300 ms: o contador zera.
    expect(settle(mem, ['a', 'b'], 350)).toEqual(['a', 'b']);
    expect(settle(mem, ['a', 'c'], 400)).toEqual(['a', 'b']);
    expect(settle(mem, ['a', 'c'], 700)).toEqual(['a', 'c']);
    expect(mem.has('b')).toBe(false);
  });
});
