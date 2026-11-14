/**
 * Estado do palco WebGL único. Não importa three.js: pode ser usado pela shell.
 * Rotas mandam "diretivas" (qual cena, progresso); o palco lazy reage.
 */
import { create } from 'zustand';

export type SceneId = 'none' | 'home' | 'lab' | 'compare' | 'atlas' | 'heat' | 'motion';

interface StageState {
  scene: SceneId;
  /** Progresso do scroll da página inicial, 0..1. */
  progress: number;
  /** O palco terminou de montar a geometria e desenhou o primeiro quadro. */
  ready: boolean;
  /** O corpo (ou o chunk do palco) não baixou. `retry` remonta o palco e tenta de novo. */
  failed: boolean;
  /** Conta as tentativas: vira a `key` do palco. */
  attempt: number;
  setFailed: (f: boolean) => void;
  retry: () => void;
  setScene: (scene: SceneId) => void;
  setProgress: (p: number) => void;
  setReady: (r: boolean) => void;
}

export const useStage = create<StageState>((set) => ({
  scene: 'none',
  progress: 0,
  ready: false,
  failed: false,
  attempt: 0,
  setFailed: (failed) => set({ failed }),
  retry: () => set((s) => ({ failed: false, ready: false, attempt: s.attempt + 1 })),
  setScene: (scene) => set({ scene }),
  setProgress: (p) => set({ progress: Math.min(1, Math.max(0, p)) }),
  setReady: (ready) => set({ ready }),
}));

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
