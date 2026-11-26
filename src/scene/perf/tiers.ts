/**
 * Dosador de efeitos do pipeline de cinema (puro, testado). O efeito pesado liga onde a GPU aguenta; o aparelho fraco
 * recebe a versão leve. O governador de quadro (FrameGovernor) tira efeitos nesta ordem antes de baixar o DPR:
 * reflexo → profundidade de campo → oclusão → bloom (`SHED_ORDER`).
 */
import { gpuClass } from '../anatomy/lod';

export interface Effects {
  /** Pipeline HDR ligado (alvo em ponto flutuante + composição). Desligado: os materiais fazem o tom sozinhos. */
  readonly hdr: boolean;
  readonly bloom: boolean;
  /** Oclusão de ambiente em espaço de tela. */
  readonly ao: boolean;
  /** Profundidade de campo. */
  readonly dof: boolean;
  /** Sombra projetada da key no chão (mapa de profundidade). */
  readonly shadow: boolean;
  /** Reflexo planar do corpo no chão. */
  readonly reflect: boolean;
  /** Amostras de antisserrilhado do alvo HDR. */
  readonly msaa: number;
}

export interface EffectsInput {
  readonly renderer?: string | undefined;
  /** Ponteiro grosso (toque). */
  readonly coarse: boolean;
  /** Quantos efeitos o governador já tirou (0 = nenhum). */
  readonly shed?: number;
  /** Escolha do usuário: `off` desliga o pipeline, `low` só bloom. */
  readonly override?: 'off' | 'low' | 'high' | undefined;
}

export const SHED_ORDER = ['reflect', 'dof', 'ao', 'bloom'] as const;

const OFF: Effects = { hdr: false, bloom: false, ao: false, dof: false, shadow: false, reflect: false, msaa: 0 };

export function effectsFor(i: EffectsInput): Effects {
  if (i.override === 'off') return OFF;
  const gpu = gpuClass(i.renderer);
  if (gpu === 'software' && i.override !== 'high') return OFF;
  let fx: { -readonly [K in keyof Effects]: Effects[K] };
  if (i.override === 'low' || (i.coarse && i.override !== 'high')) fx = { hdr: true, bloom: true, ao: false, dof: false, shadow: true, reflect: false, msaa: 4 };
  else if (gpu === 'integrated') fx = { hdr: true, bloom: true, ao: true, dof: true, shadow: true, reflect: false, msaa: 4 };
  else fx = { hdr: true, bloom: true, ao: true, dof: true, shadow: true, reflect: true, msaa: 4 };
  const shed = Math.max(0, Math.min(SHED_ORDER.length, i.shed ?? 0));
  for (let k = 0; k < shed; k++) fx[SHED_ORDER[k] as (typeof SHED_ORDER)[number]] = false;
  return fx;
}
