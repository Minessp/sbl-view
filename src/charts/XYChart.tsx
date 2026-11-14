/**
 * Gráfico de pontos ligados com x próprio por série (carga × comprimento: cada exercício cobre a sua faixa de
 * comprimento). Mesmo desenho do LineChart: grade discreta, séries por padrão de traço, ponto do cursor em cada uma.
 * SVG puro; d3 só para escala e caminho.
 */
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { at } from '@/engine/math/arr';
import type { LinePattern } from './LineChart';
import './charts.css';

export interface XYSeries {
  id: string;
  label: string;
  x: readonly number[];
  y: readonly number[];
  pattern: LinePattern;
}

interface Props {
  title: string;
  unit: string;
  series: readonly XYSeries[];
  /** Posição do cursor ao longo de cada série (0..1, mesma amostragem de todas). */
  marker: number;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  xTitle: string;
  yDomain?: readonly [number, number];
  zeroLine?: boolean;
  description: string;
}

const W = 300, H = 160;
const M = { l: 36, r: 12, t: 12, b: 34 };
const DASH: Record<LinePattern, string | undefined> = { solid: undefined, dashed: '6 4', dotted: '1.4 3.4' };

function sampleAt(v: readonly number[], f: number): number {
  const n = v.length - 1;
  const x = Math.min(n, Math.max(0, f * n));
  const i = Math.min(n - 1, Math.floor(x));
  const a = at(v, i), b = at(v, Math.min(n, i + 1));
  return a + (b - a) * (x - i);
}

export function XYChart({ title, unit, series, marker, xFormat = (v) => String(Math.round(v)), yFormat = (v) => String(Math.round(v)), xTitle, yDomain, zeroLine, description }: Props) {
  const xsAll = series.flatMap((s) => s.x);
  const ysAll = series.flatMap((s) => s.y);
  const xs = scaleLinear()
    .domain([Math.min(...xsAll), Math.max(...xsAll, Math.min(...xsAll) + 1)])
    .nice(5)
    .range([M.l, W - M.r]);
  const ys = scaleLinear()
    .domain(yDomain ?? [Math.min(0, ...ysAll), Math.max(...ysAll, 1e-6)])
    .nice(4)
    .range([H - M.b, M.t]);
  const [y0, y1] = ys.domain() as [number, number];
  const path = (s: XYSeries) =>
    line<number>()
      .x((_, i) => xs(at(s.x, i)))
      .y((v) => ys(v))(s.y as number[]) ?? '';

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <span className="chart__title">{title}</span>
        <span className="chart__unit">{unit}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label={description}>
        <g className="chart__grid">
          {xs.ticks(10).map((v) => (
            <line key={`gx${v}`} x1={xs(v)} x2={xs(v)} y1={M.t} y2={H - M.b} />
          ))}
          {ys.ticks(8).map((v) => (
            <line key={`gy${v}`} x1={M.l} x2={W - M.r} y1={ys(v)} y2={ys(v)} />
          ))}
        </g>
        {zeroLine && y0 < 0 && y1 > 0 && <line className="chart__zero" x1={M.l} x2={W - M.r} y1={ys(0)} y2={ys(0)} />}
        <g className="chart__axis">
          {ys.ticks(4).map((v) => (
            <text key={v} x={M.l - 5} y={ys(v) + 3} textAnchor="end">
              {yFormat(v)}
            </text>
          ))}
          {xs.ticks(5).map((v) => (
            <text key={v} x={xs(v)} y={H - M.b + 12} textAnchor="middle">
              {xFormat(v)}
            </text>
          ))}
          <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle">
            {xTitle}
          </text>
        </g>
        {series.map((s) => (
          <path key={`s-${s.id}`} d={path(s)} className="chart__line" strokeDasharray={DASH[s.pattern]} strokeLinecap={s.pattern === 'dotted' ? 'round' : 'butt'} />
        ))}
        {series.map((s) => {
          const x = sampleAt(s.x, marker), y = sampleAt(s.y, marker);
          return (
            <g key={`m-${s.id}`}>
              {/* Ponta alongada (u = 0) marcada com anel: dá o sentido da repetição. */}
              <circle cx={xs(at(s.x, 0))} cy={ys(at(s.y, 0))} r={3.2} className="chart__start" />
              <circle cx={xs(x)} cy={ys(y)} r={2.8} className="chart__dot" />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
