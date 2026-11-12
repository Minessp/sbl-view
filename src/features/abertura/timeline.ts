/**
 * Coreografia da abertura em função do progresso do scroll (0..1). Pura e compartilhada:
 * a cena 3D e a régua do DOM leem os mesmos números.
 */

export type LayerId = 'skin' | 'superficial' | 'deep' | 'bone';

/** Altura acima do topo da cabeça: corte "desligado". */
export const CUT_OFF = 9;
const TOP = 1.8;
const FLOOR = -0.05;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/*
 * Alinhado à geometria do DOM (abertura.css): intro 100svh, quatro camadas de 150svh, fim 100svh.
 * Scroll útil = 700svh; o cartão de cada camada fica centrado em p ≈ 0,18 / 0,39 / 0,61 / 0,82.
 * Lê-se a camada intacta, e o corte acontece no trecho entre um cartão e o próximo.
 */

/** Janelas de corte por camada: [início, fim] do progresso. */
export const CUT_WINDOWS: Record<Exclude<LayerId, 'bone'>, readonly [number, number]> = {
  skin: [0.22, 0.33],
  superficial: [0.46, 0.56],
  deep: [0.68, 0.77],
};

/** Quando cada camada fica em evidência (texto + chamadas). */
export const LAYER_WINDOWS: Record<LayerId, readonly [number, number]> = {
  skin: [0.0, 0.22],
  superficial: [0.33, 0.46],
  deep: [0.56, 0.68],
  bone: [0.77, 1.01],
};

export function cutHeight(p: number, w: readonly [number, number]): number {
  if (p <= w[0]) return CUT_OFF;
  const u = smooth(clamp01((p - w[0]) / (w[1] - w[0])));
  return TOP + (FLOOR - TOP) * u;
}

export interface OpeningFrame {
  cuts: Record<Exclude<LayerId, 'bone'>, number>;
  /** Corte em andamento (m) ou null quando nenhum plano se move. */
  activeCut: number | null;
  /** Azimute da câmera (rad): 0 = frente, −π/2 = perfil direito. */
  azimuth: number;
  /** Camada em evidência e sua intensidade 0..1. */
  focus: { layer: LayerId; weight: number } | null;
}

export function windowWeight(p: number, w: readonly [number, number], fade = 0.03): number {
  const a = clamp01((p - w[0]) / fade);
  const b = clamp01((w[1] - p) / fade);
  return Math.min(a, b);
}

export function openingFrame(p: number): OpeningFrame {
  const cuts = {
    skin: cutHeight(p, CUT_WINDOWS.skin),
    superficial: cutHeight(p, CUT_WINDOWS.superficial),
    deep: cutHeight(p, CUT_WINDOWS.deep),
  };
  let activeCut: number | null = null;
  for (const id of ['skin', 'superficial', 'deep'] as const) {
    const w = CUT_WINDOWS[id];
    if (p > w[0] && p < w[1]) activeCut = cuts[id];
  }
  let focus: OpeningFrame['focus'] = null;
  for (const id of ['skin', 'superficial', 'deep', 'bone'] as const) {
    const weight = windowWeight(p, LAYER_WINDOWS[id]);
    if (weight > 0) focus = { layer: id, weight };
  }
  // Frente → três quartos → perfil (o plano sagital é onde o Lab trabalha).
  const azimuth = -(Math.PI / 2) * smooth(clamp01((p - 0.04) / 0.9));
  return { cuts, activeCut, azimuth, focus };
}
