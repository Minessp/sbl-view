import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import bp3d from '@/data/bodyparts3d.json';
import { parseAnatomical } from './anatomical';

const file = readFileSync(new URL('../../../public/models/bp3d.bin', import.meta.url));
const model = parseAnatomical(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

describe('malha anatômica (BodyParts3D)', () => {
  it('tem todo músculo mapeado, ossos, contexto e pele', () => {
    const muscles = new Set(model.parts.flatMap((p) => p.muscleId ?? []));
    expect([...muscles].sort()).toEqual(Object.keys(bp3d.muscles).sort());
    for (const k of ['bone', 'context', 'skin'] as const) expect(model.parts.some((p) => p.kind === k)).toBe(true);
  });

  it('no sistema do SBL View: pés em y≈0, estatura ≈1,75 m, rosto para +Z, lado direito em −X', () => {
    const skin = model.parts.find((p) => p.kind === 'skin')?.geometry;
    skin?.computeBoundingBox();
    const b = skin?.boundingBox;
    expect(b?.min.y).toBeCloseTo(0, 1);
    expect(b?.max.y).toBeCloseTo(1.75, 1);
    // Quadríceps (direito, sem espelhar) fica à direita do sujeito e na frente da coxa.
    const vl = model.boxOf('vastus_lateralis');
    const gm = model.boxOf('gluteus_maximus');
    expect(vl && gm && vl.center[2] > gm.center[2]).toBe(true);
    const right = model.parts.find((p) => p.muscleId === 'vastus_lateralis')?.geometry;
    right?.computeBoundingBox();
    expect((right?.boundingBox?.max.x ?? 1) < 0).toBe(true);
  });

  it('caixa de enquadramento cobre os dois lados', () => {
    const box = model.boxOf('deltoid');
    expect(box && Math.abs(box.center[0])).toBeLessThan(0.01);
    expect(box?.size[0]).toBeGreaterThan(0.3);
  });

  it('músculo ausente na malha não tem caixa', () => {
    for (const id of Object.keys(bp3d.missing)) expect(model.boxOf(id)).toBeNull();
  });
});
