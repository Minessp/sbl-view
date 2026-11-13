/**
 * Estado do player de exercício. Sem three.js: a cena lê via getState() e o relógio anda no laço dela.
 * `time` é o instante dentro da repetição (s); a interface mostra u e a fase a partir dele (`repAt`).
 */
import { create } from 'zustand';
import type { CompiledClip } from '@/engine/motion/evaluate';

export type PlayerView = 'front' | 'side' | 'back' | 'diagonal' | 'top';
export const PLAYER_VIEWS: readonly PlayerView[] = ['front', 'side', 'back', 'diagonal', 'top'];
export const PLAYER_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type PlayerSpeed = (typeof PLAYER_SPEEDS)[number];
/** Passo do quadro a quadro (s de repetição). */
export const FRAME_STEP = 1 / 15;

/** Guinada e arfagem de cada vista (rad). Guinada 0 = câmera de frente; −π/2 = perfil direito. */
export const VIEW_ANGLES: Readonly<Record<PlayerView, { yaw: number; pitch: number }>> = {
  front: { yaw: 0, pitch: 0.08 },
  side: { yaw: -Math.PI / 2, pitch: 0.06 },
  back: { yaw: Math.PI, pitch: 0.1 },
  diagonal: { yaw: -Math.PI / 4, pitch: 0.22 },
  top: { yaw: -Math.PI / 5, pitch: 0.95 },
};

export interface PlayerTargets {
  readonly primary: readonly string[];
  readonly synergist: readonly string[];
}

interface PlayerState {
  slot: HTMLElement | null;
  clip: CompiledClip | null;
  targets: PlayerTargets;
  playing: boolean;
  speed: PlayerSpeed;
  time: number;
  view: PlayerView;
  /** Arrasto do usuário somado à vista (rad) e zoom (fator da distância). */
  drag: { yaw: number; pitch: number; zoom: number };
  isolate: string | null;
  showLoad: boolean;
  skin: boolean;
  setSlot: (el: HTMLElement | null) => void;
  load: (clip: CompiledClip | null, targets: PlayerTargets) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: PlayerSpeed) => void;
  setTime: (t: number) => void;
  step: (dir: 1 | -1) => void;
  setView: (v: PlayerView) => void;
  dragBy: (yaw: number, pitch: number) => void;
  zoomBy: (k: number) => void;
  setIsolate: (id: string | null) => void;
  setShowLoad: (v: boolean) => void;
  setSkin: (v: boolean) => void;
}

const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const usePlayer = create<PlayerState>((set, get) => ({
  slot: null,
  clip: null,
  targets: { primary: [], synergist: [] },
  playing: false,
  speed: 1,
  time: 0,
  view: 'side',
  drag: { yaw: 0, pitch: 0, zoom: 1 },
  isolate: null,
  showLoad: true,
  skin: false,
  setSlot: (slot) => set({ slot }),
  // Clipe novo: volta ao início, na vista do clipe; com redução de movimento começa parado.
  load: (clip, targets) =>
    set({
      clip,
      targets,
      time: 0,
      playing: !reduce(),
      view: clip?.clip.view ?? 'side',
      drag: { yaw: 0, pitch: 0, zoom: 1 },
      isolate: null,
    }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setTime: (time) => set({ time }),
  step: (dir) => set({ playing: false, time: Math.max(0, get().time + dir * FRAME_STEP) }),
  setView: (view) => set({ view, drag: { yaw: 0, pitch: 0, zoom: get().drag.zoom } }),
  dragBy: (yaw, pitch) =>
    set((s) => ({
      drag: {
        ...s.drag,
        yaw: s.drag.yaw + yaw,
        pitch: clamp(s.drag.pitch + pitch, -0.6, 1.2),
      },
    })),
  zoomBy: (k) =>
    set((s) => ({
      drag: { ...s.drag, zoom: clamp(s.drag.zoom * k, 0.45, 2.2) },
    })),
  setIsolate: (isolate) => set({ isolate }),
  setShowLoad: (showLoad) => set({ showLoad }),
  setSkin: (skin) => set({ skin }),
}));
