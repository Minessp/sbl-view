/** Estado do Lab. Sem three.js: a cena lê via getState() e reage por subscribe. */
import { create } from 'zustand';
import { DEFAULT_SETTINGS, type LabSettings } from './model';

export type LinePattern = 'solid' | 'dashed' | 'dotted';
export const PATTERNS: LinePattern[] = ['solid', 'dashed', 'dotted'];
export const MAX_COMPARE = 3;

export interface EffortRef {
  knee: number;
  hip: number;
  ankle: number;
}

interface LabState {
  /** Variações na tela; a primeira é a principal. */
  variantIds: string[];
  settings: LabSettings;
  /** Progresso da repetição, 0..1 (desce até 0,5, sobe até 1). */
  t: number;
  playing: boolean;
  /** Maior demanda entre as variações na tela, por articulação (normaliza o "acender"). */
  effortRef: EffortRef;
  toggleVariant: (id: string) => void;
  setSettings: (patch: Partial<LabSettings>) => void;
  setT: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setEffortRef: (r: EffortRef) => void;
}

/** Elementos DOM onde cada variação é desenhada (o palco desenha por cima, recortado). */
export const useLabSlots = create<{
  slots: Record<string, HTMLElement | null>;
  overlays: Record<string, HTMLElement | null>;
  setSlot: (id: string, el: HTMLElement | null) => void;
  setOverlay: (id: string, el: HTMLElement | null) => void;
}>((set) => ({
  slots: {},
  overlays: {},
  setSlot: (id, el) => set((s) => (s.slots[id] === el ? s : { slots: { ...s.slots, [id]: el } })),
  setOverlay: (id, el) => set((s) => (s.overlays[id] === el ? s : { overlays: { ...s.overlays, [id]: el } })),
}));

export const useLab = create<LabState>((set) => ({
  variantIds: ['high_bar', 'low_bar'],
  settings: DEFAULT_SETTINGS,
  t: 0.5,
  playing: false,
  effortRef: { knee: 1, hip: 1, ankle: 1 },
  toggleVariant: (id) =>
    set((s) => {
      const has = s.variantIds.includes(id);
      if (has) return s.variantIds.length > 1 ? { variantIds: s.variantIds.filter((v) => v !== id) } : s;
      const next = [...s.variantIds, id];
      return { variantIds: next.length > MAX_COMPARE ? next.slice(next.length - MAX_COMPARE) : next };
    }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setT: (t) => set({ t: Math.min(1, Math.max(0, t)) }),
  setPlaying: (playing) => set({ playing }),
  setEffortRef: (effortRef) => set({ effortRef }),
}));
