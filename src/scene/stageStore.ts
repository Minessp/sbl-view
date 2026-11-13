/**
 * Estado do palco WebGL único. Não importa three.js: pode ser usado pela shell.
 * Rotas mandam "diretivas" (qual cena, progresso); o palco lazy reage.
 */
import { create } from 'zustand';

export type SceneId = 'none' | 'opening' | 'lab' | 'atlas' | 'heat' | 'motion';

interface StageState {
  scene: SceneId;
  /** Progresso da abertura, 0..1 (vem do scroll). */
  progress: number;
  /** O palco terminou de montar a geometria e desenhou o primeiro quadro. */
  ready: boolean;
  setScene: (scene: SceneId) => void;
  setProgress: (p: number) => void;
  setReady: (r: boolean) => void;
}

export const useStage = create<StageState>((set) => ({
  scene: 'none',
  progress: 0,
  ready: false,
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
