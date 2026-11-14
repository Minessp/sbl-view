/**
 * Orçamento de quadro e DPR adaptativo. Puro (sem DOM, sem three): o palco passa o intervalo entre quadros seguidos e
 * aplica o DPR que sair daqui.
 *
 * Regra: janela de amostras (só quadros seguidos, a cena animando), fechada por número (`window`) ou por tempo
 * (`windowMs`, com ao menos `minSamples`: aparelho fraco faz 2 quadros/s e não pode esperar 60). Se o p75 da janela
 * passa do orçamento, o DPR baixa um passo e esse nível vira teto provisório. Se a janela seguinte não melhorou ao menos
 * `gain` (o gargalo é a CPU, não o preenchimento), volta ao nível anterior e ele vira piso provisório: borrar a imagem
 * sem ganhar quadro não serve; o piso vale a sessão (cada troca realoca o buffer do canvas, ~300 ms num aparelho com
 * GPU por software). Se o p75 fica folgado por `upAfterMs`, sobe um passo, nunca acima do teto aprendido, que vale
 * `retryMs`. Assim não oscila entre dois níveis.
 */
export interface GovernorOptions {
  /** DPR mínimo e máximo (o máximo é o da tela, limitado no celular). */
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Orçamento do quadro (ms). Acima disso no p75, baixa. */
  readonly budgetMs: number;
  /** Folga para subir (ms): p75 abaixo disso por `upAfterMs`. */
  readonly relaxedMs: number;
  /** Janela: até `window` amostras, ou `windowMs` com ao menos `minSamples`. */
  readonly window: number;
  readonly windowMs: number;
  readonly minSamples: number;
  /** Intervalo maior que isso não conta (aba escondida, depurador parado). */
  readonly gapMs: number;
  /** Tempo de folga contínua antes de subir, e espera depois de uma troca. */
  readonly upAfterMs: number;
  readonly settleMs: number;
  /** Melhora mínima do p75 (fração) para uma descida valer. */
  readonly gain: number;
  /** Quanto tempo um teto aprendido vale. */
  readonly retryMs: number;
}

export const GOVERNOR_DEFAULTS: Omit<GovernorOptions, 'min' | 'max'> = {
  step: 0.25,
  budgetMs: 22,
  relaxedMs: 17.5,
  window: 60,
  windowMs: 1000,
  minSamples: 6,
  gapMs: 1000,
  upAfterMs: 3000,
  settleMs: 500,
  gain: 0.1,
  retryMs: 30_000,
};

export interface Governor {
  /** Registra o intervalo (ms) entre dois quadros seguidos no instante `now` (ms). Devolve o novo DPR se mudou. */
  sample(intervalMs: number, now: number): number | null;
  readonly dpr: number;
  /** p75 da última janela fechada (ms), para medir e mostrar. */
  readonly p75: number;
}

const quantile = (xs: readonly number[], q: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

const snap = (v: number, o: Pick<GovernorOptions, 'min' | 'max'>) => Math.round(Math.min(o.max, Math.max(o.min, v)) * 100) / 100;

export function createGovernor(opts: Partial<GovernorOptions> & Pick<GovernorOptions, 'min' | 'max'>, start = opts.max): Governor {
  const o: GovernorOptions = { ...GOVERNOR_DEFAULTS, ...opts };
  let dpr = snap(start, o);
  let samples: number[] = [];
  let firstAt = 0;
  let p75 = 0;
  let changedAt = -Infinity;
  let relaxedSince: number | null = null;
  let ceiling: { dpr: number; at: number } | null = null;
  /** Piso aprendido: abaixo dele o quadro não melhora (gargalo fora do preenchimento). Vale a sessão. */
  let floor: number | null = null;
  /** Última descida, para conferir se rendeu. */
  let drop: { from: number; p: number } | null = null;

  const change = (next: number, now: number) => {
    dpr = next;
    changedAt = now;
    samples = [];
    relaxedSince = null;
    return dpr;
  };

  return {
    get dpr() {
      return dpr;
    },
    get p75() {
      return p75;
    },
    sample(ms, now) {
      if (!(ms > 0) || ms > o.gapMs) {
        relaxedSince = null;
        return null;
      }
      if (now - changedAt < o.settleMs) return null;
      if (samples.length === 0) firstAt = now;
      samples.push(ms);
      const full = samples.length >= o.window || (samples.length >= o.minSamples && now - firstAt >= o.windowMs);
      if (!full) return null;
      const p = quantile(samples, 0.75);
      p75 = p;
      // Janela fechada: a próxima começa limpa (decisões pelo estado recente).
      samples = [];
      if (ceiling && now - ceiling.at > o.retryMs) ceiling = null;

      if (drop) {
        const d = drop;
        drop = null;
        if (p > d.p * (1 - o.gain)) {
          floor = d.from;
          return change(d.from, now);
        }
      }
      const lowest = Math.max(o.min, floor ?? o.min);
      if (p > o.budgetMs && dpr > lowest) {
        ceiling = { dpr, at: now };
        drop = { from: dpr, p };
        return change(snap(dpr - o.step, o), now);
      }
      if (p < o.relaxedMs && dpr < o.max) {
        relaxedSince ??= now;
        const next = snap(dpr + o.step, o);
        if (now - relaxedSince >= o.upAfterMs && (!ceiling || next < ceiling.dpr)) return change(next, now);
      } else relaxedSince = null;
      return null;
    },
  };
}
