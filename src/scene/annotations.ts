/**
 * Chamadas de prancha (linha de chamada + número + nome) ligadas a pontos 3D.
 * O DOM registra os elementos; o palco projeta e escreve as posições a cada quadro.
 * Sem three.js aqui: a shell pode importar.
 */
export interface Anchor {
  id: string;
  el: HTMLElement | null;
  line: SVGLineElement | null;
}

export const anchors = new Map<string, Anchor>();

function ensure(id: string): Anchor {
  let a = anchors.get(id);
  if (!a) {
    a = { id, el: null, line: null };
    anchors.set(id, a);
  }
  return a;
}

export function bindAnchor(id: string, el: HTMLElement | null, line: SVGLineElement | null) {
  const a = ensure(id);
  a.el = el;
  a.line = line;
}

/** Rótulos da telemetria do player (o palco posiciona e escreve o número; a página dá o texto). */
export const HUD_TAGS = { angle: 'hud-angle', load: 'hud-load', arm: 'hud-arm', handle: 'hud-handle', end: 'hud-end' } as const;

/** Rastro da carga projetado na tela (px do cliente), escrito pelo palco a cada quadro: a alça de carga arrasta por ele. */
export const hudTrail: { pts: [number, number][] } = { pts: [] };
