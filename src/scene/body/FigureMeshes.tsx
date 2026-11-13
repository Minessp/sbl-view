/**
 * Desenha uma `FigureModel` com o material de prancha. Um material por parte muscular (o
 * destaque e o fantasma mudam por músculo); ossos, músculos de contexto e pele dividem materiais.
 * Partes espelhadas ganham uma segunda malha com escala X negativa (three inverte a face sozinho).
 */
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { useTheme } from '@/ui/theme';
import { createPlateMaterial, createShared, type PlateMaterial } from '../materials/plate';
import { createPalette, readPalette } from '../palette';
import type { FigureModel, FigurePart } from './figure';

export const STAIN_ON = 0.92;
export const STAIN_OFF = 0.07;

export interface FigureMaterials {
  /** Material de cada parte muscular, por `key`. */
  muscle: Map<string, PlateMaterial>;
  of(p: FigurePart): PlateMaterial;
}

export function useFigureMaterials(model: FigureModel): FigureMaterials {
  const invalidate = useThree((s) => s.invalidate);
  const dpr = useThree((s) => s.viewport.dpr);
  const palette = useMemo(() => readPalette(createPalette()), []);
  const shared = useMemo(() => createShared(palette, dpr), [palette, dpr]);

  const mats = useMemo(() => {
    const solid = () => ({ value: 9 });
    const bone = createPlateMaterial(shared, { base: palette.bone, cut: solid(), ghost: { value: 0 }, hatch: 1 });
    const context = createPlateMaterial(shared, { base: palette.bone, cut: solid(), ghost: { value: 0.3 }, hatch: 0.7, stain: 0 });
    // Pele: só o contorno pontilhado (tudo acima do corte = fantasma).
    const skin = createPlateMaterial(shared, { base: palette.bone, cut: { value: -9 }, ghost: { value: 0.32 }, hatch: 0 });
    const muscle = new Map<string, PlateMaterial>();
    for (const p of model.parts)
      if (p.kind === 'muscle') muscle.set(p.key, createPlateMaterial(shared, { base: palette.bone, cut: solid(), ghost: { value: 0.38 }, fiber: p.fiber ? 1 : 0, hatch: 0.85, stain: STAIN_OFF }));
    const of = (p: FigurePart) => (p.kind === 'muscle' ? (muscle.get(p.key) ?? context) : p.kind === 'bone' ? bone : p.kind === 'skin' ? skin : context);
    return { muscle, of, all: [bone, context, skin, ...muscle.values()] };
  }, [shared, palette, model]);

  useEffect(() => () => mats.all.forEach((m) => m.dispose()), [mats]);

  // Tema mudou: relê as cores das variáveis CSS (no quadro seguinte, depois do CSS aplicar).
  const resolved = useTheme((s) => s.resolved);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      readPalette(palette);
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [resolved, palette, invalidate]);

  return mats;
}

const MIRROR: [number, number, number] = [-1, 1, 1];

export function FigureMeshes({ model, mats }: { model: FigureModel; mats: FigureMaterials }) {
  return (
    <>
      {model.parts.map((p) => {
        const mat = mats.of(p);
        // Profundo desenha antes; pele por último (só contorno).
        const order = p.kind === 'skin' ? 3 : p.deep ? 1 : 2;
        const common = { geometry: p.geometry, material: mat, renderOrder: order, ...(p.position && { position: p.position }), ...(p.quaternion && { quaternion: p.quaternion }) };
        return p.mirror ? (
          <group key={p.key}>
            <mesh {...common} />
            <mesh {...common} scale={MIRROR} />
          </group>
        ) : (
          <mesh key={p.key} {...common} />
        );
      })}
    </>
  );
}
