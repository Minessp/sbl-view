/**
 * Demonstração de ação no corpo: botão por curva, controles (reproduzir, velocidade, repetir, ângulo) e leitura ao vivo.
 * A cena move o esqueleto e avança a fase; aqui só se lê e escreve no store.
 */
import { useId } from 'react';
import { fmt, t } from '@/i18n/app';
import type { ActionCurve } from '../model';
import { DEMO_SPEEDS, useAtlas } from '../store';
import { demoAngle, demoPhaseOf, demoStage } from './demo';
import { LengthLegend } from '@/ui/LengthLegend';

/** Fração do eixo x do gráfico onde está o ângulo da demonstração (ou a posição em pé, se ela não toca esta curva). */
export function useDemoMarker(c: ActionCurve): number {
  return useAtlas((s) => {
    const spec = s.demo.spec;
    if (spec?.key !== c.key) return c.neutralAt;
    return (demoAngle(spec.from, spec.to, s.demo.phase) - c.range[0]) / (c.range[1] - c.range[0]);
  });
}

export const useDemoActive = (c: ActionCurve) => useAtlas((s) => s.demo.spec?.key === c.key);

function interp(x: readonly number[], y: readonly number[], f: number): number {
  const n = x.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(f * (n - 1))));
  const a = x[i] ?? 0, b = x[i + 1] ?? 1;
  const u = Math.min(1, Math.max(0, (f - a) / (b - a || 1)));
  return (y[i] ?? 0) + ((y[i + 1] ?? 0) - (y[i] ?? 0)) * u;
}

/** Liga a demonstração desta curva (ou desliga, se já é ela). */
export function DemoButton({ c, className = 'chip chip--small' }: { c: ActionCurve; className?: string }) {
  const active = useDemoActive(c);
  return (
    <button
      type="button"
      className={className}
      aria-pressed={active}
      onClick={() => {
        const st = useAtlas.getState();
        if (active) st.stopDemo();
        else st.startDemo({ dof: c.dof, range: c.range, from: c.from, to: c.to, base: c.base, plane: c.movement.plane, key: c.key });
      }}
    >
      <svg className="demo-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 2.5v11l9-5.5z" />
      </svg>
      {c.movement.label}
    </button>
  );
}

/** Controles e leitura da curva que está tocando. */
export function DemoControls({ c }: { c: ActionCurve }) {
  const E = t.atlas.ex;
  const id = useId();
  const playing = useAtlas((s) => s.demo.playing);
  const speed = useAtlas((s) => s.demo.speed);
  const loop = useAtlas((s) => s.demo.loop);
  const phase = useAtlas((s) => s.demo.phase);
  const setDemo = useAtlas((s) => s.setDemo);
  const deg = demoAngle(c.from, c.to, phase);
  const stage = demoStage(phase);
  const f = (deg - c.range[0]) / (c.range[1] - c.range[0]);
  return (
    <div className="demo" role="group" aria-label={`${E.demo}: ${c.movement.label}`}>
      <div className="demo__row">
        <button
          type="button"
          className="demo__play"
          aria-pressed={playing}
          aria-label={playing ? E.pause : E.play}
          onClick={() => setDemo({ playing: !playing })}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}
          </svg>
        </button>
        <div className="demo__scrub">
          <label htmlFor={id} className="demo__label">
            {E.angle}
            <span className="demo__value">{`${fmt.n0(Math.round(deg))}°`}</span>
            <span className="demo__stage" data-stage={stage}>
              {stage === 'shortening' ? E.stageShorten : E.stageLengthen}
            </span>
          </label>
          <input
            id={id}
            type="range"
            min={c.range[0]}
            max={c.range[1]}
            step={1}
            value={Math.round(deg)}
            aria-valuetext={t.sr.angleNow(c.axisLabel, fmt.n0(Math.round(deg)))}
            onChange={(e) => setDemo({ playing: false, phase: demoPhaseOf(c.from, c.to, Number(e.target.value)) })}
          />
        </div>
        <button type="button" className="demo__stop chip chip--small" onClick={() => useAtlas.getState().stopDemo()}>
          {E.stop}
        </button>
      </div>
      <div className="demo__row demo__row--opts">
        <span className="demo__speeds" role="group" aria-label={E.speed}>
          {DEMO_SPEEDS.map((v) => (
            <button key={v} type="button" className="chip chip--small" aria-pressed={speed === v} onClick={() => setDemo({ speed: v })}>
              {`${fmt.n1(v).replace(/,0$/, '')}×`}
            </button>
          ))}
        </span>
        <label className="toggle">
          <input type="checkbox" checked={loop} onChange={(e) => setDemo({ loop: e.target.checked })} />
          <span className="toggle__track" aria-hidden="true" />
          {E.loop}
        </label>
      </div>
      <ul className="demo__read" aria-live="off">
        {c.series.map((s) => {
          const v = interp(c.x, s.length, f) * 100;
          const r = Math.round(v);
          return (
            <li key={s.partId} data-dir={r < 0 ? 'short' : r > 0 ? 'long' : 'rest'}>
              <span className="demo__part">{c.series.length > 1 ? s.label : E.lengthNow}</span>
              <span className="demo__pct">{`${r > 0 ? '+' : r < 0 ? '−' : ''}${fmt.n0(Math.abs(r))}%`}</span>
              <span className="demo__dir">{r < 0 ? E.shorter : r > 0 ? E.longer : ''}</span>
            </li>
          );
        })}
      </ul>
      <LengthLegend />
    </div>
  );
}
