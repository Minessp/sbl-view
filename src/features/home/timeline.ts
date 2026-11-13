/**
 * Coreografia da página inicial. Pura e testada: a cena 3D e o DOM leem os mesmos números.
 *
 * Entrada (tempo, s): os ossos sobem do chão, as fibras crescem da origem à inserção e a pele chega por cima.
 * Scroll (0..1 do bloco do herói): as quatro camadas abrem lado a lado.
 */

export type LayerId = 'skin' | 'superficial' | 'deep' | 'bone';
export const LAYER_IDS: readonly LayerId[] = ['skin', 'superficial', 'deep', 'bone'];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Altura acima do topo da cabeça: corte "desligado". */
export const CUT_OFF = 9;
const FLOOR = -0.05;
const TOP = 1.92;

/** Duração total da entrada (s). Depois dela a lente fica disponível. */
export const INTRO_SECONDS = 3.1;

export interface IntroFrame {
  /** Altura (m) até onde o osso já apareceu (acima: nada). */
  boneCut: number;
  /** Parâmetro de crescimento das fibras (≥ 2 = inteiras; o shader soma até 0,45 de atraso por músculo). */
  grow: number;
  /** Alfa da pele, 0..1. */
  skin: number;
  /**
   * Opacidade das camadas sob a pele, 0..1. Some enquanto a pele fica opaca: partes que furam a pele (ventre do bíceps,
   * virilha) apareciam por cima dela até a vedação no fim da entrada.
   */
  under: number;
  /** Recuo extra da câmera (fator sobre a distância). */
  dolly: number;
  /** Giro extra da câmera (rad), que assenta em zero. */
  orbit: number;
  done: boolean;
}

/** Quadro da entrada para t segundos desde que o corpo ficou pronto. */
export function introFrame(t: number): IntroFrame {
  // Depois da entrada a vedação (lente) esconde o que está sob a pele; under = 1 deixa a abertura no scroll livre.
  if (t >= INTRO_SECONDS) return { boneCut: CUT_OFF, grow: 9, skin: 1, under: 1, dolly: 1, orbit: 0, done: true };
  const bone = easeOut(span(t, 0, 1.05));
  const g = span(t, 0.45, 2.35);
  const skin = smooth(span(t, 2.15, 3.05));
  const settle = easeOut(span(t, 0, INTRO_SECONDS));
  return {
    boneCut: bone >= 1 ? CUT_OFF : FLOOR + (TOP - FLOOR) * bone,
    grow: g >= 1 ? 9 : -0.05 + 1.55 * smooth(g),
    skin,
    under: 1 - smooth(span(t, 2.6, 3.05)),
    dolly: 1 + 0.08 * (1 - settle),
    orbit: 0.55 * (1 - settle),
    done: false,
  };
}

/** Janela do scroll em que as camadas abrem. */
export const EXPLODE_WINDOW = [0.1, 0.62] as const;

/** Abertura das camadas (0 = juntas, 1 = lado a lado) para o progresso do bloco do herói. */
export function explodeAt(p: number): number {
  return smooth(span(p, EXPLODE_WINDOW[0], EXPLODE_WINDOW[1]));
}

/** Ordem das camadas da esquerda para a direita quando abertas (múltiplos do espaçamento). */
export const EXPLODE_SLOT: Record<LayerId, number> = { skin: -1.5, superficial: -0.5, deep: 0.5, bone: 1.5 };
/** Espaçamento entre camadas abertas (m). */
export const EXPLODE_SPACING = 0.62;
/** Giro da câmera com as camadas abertas (rad): três quartos, para dar profundidade. */
export const EXPLODE_YAW = -0.42;

/** Profundidade da lente: até qual camada ela cava. */
export type LensDepth = 'superficial' | 'deep' | 'bone';
export const LENS_DEPTHS: readonly LensDepth[] = ['superficial', 'deep', 'bone'];

/**
 * Fração do raio da lente em que cada camada sai. A pele sai no raio inteiro; cada camada de baixo sai num raio menor,
 * e o buraco vira degraus (anéis) até a camada pedida, que fica inteira no centro.
 */
export function lensPeel(depth: LensDepth): Record<LayerId, number> {
  const deep = depth === 'deep' || depth === 'bone';
  return { skin: 1, superficial: deep ? 0.8 : 0, deep: depth === 'bone' ? 0.6 : 0, bone: 0 };
}

/** Raio da lente (px de CSS) pela largura da vista. */
export const lensRadius = (width: number) => Math.round(Math.min(150, Math.max(92, width * 0.09)));
