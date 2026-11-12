/**
 * Chamadas de prancha (linha de chamada + número + nome) ligadas a pontos 3D.
 * O DOM registra os elementos; o palco projeta e escreve as posições a cada quadro.
 * Sem three.js aqui: a shell pode importar.
 */
import type { Vec3 } from '@/engine/math/vec';

export interface Anchor {
  id: string;
  /** Ponto no mundo (m). Escrito pelo palco. */
  world: Vec3 | null;
  /** Peso de visibilidade 0..1, calculado pelo dono do elemento a partir do progresso. */
  weight: number;
  el: HTMLElement | null;
  line: SVGLineElement | null;
}

export const anchors = new Map<string, Anchor>();

function ensure(id: string): Anchor {
  let a = anchors.get(id);
  if (!a) {
    a = { id, world: null, weight: 0, el: null, line: null };
    anchors.set(id, a);
  }
  return a;
}

export function bindAnchor(id: string, el: HTMLElement | null, line: SVGLineElement | null) {
  const a = ensure(id);
  a.el = el;
  a.line = line;
}

export const setAnchorWorld = (id: string, world: Vec3) => {
  ensure(id).world = world;
};

export const setAnchorWeight = (id: string, w: number) => {
  ensure(id).weight = w;
};
