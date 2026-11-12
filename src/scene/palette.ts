/** Lê os tokens de cor do CSS (fonte única) para uso no WebGL. Valores sRGB 0..1, sem conversão. */
import { Vector3 } from 'three';

export type PaletteKey = 'bg' | 'bg-2' | 'ink' | 'ink-2' | 'rule' | 'accent' | 'bone';
export type Palette = Record<PaletteKey, Vector3>;

const KEYS: PaletteKey[] = ['bg', 'bg-2', 'ink', 'ink-2', 'rule', 'accent', 'bone'];

function hexToVec(hex: string, out: Vector3): Vector3 {
  const h = hex.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return out;
  return out.set(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

export function createPalette(): Palette {
  return Object.fromEntries(KEYS.map((k) => [k, new Vector3()])) as Palette;
}

/** Atualiza os vetores no lugar (os uniforms apontam para eles). */
export function readPalette(into: Palette): Palette {
  const cs = getComputedStyle(document.documentElement);
  for (const k of KEYS) hexToVec(cs.getPropertyValue(`--c-${k}`), into[k]);
  return into;
}
