/**
 * Estado do explorador do corpo (Atlas). Sem three.js: a cena lê via getState() e reage por subscribe.
 * A interface muda a órbita "meta"; a cena amortece até ela e calcula enquadramentos (pedidos por `fly`).
 */
import { create } from 'zustand';
import type { MuscleGroup } from '@/data/schema/muscle';
import { DEMO_SPEEDS, type DemoSpeed } from './explorer/demo';
import { BODY_BOX, clampOrbit, DIST, panOrbit, VIEW_YAW, type AtlasView, type Orbit } from './explorer/orbit';

export type { AtlasView } from './explorer/orbit';
export type BodyLayerId = 'skin' | 'superficial' | 'deep' | 'bone';
export const LAYER_ORDER: readonly BodyLayerId[] = ['skin', 'superficial', 'deep', 'bone'];
export type LayerMode = 'on' | 'ghost' | 'off';
export type CutAxis = 'none' | 'transverse' | 'frontal' | 'sagittal';

/** Vista que mostra melhor cada grupo (o lado de onde o músculo é visto sem cortes). */
const BACK: ReadonlySet<MuscleGroup> = new Set(['gluteals', 'hamstrings', 'triceps_surae', 'spinal_erectors', 'lats', 'traps', 'elbow_extensors', 'rotator_cuff', 'scapular']);
const SIDE: ReadonlySet<MuscleGroup> = new Set(['delts', 'neck', 'jaw', 'hyoid', 'thorax']);
export const defaultView = (g: MuscleGroup): AtlasView => (BACK.has(g) ? 'back' : SIDE.has(g) ? 'side' : 'front');

/** Estrutura selecionável: músculo do Atlas (as duas cópias) ou parte do pacote sem página. */
export interface Pick {
  readonly kind: 'muscle' | 'part';
  readonly id: string;
  /** Lado tocado (a câmera voa até ele); 'c' = linha média. */
  readonly side: 'r' | 'l' | 'c';
  /** Parte do músculo (deltoide anterior, trapézio inferior…); ausente = o músculo inteiro. */
  readonly part?: string | undefined;
}
export const keyOf = (p: Pick): string => `${p.kind}:${p.id}${p.part ? `/${p.part}` : ''}`;
export const samePick = (a: Pick | null, b: Pick | null) => (a && b ? a.kind === b.kind && a.id === b.id && a.part === b.part : a === b);

/** Parte do pacote, registrada pela cena quando o modelo carrega (busca e nome do que não tem página). */
export interface StructureInfo {
  readonly id: string;
  readonly kind: 'bone' | 'cartilage' | 'muscle' | 'tendon' | 'skin';
  readonly layer: BodyLayerId;
  /** Nome do objeto no Z-Anatomy (inglês), sem o sufixo de lado. */
  readonly source: string;
  /** Músculo do Atlas que usa a malha. */
  readonly muscleId?: string;
}

/** Seleção: o palco devolve a estrutura sob o ponto (px dentro do slot), ou null. */
export type AtlasPickFn = (x: number, y: number) => Pick | null;

export interface DemoSpec {
  /** Grau de liberdade do esqueleto (`hip_flex_r`). */
  readonly dof: string;
  readonly range: readonly [number, number];
  /** Ponta alongada (início do ciclo) e encurtada da ação, em graus do DOF. */
  readonly from: number;
  readonly to: number;
  /** Outros DOFs fixos durante a ação (graus, com lado). */
  readonly base: Readonly<Record<string, number>>;
  /** Plano da ação: escolhe a vista (perfil no sagital, frente no frontal, de cima no transversal). */
  readonly plane: 'sagital' | 'frontal' | 'transversal';
  /** Chave da curva (para a interface saber qual está tocando). */
  readonly key: string;
}

export interface DemoState {
  readonly spec: DemoSpec | null;
  readonly playing: boolean;
  readonly speed: DemoSpeed;
  readonly loop: boolean;
  readonly phase: number;
}

export interface FlyRequest {
  readonly nonce: number;
  /** Guinada nova (vista pedida) ou null = mantém a atual. */
  readonly yaw: number | null;
  readonly instant: boolean;
  /** Destino além da seleção: uma ponta do músculo selecionado ou uma região do corpo. */
  readonly to?: { readonly end: 'origin' | 'insertion' } | { readonly region: string } | undefined;
}

/** Peso de cada camada na alavanca de descascar: 0 pele, 1 superficial, 2 profundo, 3 osso. */
export const PEEL_MAX = LAYER_ORDER.length - 1;
/** Camadas que a alavanca deixa: as de cima da posição saem, a da posição e as de baixo ficam. */
export const peelLayers = (p: number): Record<BodyLayerId, LayerMode> =>
  Object.fromEntries(LAYER_ORDER.map((l, i) => [l, i < Math.floor(p + 1e-6) ? 'off' : 'on'])) as Record<BodyLayerId, LayerMode>;

/** Rótulo vivo na tela (px do cliente), escrito pelo palco. */
export interface LabelFeedItem {
  readonly key: string;
  readonly muscleId: string;
  readonly side: 'r' | 'l' | 'c';
  readonly x: number;
  readonly y: number;
}
export interface LabelFeed {
  /** Alguém mostra os rótulos (o palco só mede quando há quem leia). */
  on: boolean;
  /** Rótulos de músculos ligados (tela larga); sem eles o palco não mede a vista, só projeta as pontas da seleção. */
  labels: boolean;
  items: readonly LabelFeedItem[];
  /** Bordas do corpo na tela e o retângulo do slot (px do cliente). */
  body: { left: number; right: number } | null;
  rect: { x: number; y: number; w: number; h: number } | null;
  /** Origem e inserção do músculo selecionado (px do cliente). */
  ends: { origin: readonly [number, number]; insertion: readonly [number, number] } | null;
}
export const useLabelFeed = create<LabelFeed>(() => ({ on: false, labels: false, items: [], body: null, rect: null, ends: null }));

const START: Orbit = { yaw: 0, pitch: 0.04, dist: 4.4, target: BODY_BOX.center };
/** Rotação (plano transversal) vista de cima e de frente. */
const DEMO_TOP_PITCH = 0.75;

interface AtlasState {
  selection: Pick | null;
  hover: Pick | null;
  /** Órbita meta; a cena amortece até ela. */
  orbit: Orbit;
  fly: FlyRequest;
  layers: Record<BodyLayerId, LayerMode>;
  /** Alavanca de descascar (0..PEEL_MAX); a parte fracionária descasca a camada da vez de cima para baixo. */
  peel: number;
  hidden: readonly string[];
  ghosted: readonly string[];
  isolate: boolean;
  exploded: boolean;
  cut: { axis: CutAxis; at: number };
  demo: DemoState;
  structures: readonly StructureInfo[];
  /** Corpo deslocado no quadro (fração da largura, + = para a direita): as pranchas ocupam a esquerda. */
  shift: number;
  /** Mergulho: 0 = músculo, 1 = fibras, 2 = sarcômero. `diveable`: a página tem mergulho (aproximar além do mínimo entra). */
  dive: 0 | 1 | 2;
  diveable: boolean;
  /** Elemento onde o palco desenha o corpo. */
  slot: HTMLElement | null;
  pick: AtlasPickFn | null;
  /** Chegada da página inicial: a câmera começa onde a de lá parou e voa até a seleção. Consumida por `reset`. */
  handoff: { orbit: Orbit; selection: Pick } | null;

  select: (p: Pick | null, opts?: { fly?: boolean; view?: AtlasView | null }) => void;
  setHover: (p: Pick | null) => void;
  orbitBy: (dyaw: number, dpitch: number) => void;
  zoomBy: (factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  setOrbit: (o: Orbit) => void;
  setView: (v: AtlasView) => void;
  /** Reenquadra a seleção (ou o corpo) sem mudar a guinada. */
  frame: (instant?: boolean) => void;
  resetCamera: () => void;
  setLayer: (l: BodyLayerId, m: LayerMode) => void;
  setPeel: (p: number) => void;
  flyToEnd: (end: 'origin' | 'insertion') => void;
  flyToRegion: (id: string) => void;
  toggleHidden: (key: string) => void;
  toggleGhost: (key: string) => void;
  setIsolate: (on: boolean) => void;
  showAll: () => void;
  setExploded: (on: boolean) => void;
  setCut: (c: Partial<{ axis: CutAxis; at: number }>) => void;
  startDemo: (spec: DemoSpec) => void;
  setDemo: (d: Partial<Omit<DemoState, 'spec'>>) => void;
  stopDemo: () => void;
  setStructures: (s: readonly StructureInfo[]) => void;
  setSlot: (el: HTMLElement | null) => void;
  setShift: (x: number) => void;
  setDive: (level: 0 | 1 | 2) => void;
  setDiveable: (on: boolean) => void;
  setPick: (f: AtlasPickFn | null) => void;
  setHandoff: (h: AtlasState['handoff']) => void;
  /** Volta ao estado inicial (troca de página). */
  reset: (selection?: Pick | null, view?: AtlasView) => void;
}

/** Começa sem a pele: o Atlas mostra músculo. */
const PEEL_DEFAULT = 1;
const LAYERS_DEFAULT = peelLayers(PEEL_DEFAULT);
const DEMO_DEFAULT: DemoState = { spec: null, playing: false, speed: 1, loop: true, phase: 0 };
const toggle = (list: readonly string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

export const useAtlas = create<AtlasState>((set, get) => {
  const fly = (yaw: number | null, instant = false): FlyRequest => ({ nonce: get().fly.nonce + 1, yaw, instant });
  return {
    selection: null,
    hover: null,
    orbit: START,
    fly: { nonce: 0, yaw: 0, instant: true },
    layers: { ...LAYERS_DEFAULT },
    peel: PEEL_DEFAULT,
    hidden: [],
    ghosted: [],
    isolate: false,
    exploded: false,
    cut: { axis: 'none', at: 0.5 },
    demo: DEMO_DEFAULT,
    structures: [],
    shift: 0,
    dive: 0,
    diveable: false,
    slot: null,
    pick: null,
    handoff: null,

    select: (p, opts = {}) =>
      set((s) => {
        const changed = !samePick(s.selection, p);
        const view = opts.view ?? null;
        return {
          selection: p,
          hover: null,
          ...(changed && { demo: { ...s.demo, spec: null, playing: false, phase: 0 }, isolate: s.isolate && p !== null }),
          ...(opts.fly && { fly: fly(view === null ? null : VIEW_YAW[view]) }),
        };
      }),
    setHover: (hover) => set((s) => (samePick(s.hover, hover) ? s : { hover })),
    orbitBy: (dyaw, dpitch) => set((s) => ({ orbit: clampOrbit({ ...s.orbit, yaw: s.orbit.yaw + dyaw, pitch: s.orbit.pitch + dpitch }) })),
    zoomBy: (f) =>
      set((s) =>
        // Já encostado e pedindo mais: mergulha (onde a página tem mergulho).
        s.diveable && f < 1 && s.dive === 0 && s.orbit.dist <= DIST[0] + 1e-3 ? { dive: 1 } : { orbit: clampOrbit({ ...s.orbit, dist: s.orbit.dist * f }) },
      ),
    panBy: (dx, dy) => set((s) => ({ orbit: panOrbit(s.orbit, dx, dy) })),
    setOrbit: (orbit) => set({ orbit: clampOrbit(orbit) }),
    setView: (v) => set((s) => ({ orbit: { ...s.orbit, pitch: START.pitch }, fly: fly(VIEW_YAW[v]) })),
    frame: (instant = false) => set({ fly: fly(null, instant) }),
    resetCamera: () => set((s) => ({ orbit: { ...s.orbit, pitch: START.pitch }, fly: fly(0) })),
    // Aberta, a vista explodida reenquadra (o número de camadas abertas muda).
    setLayer: (l, m) => set((s) => ({ layers: { ...s.layers, [l]: m }, ...(s.exploded && { fly: fly(null) }) })),
    setPeel: (p) =>
      set((s) => {
        const peel = Math.min(PEEL_MAX, Math.max(0, p));
        const layers = peelLayers(peel);
        const same = LAYER_ORDER.every((l) => s.layers[l] === layers[l]);
        return { peel, ...(!same && { layers, ...(s.exploded && { fly: fly(null) }) }) };
      }),
    flyToEnd: (end) => set({ fly: { ...fly(null), to: { end } } }),
    flyToRegion: (region) => set((s) => ({ selection: null, demo: { ...s.demo, spec: null, playing: false, phase: 0 }, fly: { ...fly(null), to: { region } } })),
    toggleHidden: (k) => set((s) => ({ hidden: toggle(s.hidden, k), ghosted: s.ghosted.filter((x) => x !== k) })),
    toggleGhost: (k) => set((s) => ({ ghosted: toggle(s.ghosted, k), hidden: s.hidden.filter((x) => x !== k) })),
    setIsolate: (isolate) => set({ isolate }),
    showAll: () => set({ hidden: [], ghosted: [], isolate: false, layers: { ...LAYERS_DEFAULT }, peel: PEEL_DEFAULT }),
    setExploded: (exploded) => set({ exploded, fly: fly(null) }),
    setCut: (c) => set((s) => ({ cut: { ...s.cut, ...c } })),
    // A vista mostra o plano do movimento: perfil direito no sagital, frente (ou costas) no frontal, de cima e de frente no
    // transversal; a câmera reenquadra o membro que se move.
    startDemo: (spec) =>
      set((s) => {
        const back = Math.cos(s.orbit.yaw) < -0.5;
        const yaw = spec.plane === 'sagital' ? VIEW_YAW.side : back ? VIEW_YAW.back : VIEW_YAW.front;
        const pitch = spec.plane === 'transversal' ? DEMO_TOP_PITCH : START.pitch;
        return { demo: { ...s.demo, spec, playing: true, phase: 0 }, exploded: false, orbit: clampOrbit({ ...s.orbit, pitch }), fly: fly(yaw) };
      }),
    setDemo: (d) => set((s) => ({ demo: { ...s.demo, ...d } })),
    stopDemo: () => set((s) => ({ demo: { ...s.demo, spec: null, playing: false, phase: 0 } })),
    setStructures: (structures) => set({ structures }),
    setShift: (shift) => set((s) => (s.shift === shift ? s : { shift, fly: fly(null, true) })),
    setDive: (dive) => set({ dive }),
    setDiveable: (diveable) => set({ diveable, dive: 0 }),
    setSlot: (slot) => set((s) => (s.slot === slot ? s : { slot })),
    setPick: (pick) => set({ pick }),
    setHandoff: (handoff) => set({ handoff }),
    reset: (selection = null, view = 'front') =>
      set((s) => {
        // Vindo da página inicial com a mesma estrutura: parte da câmera de lá e voa (sem corte seco).
        const h = s.handoff && samePick(s.handoff.selection, selection) ? s.handoff : null;
        return {
        selection,
        hover: null,
        orbit: h ? clampOrbit(h.orbit) : { ...START, yaw: VIEW_YAW[view] },
        fly: { nonce: s.fly.nonce + 1, yaw: VIEW_YAW[view], instant: !h },
        handoff: null,
        layers: { ...LAYERS_DEFAULT },
        peel: PEEL_DEFAULT,
        hidden: [],
        ghosted: [],
        isolate: false,
        exploded: false,
        cut: { axis: 'none', at: 0.5 },
        demo: DEMO_DEFAULT,
        dive: 0,
        };
      }),
  };
});

export { DEMO_SPEEDS };
