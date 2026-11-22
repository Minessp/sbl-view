/**
 * Rótulos vivos do Atlas (puro): quais músculos ganham rótulo na vista atual, com histerese, e onde cada rótulo fica.
 * O palco mede a área visível de cada músculo num passe de seleção em grade; aqui só se escolhe e se arruma.
 * Arranjo de prancha: duas colunas, uma de cada lado do corpo, linha-guia até o ponto; numa coluna nada se sobrepõe.
 */

export interface LabelCandidate {
  readonly key: string;
  /** Área visível (células da grade de seleção). */
  readonly area: number;
  /** Ponto do músculo na tela (px do slot). */
  readonly x: number;
  readonly y: number;
}

export interface LabelPoint {
  readonly key: string;
  readonly x: number;
  readonly y: number;
}

export interface PlacedLabel {
  readonly key: string;
  readonly side: 'l' | 'r';
  /** Ponto do músculo (onde a linha-guia encosta). */
  readonly ax: number;
  readonly ay: number;
  /** Ponta do rótulo: na coluna da esquerda o texto termina aqui; na da direita começa. */
  readonly x: number;
  readonly y: number;
}

export const MAX_LABELS = 10;
/** Distância mínima entre dois rótulos da mesma coluna (px): a altura de uma linha de rótulo com folga. */
export const LABEL_GAP = 30;
/** Menor área que vale um rótulo (células): músculo que mal aparece não ganha nome. */
export const MIN_AREA = 3;
export const HOLD_MS = 300;

/** Área visível pesada pela centralidade: o que está no meio da vista pesa até o dobro do que está na borda. */
export function score(c: LabelCandidate, w: number, h: number): number {
  const d = Math.hypot((c.x - w / 2) / (w / 2), (c.y - h / 2) / (h / 2));
  return c.area * (1 - 0.5 * Math.min(1, d));
}

/** Os mais salientes, na ordem do peso. */
export function choose(cands: readonly LabelCandidate[], w: number, h: number, max = MAX_LABELS): string[] {
  return cands
    .filter((c) => c.area >= MIN_AREA)
    .map((c) => ({ key: c.key, s: score(c, w, h) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((c) => c.key);
}

export interface Hold {
  on: boolean;
  /** Desde quando o desejado difere do mostrado (ms), ou null. */
  since: number | null;
}

/**
 * Histerese: um rótulo entra ou sai só depois de o pedido durar `hold` ms (girar devagar não faz piscar). Sem nenhum
 * rótulo na tela, entra na hora. Devolve os rótulos mostrados, os desejados primeiro, até `max`.
 */
export function settle(mem: Map<string, Hold>, wanted: readonly string[], now: number, hold = HOLD_MS, max = MAX_LABELS): string[] {
  const empty = ![...mem.values()].some((e) => e.on);
  const want = new Set(wanted);
  for (const k of new Set([...mem.keys(), ...wanted])) {
    const e = mem.get(k) ?? { on: false, since: null };
    const w = want.has(k);
    if (e.on === w) e.since = null;
    else if (e.since === null) e.since = now;
    if (e.since !== null && (empty || now - e.since >= hold)) {
      e.on = w;
      e.since = null;
    }
    if (!e.on && e.since === null) mem.delete(k);
    else mem.set(k, e);
  }
  const on = (k: string) => mem.get(k)?.on === true;
  return [...wanted.filter(on), ...[...mem.keys()].filter((k) => on(k) && !want.has(k))].slice(0, max);
}

/**
 * Duas colunas encostadas no corpo (`body`: borda esquerda e direita na tela). Cada rótulo vai para o lado do seu ponto
 * e fica na altura dele, empurrado o mínimo para não encostar no vizinho. Coluna cheia: sai o de menor peso (a ordem
 * de `items` é a do peso).
 */
export interface LayoutBox {
  gap: number;
  /** Faixa livre na altura (px): acima e abaixo ficam cabeçalho e trilho. */
  top: number;
  bottom: number;
  /** Faixa livre para as pontas das colunas (px): fora dela ficam alavanca e cartão. */
  xMin: number;
  xMax: number;
}

export function layout(items: readonly LabelPoint[], body: { left: number; right: number }, w: number, h: number, box: Partial<LayoutBox> = {}): PlacedLabel[] {
  const { gap = LABEL_GAP, xMin = 16, xMax = w - 16 } = box;
  const mid = (body.left + body.right) / 2;
  const top = (box.top ?? 16) + gap / 2;
  const bottom = h - (box.bottom ?? 16) - gap / 2;
  const fit = Math.max(0, Math.floor((bottom - top) / gap) + 1);
  const out: PlacedLabel[] = [];
  for (const side of ['l', 'r'] as const) {
    const x = side === 'l' ? Math.min(Math.max(xMin, body.left - 28), xMax) : Math.max(Math.min(xMax, body.right + 28), xMin);
    const col = items.filter((p) => (p.x < mid) === (side === 'l')).slice(0, fit);
    col.sort((a, b) => a.y - b.y);
    const ys = col.map((p) => Math.min(bottom, Math.max(top, p.y)));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i] ?? 0, (ys[i - 1] ?? 0) + gap);
    const last = ys.length - 1;
    if (last >= 0 && (ys[last] ?? 0) > bottom) {
      ys[last] = bottom;
      for (let i = last - 1; i >= 0; i--) ys[i] = Math.min(ys[i] ?? 0, (ys[i + 1] ?? 0) - gap);
    }
    col.forEach((p, i) => out.push({ key: p.key, side, ax: p.x, ay: p.y, x, y: ys[i] ?? p.y }));
  }
  return out;
}
