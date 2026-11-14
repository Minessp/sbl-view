/**
 * Níveis de detalhe do pacote anatômico e a escolha do nível pelo aparelho. Puro (sem DOM): quem chama lê o
 * navegador e a GPU e passa os números.
 *
 *   lo     ~155 mil triângulos, ~1 MB   celular, tela pequena, pouca memória, GPU por software
 *   mid    ~411 mil, ~2,2 MB            GPU integrada ou desconhecida
 *   hi     ~1,4 milhão, ~6,2 MB         GPU dedicada ou Apple M; pele densificada (aresta ≤ 5 mm), músculo original
 *   ultra  ~2,5 milhões, ~10,7 MB       GPU dedicada forte, memória ≥ 8 GB, tela grande; músculo e pele densificados
 *
 * Contagens do lado direito + linha média (o esquerdo é a cópia espelhada). Tamanho de cada nível conferido
 * em pack.test.ts. O primeiro quadro é sempre do `lo`; o nível escolhido entra depois, sem salto (ver useBody.ts).
 */
export const LODS = ['lo', 'mid', 'hi', 'ultra'] as const;
export type AnatomyLod = (typeof LODS)[number];

export const isLod = (x: unknown): x is AnatomyLod => typeof x === 'string' && (LODS as readonly string[]).includes(x);

export interface DeviceCaps {
  /** Ponteiro grosso (toque). */
  readonly coarse: boolean;
  /** Largura da janela (px CSS) e razão de pixels. */
  readonly width: number;
  readonly dpr: number;
  /** `navigator.deviceMemory` (GB, arredondado pelo navegador; ausente fora do Chromium). */
  readonly memory?: number;
  /** Renderizador da GPU (WEBGL_debug_renderer_info), se o navegador contar. */
  readonly renderer?: string;
  /** Nível escolhido pelo usuário (sobrepõe a escolha automática). */
  readonly override?: AnatomyLod;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
/** GPU dedicada (ou Apple M Pro/Max/Ultra): aguenta o nível ultra. */
const STRONG = /\b(rtx|gtx 1[06-9]\d0|quadro|radeon rx ?[5-9]\d{3}|radeon pro|arc a[57]\d0|apple m\d (pro|max|ultra))\b/i;
/** GPU dedicada de entrada ou Apple M base: nível hi. */
const DEDICATED = /\b(nvidia|geforce|radeon rx|radeon pro|arc a\d|apple m\d|apple gpu)\b/i;

/** Nível pelo aparelho: celular sempre leve; o resto pela GPU, memória e tela. */
export function chooseLod(c: DeviceCaps): AnatomyLod {
  if (c.override) return c.override;
  const mem = c.memory;
  if (c.coarse || c.width < 900 || (mem !== undefined && mem < 4)) return 'lo';
  const r = c.renderer ?? '';
  if (SOFTWARE.test(r)) return 'lo';
  if (STRONG.test(r)) return (mem === undefined || mem >= 8) && c.width * c.dpr >= 1600 ? 'ultra' : 'hi';
  if (DEDICATED.test(r)) return 'hi';
  return 'mid';
}

/**
 * LOD por distância: cada vista usa o nível alto (`full`) ou o leve do primeiro quadro (`base`) conforme a altura do
 * corpo na tela, em px físicos. Corpo pequeno (Comparar com três vistas, Lab, mapa de calor, vitrine da home) não mostra
 * a diferença e custava o triângulo inteiro do nível alto. Histerese para não trocar a cada quadro na borda.
 */
export type Detail = 'full' | 'base';
/** Abaixo de ~380 px físicos o triângulo do nível leve já tem 1–2 px; o player de uma vista só fica acima. */
export const DETAIL_PX = { down: 380, up: 460 } as const;

export function detailFor(prev: Detail, px: number): Detail {
  if (prev === 'full') return px < DETAIL_PX.down ? 'base' : 'full';
  return px > DETAIL_PX.up ? 'full' : 'base';
}

/**
 * Altura em px na tela de um objeto de altura `size` (m) a `dist` (m) da câmera. Perspectiva: `fovDeg` vertical.
 * Ortográfica: `orthoSpan` = altura do mundo que cabe na vista (top − bottom, já dividida pelo zoom).
 */
export function screenHeightPx(o: { viewportPx: number; size: number; dist: number; fovDeg?: number; orthoSpan?: number }): number {
  if (o.orthoSpan !== undefined) return o.orthoSpan > 0 ? (o.viewportPx * o.size) / o.orthoSpan : 0;
  const span = 2 * Math.max(o.dist, 1e-3) * Math.tan(((o.fovDeg ?? 28) * Math.PI) / 360);
  return (o.viewportPx * o.size) / span;
}
