/** Estado do Atlas. Sem three.js: a cena lê via getState() e reage por subscribe. */
import { create } from 'zustand';
import type { MuscleGroup } from '@/data/schema/muscle';

export type AtlasView = 'front' | 'back' | 'side';

/** Vista que mostra melhor cada grupo (o lado de onde o músculo é visto sem cortes). */
const BACK: ReadonlySet<MuscleGroup> = new Set(['gluteals', 'hamstrings', 'triceps_surae', 'spinal_erectors', 'lats', 'traps', 'elbow_extensors', 'rotator_cuff', 'scapular']);
const SIDE: ReadonlySet<MuscleGroup> = new Set(['delts', 'neck']);
export const defaultView = (g: MuscleGroup): AtlasView => (BACK.has(g) ? 'back' : SIDE.has(g) ? 'side' : 'front');

/** Seleção: o palco devolve o músculo sob o ponto (px dentro do slot), ou null. */
export type AtlasPick = (x: number, y: number) => string | null;

interface AtlasState {
  muscleId: string | null;
  view: AtlasView;
  /** Elemento onde o palco desenha o corpo. */
  slot: HTMLElement | null;
  /** Músculo sob o ponteiro (destaque leve no palco). */
  hover: string | null;
  /** Registrada pela cena quando o corpo está pronto. */
  pick: AtlasPick | null;
  show: (muscleId: string | null, view: AtlasView) => void;
  setView: (v: AtlasView) => void;
  setSlot: (el: HTMLElement | null) => void;
  setHover: (id: string | null) => void;
  setPick: (f: AtlasPick | null) => void;
}

export const useAtlas = create<AtlasState>((set) => ({
  muscleId: null,
  view: 'front',
  slot: null,
  hover: null,
  pick: null,
  show: (muscleId, view) => set({ muscleId, view, hover: null }),
  setView: (view) => set({ view }),
  setSlot: (slot) => set((s) => (s.slot === slot ? s : { slot })),
  setHover: (hover) => set((s) => (s.hover === hover ? s : { hover })),
  setPick: (pick) => set({ pick }),
}));
