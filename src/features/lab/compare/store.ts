/**
 * Estado do Lab de comparação. Sem three.js: a cena lê via getState() e reage por subscribe.
 * `u` é a posição na repetição: 0 = alvo alongado, 1 = encurtado (a mesma de todos os clipes). `phase` anda no relógio
 * (vaivém em cosseno: alongado → encurtado → alongado).
 */
import { create } from 'zustand';
import type { CompareSpec } from './analysis';

export const MAX_EXERCISES = 3;
export type CompareView = 'side' | 'front' | 'back' | 'diagonal';
export const COMPARE_VIEWS: readonly CompareView[] = ['side', 'front', 'back', 'diagonal'];

/** Exercício na tela: o mesmo exercício pode aparecer duas vezes com opções diferentes (variação contra variação). */
export interface Slot extends CompareSpec {
  readonly key: string;
}

let nextKey = 0;
export const makeSlot = (s: CompareSpec): Slot => ({ ...s, key: `v${nextKey++}` });

interface CompareState {
  muscle: string;
  specs: Slot[];
  /** Fase do vaivém, 0..1 (0 e 1 = alongado, 0,5 = encurtado). */
  phase: number;
  playing: boolean;
  view: CompareView;
  /** Pele por cima (o alvo fica sob ela). */
  skin: boolean;
  setMuscle: (muscle: string, specs: readonly CompareSpec[]) => void;
  toggleExercise: (id: string) => void;
  /** Mesmo exercício de novo, ao lado, para trocar uma opção. */
  duplicate: (key: string) => void;
  remove: (key: string) => void;
  setOption: (key: string, variation: string, option: string) => void;
  setPhase: (p: number) => void;
  setPlaying: (p: boolean) => void;
  setView: (v: CompareView) => void;
  setSkin: (v: boolean) => void;
}

/** u na fase do vaivém (cosseno: devagar nas pontas). */
export const uAtPhase = (p: number): number => (1 - Math.cos(2 * Math.PI * p)) / 2;

export const useCompare = create<CompareState>((set) => ({
  muscle: 'biceps_brachii',
  specs: ['incline_dumbbell_curl', 'preacher_curl', 'bayesian_curl'].map((exercise) => makeSlot({ exercise, options: {} })),
  phase: 0,
  playing: false,
  view: 'side',
  skin: false,
  setMuscle: (muscle, specs) => set({ muscle, specs: specs.slice(0, MAX_EXERCISES).map(makeSlot) }),
  toggleExercise: (id) =>
    set((s) => {
      if (s.specs.some((x) => x.exercise === id)) {
        const rest = s.specs.filter((x) => x.exercise !== id);
        return rest.length ? { specs: rest } : s;
      }
      const next = [...s.specs, makeSlot({ exercise: id, options: {} })];
      return { specs: next.length > MAX_EXERCISES ? next.slice(next.length - MAX_EXERCISES) : next };
    }),
  duplicate: (key) =>
    set((s) => {
      const i = s.specs.findIndex((x) => x.key === key);
      const src = s.specs[i];
      if (!src || s.specs.length >= MAX_EXERCISES) return s;
      const next = [...s.specs];
      next.splice(i + 1, 0, makeSlot({ exercise: src.exercise, options: { ...src.options } }));
      return { specs: next };
    }),
  remove: (key) => set((s) => (s.specs.length > 1 ? { specs: s.specs.filter((x) => x.key !== key) } : s)),
  setOption: (key, variation, option) =>
    set((s) => ({ specs: s.specs.map((x) => (x.key === key ? { ...x, options: { ...x.options, [variation]: option } } : x)) })),
  setPhase: (phase) => set({ phase: ((phase % 1) + 1) % 1 }),
  setPlaying: (playing) => set({ playing }),
  setView: (view) => set({ view }),
  setSkin: (skin) => set({ skin }),
}));

/** Elementos onde cada exercício é desenhado (o palco desenha por cima, recortado). Chave = `Slot.key`. */
export const useCompareSlots = create<{
  slots: Record<string, HTMLElement | null>;
  setSlot: (id: string, el: HTMLElement | null) => void;
}>((set) => ({
  slots: {},
  setSlot: (id, el) => set((s) => (s.slots[id] === el ? s : { slots: { ...s.slots, [id]: el } })),
}));

// ---- URL: ?alvo=biceps_brachii&ex=incline_dumbbell_curl,bayesian_curl:pulley=high ----

export function encodeQuery(muscle: string, specs: readonly CompareSpec[]): string {
  const ex = specs.map((s) => [s.exercise, ...Object.entries(s.options).map(([k, v]) => `${k}=${v}`)].join(':')).join(',');
  return `?alvo=${encodeURIComponent(muscle)}&ex=${encodeURIComponent(ex)}`;
}

export function decodeQuery(search: string): { muscle: string | null; specs: CompareSpec[] } {
  const q = new URLSearchParams(search);
  const specs = (q.get('ex') ?? '')
    .split(',')
    .filter(Boolean)
    .map((chunk) => {
      const [exercise = '', ...opts] = chunk.split(':');
      const options: Record<string, string> = {};
      for (const o of opts) {
        const [k, v] = o.split('=');
        if (k && v) options[k] = v;
      }
      return { exercise, options };
    });
  return { muscle: q.get('alvo'), specs };
}
