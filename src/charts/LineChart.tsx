/**
 * Gráfico de linha: grade discreta, variações por padrão de traço, curva "desenhada"
 * até o cursor (o resto fica em traço fino), faixa opcional de esforço na rampa de brilho.
 * SVG puro; d3 só para escala e caminho.
 */
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { useId, type ReactNode } from 'react';
import { at } from '@/engine/math/arr';
import './charts.css';

export type LinePattern = 'solid' | 'dashed' | 'dotted';

export interface ChartSeries {
  id: string;
  label: string;
  values: readonly number[];
  pattern: LinePattern;
}

interface Props {
  title: string;
  unit: string;
  x: readonly number[];
  series: readonly ChartSeries[];
  /** Posição do cursor no eixo x (mesma escala de `x`). */
  marker: number;
  yDomain?: readonly [number, number];
  yFormat?: (v: number) => string;
  /** Intensidade 0..1 ao longo de x, desenhada como faixa de coloração sob o gráfico. */
  band?: { label: string; values: readonly number[] };
  zeroLine?: boolean;
  xLabels: readonly [string, string];
  footer?: ReactNode;
  /** Descrição textual para leitor de tela. */
  description: string;
  /** Curva desenhada só até o cursor (Lab). false = curva inteira em tinta (Atlas). */
  reveal?: boolean;
}

const W = 300, H = 150;
const M = { l: 36, r: 12, t: 12, b: 26 };
const DASH: Record<LinePattern, string | undefined> = { solid: undefined, dashed: '6 4', dotted: '1.4 3.4' };

function interp(xs: readonly number[], ys: readonly number[], x: number): number {
  if (xs.length === 0) return 0;
  if (x <= at(xs, 0)) return at(ys, 0);
  for (let i = 1; i < xs.length; i++) {
    const x1 = at(xs, i);
    if (x <= x1) {
      const x0 = at(xs, i - 1);
      const f = (x - x0) / (x1 - x0 || 1);
      return at(ys, i - 1) + (at(ys, i) - at(ys, i - 1)) * f;
    }
  }
  return at(ys, ys.length - 1);
}

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step || 0); // || 0: sem "-0"
  return out;
}

export function LineChart({ title, unit, x, series, marker, yDomain, yFormat = (v) => String(Math.round(v)), band, zeroLine, xLabels, footer, description, reveal = true }: Props) {
  const uid = useId().replace(/:/g, '');
  const all = series.flatMap((s) => s.values);
  const lo = yDomain?.[0] ?? Math.min(0, ...all);
  const hiRaw = yDomain?.[1] ?? Math.max(...all);
  const hi = hiRaw === lo ? lo + 1 : hiRaw;
  const xs = scaleLinear().domain([0, 1]).range([M.l, W - M.r]);
  const ys = scaleLinear().domain([lo, hi]).nice(4).range([H - M.b, M.t]);
  const [d0, d1] = ys.domain() as [number, number];
  const ticks = niceTicks(d0, d1);
  const mk = xs(Math.min(1, Math.max(0, marker)));
  const path = (vals: readonly number[]) =>
    line<number>()
      .x((_, i) => xs(at(x, i)))
      .y((v) => ys(v))(vals as number[]) ?? '';

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <span className="chart__title">{title}</span>
        <span className="chart__unit">{unit}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label={description}>
        <defs>
          <clipPath id={`rev-${uid}`}>
            <rect x={0} y={0} width={mk} height={H} />
          </clipPath>
        </defs>
        {/* Milimetrado */}
        <g className="chart__grid">
          {Array.from({ length: 21 }, (_, i) => (
            <line key={`gx${i}`} x1={xs(i / 20)} x2={xs(i / 20)} y1={M.t} y2={H - M.b} data-major={i % 5 === 0} />
          ))}
          {niceTicks(d0, d1, 12).map((v) => (
            <line key={`gy${v}`} x1={M.l} x2={W - M.r} y1={ys(v)} y2={ys(v)} />
          ))}
        </g>
        {band && (
          <g className="chart__band" aria-hidden="true">
            {band.values.map((v, i) => {
              if (i === band.values.length - 1) return null;
              const xa = xs(at(x, i)), xb = xs(at(x, i + 1));
              return <rect key={i} x={xa} y={H - M.b - 6} width={xb - xa + 0.3} height={6} style={{ opacity: Math.min(1, Math.max(0, v)) }} />;
            })}
          </g>
        )}
        {zeroLine && d0 < 0 && d1 > 0 && <line className="chart__zero" x1={M.l} x2={W - M.r} y1={ys(0)} y2={ys(0)} />}
        <g className="chart__axis">
          {ticks.map((v) => (
            <text key={v} x={M.l - 5} y={ys(v) + 3} textAnchor="end">
              {yFormat(v)}
            </text>
          ))}
          <text x={M.l} y={H - 8}>
            {xLabels[0]}
          </text>
          <text x={W - M.r} y={H - 8} textAnchor="end">
            {xLabels[1]}
          </text>
        </g>
        {series.map((s) => (
          <path key={`f-${s.id}`} d={path(s.values)} className="chart__line chart__line--ghost" strokeDasharray={DASH[s.pattern]} />
        ))}
        <g clipPath={reveal ? `url(#rev-${uid})` : undefined}>
          {series.map((s) => (
            <path key={`s-${s.id}`} d={path(s.values)} className="chart__line" strokeDasharray={DASH[s.pattern]} strokeLinecap={s.pattern === 'dotted' ? 'round' : 'butt'} />
          ))}
        </g>
        <line className="chart__marker" x1={mk} x2={mk} y1={M.t - 4} y2={H - M.b} />
        {series.map((s, i) => {
          const v = interp(x, s.values, marker);
          return (
            <g key={`m-${s.id}`}>
              <circle cx={mk} cy={ys(v)} r={2.6} className="chart__dot" />
              {i === 0 && (
                <text x={mk + (mk > W * 0.72 ? -6 : 6)} y={ys(v) - 6} className="chart__value" textAnchor={mk > W * 0.72 ? 'end' : 'start'}>
                  {yFormat(v)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {footer && <div className="chart__foot">{footer}</div>}
    </figure>
  );
}
