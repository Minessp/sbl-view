/**
 * Estado do pipeline de cinema (sem React): a cena principal declara a câmera, o recorte e o foco a cada quadro;
 * `Cinema.tsx` lê. Vistas sem dono (Comparar, mapa de calor) recebem bloom e tom, sem profundidade de campo nem oclusão.
 */
import type { PerspectiveCamera } from 'three';
import type { Effects } from '../perf/tiers';

export interface MainView {
  camera: PerspectiveCamera;
  /** Recorte da vista em px CSS, relativo ao canvas (origem em cima à esquerda). */
  rect: { x: number; y: number; w: number; h: number };
}

export const cinema = {
  /** Efeitos ligados (Cinema.tsx escreve; o cenário lê sombra e reflexo). */
  fx: null as Effects | null,
  main: null as MainView | null,
  /** Último quadro em que a vista principal se declarou (performance.now). */
  seen: 0,
  /** Distância de foco (m, da câmera): atual e meta. */
  focus: 3,
  focusGoal: 3,
  /** Abertura: 0 = tudo nítido, 1 = macro de profundidade rasa. */
  aperture: 0.55,
  apertureGoal: 0.55,
  /** Puxada de foco da transição de rota (0 = nítido, 1 = tudo desfocado). */
  pull: 0,
  /** Ponto do mundo de onde vem o feixe (atrás e acima do corpo). */
  beam: [0.35, 2.15, -1.6] as [number, number, number],
  /** Força do feixe (0..1), por cena. */
  beamK: 1,
  /** Só desenvolvimento: força efeitos ligados/desligados (`window.__cinema.force = { ao: false }`). */
  force: {} as Partial<Record<'bloom' | 'ao' | 'dof' | 'rays' | 'shadow' | 'reflect', boolean>>,
};

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __cinema: typeof cinema }).__cinema = cinema;

/** A cena principal se declara no quadro (chamar no useFrame dela). `focus` = distância da câmera ao assunto. */
export function claimMain(camera: PerspectiveCamera, slot: HTMLElement, canvas: HTMLCanvasElement, focus: number, aperture = 0.55) {
  const s = slot.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  const rect = { x: s.left - c.left, y: s.top - c.top, w: s.width, h: s.height };
  if (!cinema.main || cinema.main.camera !== camera) cinema.main = { camera, rect };
  else cinema.main.rect = rect;
  cinema.seen = performance.now();
  cinema.focusGoal = focus;
  cinema.apertureGoal = aperture;
}

export function releaseMain(camera: PerspectiveCamera | null) {
  if (camera && cinema.main?.camera === camera) cinema.main = null;
}
