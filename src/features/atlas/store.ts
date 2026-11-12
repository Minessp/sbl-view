/** Estado do Atlas. Sem three.js: a cena lê via getState() e reage por subscribe. */
import { create } from 'zustand';
import type { MuscleGroup } from '@/data/schema/muscle';

export type AtlasView = 'front' | 'back' | 'side';

/** Vista que mostra melhor cada grupo (o lado de onde o músculo é visto sem cortes). */
const BACK: ReadonlySet<MuscleGroup> = new Set(['gluteals', 'hamstrings', 'triceps_surae', 'spinal_erectors', 'lats', 'traps', 'elbow_extensors']);
const SIDE: ReadonlySet<MuscleGroup> = new Set(['delts', 'neck']);
export const defaultView = (g: MuscleGroup): AtlasView => (BACK.has(g) ? 'back' : SIDE.has(g) ? 'side' : 'front');

interface AtlasState {
  muscleId: string | null;
  view: AtlasView;
  /** Elemento onde o palco desenha o corpo. */
  slot: HTMLElement | null;
  show: (muscleId: string | null, view: AtlasView) => void;
  setView: (v: AtlasView) => void;
  setSlot: (el: HTMLElement | null) => void;
}

export const useAtlas = create<AtlasState>((set) => ({
  muscleId: null,
  view: 'front',
  slot: null,
  show: (muscleId, view) => set({ muscleId, view }),
  setView: (view) => set({ view }),
  setSlot: (slot) => set((s) => (s.slot === slot ? s : { slot })),
}));
