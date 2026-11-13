/**
 * Régua da repetição: arrasta para mover corpo e gráficos juntos; reproduzir anima uma repetição a cada 2,4 s.
 * Fixa no rodapé (zona do polegar).
 */
import { useEffect, useId } from 'react';
import { depthAt } from '@/engine/exercises/squat';
import { fmt, t } from '@/i18n/app';
import { sampleAt } from './derive';
import type { VariantSeries } from './model';
import { useLab } from './store';

const PERIOD_S = 2.4;

export function Scrubber({ series }: { series: VariantSeries[] }) {
  const tt = useLab((s) => s.t);
  const playing = useLab((s) => s.playing);
  const setT = useLab((s) => s.setT);
  const setPlaying = useLab((s) => s.setPlaying);
  const id = useId();

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cur = useLab.getState().t;
      useLab.setState({ t: (cur + dt / PERIOD_S) % 1 });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const first = series[0];
  const knee = first ? sampleAt(first.frames, depthAt(tt)).knee : 0;
  const ticks = Array.from({ length: 41 }, (_, i) => i / 40);

  return (
    <div className="scrubber" role="group" aria-label={t.lab.scrub.label}>
      <button
        type="button"
        className="scrubber__play"
        aria-pressed={playing}
        aria-label={playing ? t.lab.scrub.pause : t.lab.scrub.play}
        onClick={() => setPlaying(!playing)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}
        </svg>
      </button>
      <div className="scrubber__track">
        <label htmlFor={id} className="visually-hidden">
          {t.lab.scrub.label}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(tt * 1000)}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value) / 1000);
          }}
          aria-valuetext={`${fmt.n0(knee)} graus de flexão de joelho, ${tt < 0.5 ? t.lab.readouts.phaseDown : t.lab.readouts.phaseUp}`}
        />
        <div className="scrubber__ruler" aria-hidden="true">
          {ticks.map((x) => (
            <span key={x} style={{ left: `${x * 100}%` }} data-major={Math.round(x * 40) % 10 === 0} />
          ))}
        </div>
        <div className="scrubber__labels" aria-hidden="true">
          <span>{t.lab.readouts.phaseDown}</span>
          <span>{t.lab.readouts.phaseBottom}</span>
          <span>{t.lab.readouts.phaseUp}</span>
        </div>
      </div>
      <output className="scrubber__out" htmlFor={id}>
        {fmt.n0(knee)}
        <span>°</span>
      </output>
    </div>
  );
}
