/**
 * Plano de saída (sem three): a cena que sai deixa o que estava desenhando (recorte, câmera, pose, pele); a que entra
 * parte dele e voa até o próprio enquadramento. A troca é a mesma num voo pela metade (a captura devolve o instante).
 */
import { create } from 'zustand';
import type { Transform, Vec3 } from '@/engine/math/vec';

/** px CSS na viewport. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Shot {
  rect: Rect;
  camera: { pos: Vec3; target: Vec3; fovDeg: number };
  /** Graus por DOF e raiz dada ao FK; null = em pé (STANDING). */
  pose: { deg: Readonly<Record<string, number>>; root: Transform } | null;
  /** Alfa da pele. */
  look: { skin: number };
  /** performance.now() da captura. */
  at: number;
}

interface HandoffState {
  shot: Shot | null;
  leave: (s: Shot) => void;
  /** Plano deixado há no máximo `maxAgeMs`; consome (a próxima cena não reaproveita um voo velho). */
  take: (maxAgeMs?: number) => Shot | null;
}

export const useHandoff = create<HandoffState>((set, get) => ({
  shot: null,
  leave: (shot) => set({ shot }),
  take: (maxAgeMs = 1500) => {
    const s = get().shot;
    if (!s) return null;
    set({ shot: null });
    return performance.now() - s.at <= maxAgeMs ? s : null;
  },
}));
