/** Estado do mapa de calor do corpo. Sem three.js: a cena lê via getState() e reage por subscribe. */
import { create } from 'zustand';

export type HeatView = 'front' | 'back';

interface HeatState {
  /** Séries diretas por semana, por músculo. */
  values: Readonly<Record<string, number>>;
  slots: Readonly<Record<HeatView, HTMLElement | null>>;
  setValues: (v: Readonly<Record<string, number>>) => void;
  setSlot: (view: HeatView, el: HTMLElement | null) => void;
}

export const useHeat = create<HeatState>((set) => ({
  values: {},
  slots: { front: null, back: null },
  setValues: (values) => set({ values }),
  setSlot: (view, el) => set((s) => (s.slots[view] === el ? s : { slots: { ...s.slots, [view]: el } })),
}));
