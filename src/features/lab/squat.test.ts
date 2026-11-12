import { describe, expect, it } from 'vitest';
import { buildLabBody, DEFAULT_SETTINGS, makeSolver, seriesFor, variantById } from './model';
import { last } from '@/engine/math/arr';

const body = buildLabBody(DEFAULT_SETTINGS);
const bottom = (id: string, s = DEFAULT_SETTINGS, b = body) => makeSolver(b, variantById(id), s)(1);

describe('agachamento por equilíbrio estático', () => {
  it('em pé: equilibrado e tronco quase vertical', () => {
    const f = makeSolver(body, variantById('high_bar'), DEFAULT_SETTINGS)(0);
    expect(f.balanced).toBe(true);
    expect(Math.abs(f.angles.trunk)).toBeLessThan(12);
  });

  it('no fundo: centro de massa sobre o meio do pé', () => {
    const f = bottom('high_bar');
    expect(f.balanced).toBe(true);
    expect(f.com[2]).toBeCloseTo(f.midfootZ, 3);
  });

  it('toda variação padrão equilibra em toda a descida, sem flexão lombar acima de 10°', () => {
    for (const id of ['high_bar', 'low_bar', 'front', 'heels_raised']) {
      for (const f of seriesFor(body, variantById(id), DEFAULT_SETTINGS, 13).frames) {
        expect(f.balanced, `${id} u=${f.u}`).toBe(true);
        expect(f.angles.lumbar, `${id} u=${f.u}`).toBeLessThan(10);
      }
    }
  });

  it('joelho atinge a profundidade pedida', () => {
    expect(bottom('high_bar').angles.knee).toBeCloseTo(115, 6);
    expect(bottom('low_bar').angles.knee).toBeCloseTo(105, 6);
  });

  it('barra baixa: mais inclinação de tronco, mais demanda de quadril, menos de joelho que a barra alta', () => {
    const hi = bottom('high_bar');
    const lo = bottom('low_bar');
    expect(lo.angles.trunk).toBeGreaterThan(hi.angles.trunk);
    expect(lo.demand.hip.moment).toBeGreaterThan(hi.demand.hip.moment);
    expect(lo.demand.knee.moment).toBeLessThan(hi.demand.knee.moment);
  });

  it('frontal: tronco mais vertical e mais demanda de joelho que a barra alta', () => {
    const hi = bottom('high_bar');
    const fr = bottom('front');
    expect(fr.angles.trunk).toBeLessThan(hi.angles.trunk);
    expect(fr.demand.knee.moment).toBeGreaterThan(hi.demand.knee.moment);
  });

  it('calço no calcanhar: tronco mais vertical que sem calço', () => {
    expect(bottom('heels_raised').angles.trunk).toBeLessThan(bottom('high_bar').angles.trunk);
  });

  it('coxa mais longa pede mais inclinação de tronco', () => {
    const s = { ...DEFAULT_SETTINGS, thighScale: 1.1 };
    const longBody = buildLabBody(s);
    expect(bottom('high_bar', s, longBody).angles.trunk).toBeGreaterThan(bottom('high_bar').angles.trunk);
  });

  it('menos dorsiflexão disponível pede mais inclinação de tronco', () => {
    const s = { ...DEFAULT_SETTINGS, ankleDeltaDeg: -10 };
    expect(bottom('high_bar', s).angles.trunk).toBeGreaterThan(bottom('high_bar').angles.trunk);
  });

  it('demanda cresce com a profundidade e é positiva no fundo', () => {
    const s = seriesFor(body, variantById('high_bar'), DEFAULT_SETTINGS, 11);
    const k0 = s.frames[0]?.demand.knee.moment ?? 0;
    expect(last(s.frames).demand.knee.moment).toBeGreaterThan(k0);
    expect(last(s.frames).demand.hip.moment).toBeGreaterThan(0);
  });

  it('ordem de grandeza: joelho e quadril entre 50 e 600 N·m por perna com 80 kg + 100 kg', () => {
    const f = bottom('high_bar');
    for (const m of [f.demand.knee.moment, f.demand.hip.moment]) {
      expect(m).toBeGreaterThan(50);
      expect(m).toBeLessThan(600);
    }
  });

  it('vastos alongam e reto femoral muda menos no agachamento', () => {
    const s = seriesFor(body, variantById('high_bar'), DEFAULT_SETTINGS, 11);
    const vl = last(s.lengths.vastus_lateralis_r ?? [0]);
    const rf = last(s.lengths.rectus_femoris_r ?? [0]);
    expect(vl).toBeGreaterThan(0.05);
    expect(Math.abs(rf)).toBeLessThan(vl / 2);
  });
});
