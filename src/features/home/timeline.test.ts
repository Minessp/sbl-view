import { describe, expect, it } from 'vitest';
import { CUT_OFF, explodeAt, EXPLODE_SLOT, EXPLODE_WINDOW, introFrame, INTRO_SECONDS, LAYER_IDS, LENS_DEPTHS, lensPeel, lensRadius } from './timeline';

describe('entrada da página inicial', () => {
  it('começa vazia: osso no chão, fibras sem comprimento, sem pele', () => {
    const f = introFrame(0);
    expect(f.boneCut).toBeLessThan(0);
    expect(f.grow).toBeLessThan(0);
    expect(f.skin).toBe(0);
    expect(f.done).toBe(false);
  });

  it('termina com tudo inteiro e sem efeito', () => {
    const f = introFrame(INTRO_SECONDS);
    expect(f).toMatchObject({ boneCut: CUT_OFF, skin: 1, dolly: 1, orbit: 0, done: true });
    expect(f.grow).toBeGreaterThanOrEqual(2);
  });

  it('é monótona: osso sobe, fibras crescem, pele chega, câmera assenta', () => {
    let prev = introFrame(0);
    for (let i = 1; i <= 60; i++) {
      const f = introFrame((i / 60) * INTRO_SECONDS);
      expect(f.boneCut).toBeGreaterThanOrEqual(prev.boneCut);
      expect(f.grow).toBeGreaterThanOrEqual(prev.grow);
      expect(f.skin).toBeGreaterThanOrEqual(prev.skin);
      expect(f.dolly).toBeLessThanOrEqual(prev.dolly);
      expect(Math.abs(f.orbit)).toBeLessThanOrEqual(Math.abs(prev.orbit) + 1e-12);
      prev = f;
    }
  });

  it('as fibras só terminam depois que o osso já subiu, e a pele só chega com as fibras quase inteiras', () => {
    const boneDone = [...Array(100).keys()].map((i) => (i / 100) * INTRO_SECONDS).find((t) => introFrame(t).boneCut === CUT_OFF) ?? INTRO_SECONDS;
    const fibersDone = [...Array(100).keys()].map((i) => (i / 100) * INTRO_SECONDS).find((t) => introFrame(t).grow >= 2) ?? INTRO_SECONDS;
    const skinStarts = [...Array(100).keys()].map((i) => (i / 100) * INTRO_SECONDS).find((t) => introFrame(t).skin > 0) ?? INTRO_SECONDS;
    expect(fibersDone).toBeGreaterThan(boneDone);
    // Com 0,45 de atraso máximo por músculo, todos já passaram da inserção (grow ≥ 1,45) quando a pele aparece.
    expect(introFrame(skinStarts).grow).toBeGreaterThanOrEqual(1.3);
  });
});

describe('camadas abertas no scroll', () => {
  it('fechadas antes da janela, abertas depois, monótono no meio', () => {
    expect(explodeAt(0)).toBe(0);
    expect(explodeAt(EXPLODE_WINDOW[0])).toBe(0);
    expect(explodeAt(EXPLODE_WINDOW[1])).toBe(1);
    expect(explodeAt(1)).toBe(1);
    let prev = 0;
    for (let i = 0; i <= 50; i++) {
      const e = explodeAt(i / 50);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
  });

  it('as quatro camadas ficam em posições distintas, centradas', () => {
    const slots = LAYER_IDS.map((l) => EXPLODE_SLOT[l]);
    expect(new Set(slots).size).toBe(4);
    expect(slots.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('lente', () => {
  it('a pele sempre sai no raio inteiro; o osso nunca sai', () => {
    for (const d of LENS_DEPTHS) {
      expect(lensPeel(d).skin).toBe(1);
      expect(lensPeel(d).bone).toBe(0);
    }
  });

  it('cada camada pedida fica inteira no centro; as de cima saem em degraus decrescentes', () => {
    expect(lensPeel('superficial')).toMatchObject({ superficial: 0, deep: 0 });
    expect(lensPeel('deep').deep).toBe(0);
    const b = lensPeel('bone');
    expect(b.skin).toBeGreaterThan(b.superficial);
    expect(b.superficial).toBeGreaterThan(b.deep);
    expect(b.deep).toBeGreaterThan(0);
  });

  it('raio limitado entre o toque e a tela grande', () => {
    expect(lensRadius(320)).toBeGreaterThanOrEqual(92);
    expect(lensRadius(4000)).toBeLessThanOrEqual(150);
  });
});
