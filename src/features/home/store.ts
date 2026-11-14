/**
 * Estado da página inicial. Sem three.js: a shell importa. A interface escreve; a cena lê via getState() e subscribe.
 * O ponteiro da lente fica num objeto mutável (muda a cada movimento, não precisa renderizar React).
 */
import { create } from 'zustand';
import type { LensDepth } from './timeline';

/** Estrutura sob o ponteiro: músculo do Atlas ou parte do pacote. Mesmo formato do `Pick` do Atlas. */
export interface HomePick {
  readonly kind: 'muscle' | 'part';
  readonly id: string;
  readonly side: 'r' | 'l' | 'c';
}

export const samePick = (a: HomePick | null, b: HomePick | null) => (a && b ? a.kind === b.kind && a.id === b.id : a === b);

/** Órbita da câmera do herói (o mesmo formato do Atlas), escrita pela cena a cada quadro. */
export interface HeroOrbit {
  yaw: number;
  pitch: number;
  dist: number;
  target: readonly [number, number, number];
}

/** Ponteiro da lente em coordenadas da janela (px de CSS). `on` = dentro da vista. `scale` multiplica o raio (piloto). */
export const lens = { x: 0, y: 0, on: false, scale: 1 };
/** Giro extra da câmera do piloto automático (rad), somado ao do usuário e devolvido a zero quando ele assume. */
export const auto = { yaw: 0, running: false };
/** Última órbita desenhada (passa para o Atlas na transição). */
export const heroCamera: { orbit: HeroOrbit | null } = { orbit: null };

interface HomeState {
  slot: HTMLElement | null;
  depth: LensDepth;
  hover: HomePick | null;
  /** Guinada pedida pelo arrasto (rad), somada à da coreografia. */
  yaw: number;
  /** Estrutura escolhida: a câmera voa até ela antes de a página trocar. */
  leaving: HomePick | null;
  /** Entrada terminada: a lente pode aparecer. */
  live: boolean;
  /** A cena devolve a estrutura sob o ponto (px dentro da vista). */
  pick: ((x: number, y: number) => HomePick | null) | null;
  /** Contador que a interface incrementa para pedir um quadro (lente andou). */
  tick: number;
  setSlot: (el: HTMLElement | null) => void;
  setDepth: (d: LensDepth) => void;
  setHover: (p: HomePick | null) => void;
  orbitBy: (d: number) => void;
  leave: (p: HomePick | null) => void;
  setLive: (v: boolean) => void;
  setPick: (f: HomeState['pick']) => void;
  kick: () => void;
  reset: () => void;
}

export const useHome = create<HomeState>((set) => ({
  slot: null,
  depth: 'superficial',
  hover: null,
  yaw: 0,
  leaving: null,
  live: false,
  pick: null,
  tick: 0,
  setSlot: (slot) => set((s) => (s.slot === slot ? s : { slot })),
  setDepth: (depth) => set({ depth }),
  setHover: (hover) => set((s) => (samePick(s.hover, hover) ? s : { hover })),
  orbitBy: (d) => set((s) => ({ yaw: s.yaw + d })),
  leave: (leaving) => set({ leaving, hover: null }),
  setLive: (live) => set((s) => (s.live === live ? s : { live })),
  setPick: (pick) => set({ pick }),
  kick: () => set((s) => ({ tick: s.tick + 1 })),
  reset: () => {
    lens.on = false;
    set({ hover: null, yaw: 0, leaving: null, live: false });
  },
}));

/** Rolagem da página: com o Lenis ativo, rolar por ele (rolagem nativa brigaria com a suavização). */
export const homeScroll: { to: ((y: number) => void) | null } = { to: null };
