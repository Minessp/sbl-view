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
  // Frente → três quartos → perfil (o plano sagital é onde o Lab trabalha); no fim, uma volta inteira com as camadas abertas.
  const azimuth = -(Math.PI / 2) * smooth(clamp01((p - 0.04) / 0.76)) - 2 * Math.PI * smooth(clamp01((p - EXPLODE_WINDOW[0]) / (1 - EXPLODE_WINDOW[0])));
  return { cuts, activeCut, azimuth, focus };
}

/** Fim da página: as camadas se reconstroem e abrem lado a lado. */
export const EXPLODE_WINDOW = [0.84, 0.94] as const;

/** Abertura das camadas no fim (0 = juntas, 1 = lado a lado). */
export function finaleExplode(p: number): number {
  return smooth(clamp01((p - EXPLODE_WINDOW[0]) / (EXPLODE_WINDOW[1] - EXPLODE_WINDOW[0])));
}

/** Ordem das camadas da esquerda para a direita quando abertas (múltiplos do espaçamento). */
export const EXPLODE_SLOT: Record<LayerId, number> = { skin: -1.5, superficial: -0.5, deep: 0.5, bone: 1.5 };
/** Espaçamento entre camadas abertas (m). */
export const EXPLODE_SPACING = 0.62;

/** Duração da montagem de entrada (s): as camadas chegam separadas e girando e se juntam. */
export const ASSEMBLE_SECONDS = 2.6;

/** Montagem de entrada: abertura das camadas e giro próprio de cada uma (rad), para t = 0..1 do tempo. */
export function assembleFrame(t: number): { explode: number; spin: number; orbit: number } {
  const u = 1 - (1 - clamp01(t)) ** 4;
  return { explode: 1 - u, spin: (1 - u) * Math.PI * 0.9, orbit: (1 - u) * 0.7 };
}

/** Duração da entrada (s): o corpo é "entintado" dos pés à cabeça antes do primeiro scroll. */
export const INTRO_SECONDS = 1.8;

/**
 * Entrada: altura (m) do plano que sobe do chão ao topo; acima dele tudo é fantasma.
 * t = 0..1 do tempo da entrada; em t ≥ 1 devolve CUT_OFF (sem efeito).
 */
export function introCut(t: number): number {
  if (t >= 1) return CUT_OFF;
  const u = 1 - (1 - clamp01(t)) ** 3;
  return FLOOR + (TOP + 0.12 - FLOOR) * u;
}

/** Recuo extra da câmera durante a entrada (fator sobre a distância). */
export function introDolly(t: number): number {
  const u = 1 - (1 - clamp01(t)) ** 3;
  return 1 + 0.07 * (1 - u);
}
