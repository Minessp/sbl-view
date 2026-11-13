/**
 * Player de exercício: vista 3D (o palco desenha no slot), reprodução, quadro a quadro, velocidade, câmeras, destaque de
 * músculo, vetor da carga e leitura do comprimento dos alvos. Nada aqui importa three.js.
 */
import { useEffect, useId, useMemo, useRef } from 'react';
import { LineChart, type LinePattern } from '@/charts/LineChart';
import { cycleLength, repAt } from '@/engine/motion/keys';
import type { CompiledClip } from '@/engine/motion/evaluate';
import { fmt, t } from '@/i18n/app';
import { useStage } from '@/scene/stageStore';
import { muscleById } from '../catalog';
import { lengthCurves, valueAt } from './lengths';
import { PLAYER_SPEEDS, PLAYER_VIEWS, usePlayer, type PlayerTargets } from './store';
import './player.css';

const PATTERNS: LinePattern[] = ['solid', 'dashed', 'dotted'];
const ORBIT_K = 0.0085;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Slot da vista: arrastar gira, roda aproxima, teclado gira/aproxima e espaço reproduz. */
function Slot({ label }: { label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const keys = useId();
  const ready = useStage((s) => s.ready);
  const last = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    useStage.getState().setScene('motion');
    usePlayer.getState().setSlot(ref.current);
    return () => {
      usePlayer.getState().setSlot(null);
      useStage.getState().setScene('none');
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      usePlayer.getState().zoomBy(Math.exp(Math.max(-60, Math.min(60, d)) * 0.0022));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const P = t.exercise.player;
  return (
    <div
      ref={ref}
      className="player__view viewport"
      role="application"
      aria-roledescription={P.roledesc}
      aria-label={label}
      aria-describedby={keys}
      tabIndex={0}
      data-ready={ready}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        const l = last.current;
        if (!l || l.id !== e.pointerId) return;
        usePlayer.getState().dragBy(-(e.clientX - l.x) * ORBIT_K, (e.clientY - l.y) * ORBIT_K * 0.75);
        last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (last.current?.id === e.pointerId) last.current = null;
      }}
      onPointerCancel={() => {
        last.current = null;
      }}
      onKeyDown={(e) => {
        const st = usePlayer.getState();
        let handled = true;
        switch (e.key) {
          case 'ArrowLeft':
            st.dragBy(0.18, 0);
            break;
          case 'ArrowRight':
            st.dragBy(-0.18, 0);
            break;
          case 'ArrowUp':
            st.dragBy(0, 0.1);
            break;
          case 'ArrowDown':
            st.dragBy(0, -0.1);
            break;
          case '+':
          case '=':
            st.zoomBy(0.85);
            break;
          case '-':
          case '_':
            st.zoomBy(1 / 0.85);
            break;
          case ' ':
          case 'Enter':
            st.setPlaying(!st.playing);
            break;
          case ',':
            st.step(-1);
            break;
          case '.':
            st.step(1);
            break;
          default:
            handled = false;
        }
        if (handled) e.preventDefault();
      }}
    >
      <p id={keys} className="visually-hidden">
        {P.keys}
      </p>
    </div>
  );
}

function Transport({ clip }: { clip: CompiledClip }) {
  const P = t.exercise.player;
  const id = useId();
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const T = cycleLength(clip.clip.tempo);
  const rep = repAt(clip.clip.tempo, time);
  const phase = rep.phase === 'hold' || rep.phase === 'rest' ? P.phase.pause : rep.concentric ? P.phase.concentric : P.phase.eccentric;
  return (
    <div className="demo__row player__transport">
      <button
        type="button"
        className="demo__play"
        aria-pressed={playing}
        aria-label={playing ? P.pause : P.play}
        onClick={() => usePlayer.getState().setPlaying(!playing)}
      >
        <Icon d={playing ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 2.5v11l9-5.5z'} />
      </button>
      <button type="button" className="player__step" aria-label={P.prev} onClick={() => usePlayer.getState().step(-1)}>
        <Icon d="M3 3h2v10H3zM13 3v10L6 8z" />
      </button>
      <button type="button" className="player__step" aria-label={P.next} onClick={() => usePlayer.getState().step(1)}>
        <Icon d="M11 3h2v10h-2zM3 3v10l7-5z" />
      </button>
      <div className="demo__scrub">
        <label htmlFor={id} className="demo__label">
          {P.time}
          <span className="demo__value">{`${fmt.n1(time % T)} s · ${phase}`}</span>
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={Math.round(T * 100) / 100}
          step={0.01}
          value={Math.round((time % T) * 100) / 100}
          aria-valuetext={`${fmt.n1(time % T)} de ${fmt.n1(T)} segundos, ${phase.toLowerCase()}`}
          onChange={(e) => {
            const st = usePlayer.getState();
            st.setPlaying(false);
            st.setTime(Number(e.target.value));
          }}
        />
      </div>
    </div>
  );
}

function Options() {
  const P = t.exercise.player;
  const speed = usePlayer((s) => s.speed);
  const view = usePlayer((s) => s.view);
  const showLoad = usePlayer((s) => s.showLoad);
  const skin = usePlayer((s) => s.skin);
  return (
    <div className="demo__row demo__row--opts player__opts">
      <span className="demo__speeds" role="group" aria-label={P.speed}>
        {PLAYER_SPEEDS.map((v) => (
          <button key={v} type="button" className="chip chip--small" aria-pressed={speed === v} onClick={() => usePlayer.getState().setSpeed(v)}>
            {`${String(v).replace('.', ',')}×`}
          </button>
        ))}
      </span>
      <span className="demo__speeds" role="group" aria-label={P.view}>
        {PLAYER_VIEWS.map((v) => (
          <button key={v} type="button" className="chip chip--small" aria-pressed={view === v} onClick={() => usePlayer.getState().setView(v)}>
            {P.views[v]}
          </button>
        ))}
      </span>
      <label className="toggle">
        <input type="checkbox" checked={showLoad} onChange={(e) => usePlayer.getState().setShowLoad(e.target.checked)} />
        <span className="toggle__track" aria-hidden="true" />
        {P.load}
      </label>
      <label className="toggle">
        <input type="checkbox" checked={skin} onChange={(e) => usePlayer.getState().setSkin(e.target.checked)} />
        <span className="toggle__track" aria-hidden="true" />
        {P.skin}
      </label>
    </div>
  );
}

function Focus({ targets }: { targets: PlayerTargets }) {
  const P = t.exercise.player;
  const isolate = usePlayer((s) => s.isolate);
  const all = [...targets.primary, ...targets.synergist];
  return (
    <div className="player__focus" role="group" aria-label={P.focus}>
      <span className="player__focus-label" aria-hidden="true">
        {P.focus}
      </span>
      <button type="button" className="chip chip--small" aria-pressed={isolate === null} onClick={() => usePlayer.getState().setIsolate(null)}>
        {P.focusAll}
      </button>
      {all.map((id) => (
        <button
          key={id}
          type="button"
          className="chip chip--small"
          data-role={targets.primary.includes(id) ? 'alvo' : 'sinergista'}
          aria-pressed={isolate === id}
          onClick={() => usePlayer.getState().setIsolate(isolate === id ? null : id)}
        >
          {muscleById(id)?.name ?? id}
        </button>
      ))}
    </div>
  );
}

/** Leitura ao vivo do comprimento (alvos) e gráfico da repetição inteira. */
function Lengths({ clip, targets }: { clip: CompiledClip; targets: PlayerTargets }) {
  const P = t.exercise.player;
  const E = t.atlas.ex;
  const curves = useMemo(() => lengthCurves(clip, targets.primary), [clip, targets]);
  const u = usePlayer((s) => repAt(clip.clip.tempo, s.time).u);
  if (!curves.series.length) return null;
  const series = curves.series.map((s, i) => ({
    id: s.id,
    label: muscleById(s.id)?.name ?? s.id,
    values: s.values,
    pattern: PATTERNS[i % PATTERNS.length] ?? 'solid',
  }));
  const describe =
    `${P.lengthTitle}: ` +
    series
      .map((s) => `${s.label} vai de ${fmt.n0(Math.round(s.values[0] ?? 0))} a ${fmt.n0(Math.round(s.values[s.values.length - 1] ?? 0))} por cento`)
      .join('; ');
  return (
    <div className="player__lengths">
      <ul className="demo__read" aria-live="off">
        {series.map((s) => {
          const r = Math.round(valueAt(curves.x, s.values, u));
          return (
            <li key={s.id} data-dir={r < 0 ? 'short' : r > 0 ? 'long' : 'rest'}>
              <span className="demo__part">{s.label}</span>
              <span className="demo__pct">{`${r > 0 ? '+' : r < 0 ? '−' : ''}${fmt.n0(Math.abs(r))}%`}</span>
              <span className="demo__dir">{r < 0 ? E.shorter : r > 0 ? E.longer : ''}</span>
            </li>
          );
        })}
      </ul>
      <LineChart
        title={P.lengthTitle}
        unit={P.lengthUnit}
        x={curves.x}
        series={series}
        marker={u}
        xLabels={P.ends}
        zeroLine
        reveal={false}
        yFormat={(v) => `${fmt.n0(Math.round(v) || 0)}%`}
        description={describe}
      />
    </div>
  );
}

export function Player({ name, clip, targets }: { name: string; clip: CompiledClip; targets: PlayerTargets }) {
  const P = t.exercise.player;
  useEffect(() => {
    usePlayer.getState().load(clip, targets);
    return () => usePlayer.getState().load(null, { primary: [], synergist: [] });
  }, [clip, targets]);
  return (
    <figure className="player">
      <Slot label={P.figure(name)} />
      <figcaption className="player__caption">
        <span>{P.hint}</span>
        <span className="demo__legend" aria-hidden="true">
          <span data-dir="short">{t.atlas.ex.legendShort}</span>
          <span data-dir="long">{t.atlas.ex.legendLong}</span>
        </span>
      </figcaption>
      <div className="demo player__controls" role="group" aria-label={P.controls}>
        <Transport clip={clip} />
        <Options />
        <Focus targets={targets} />
      </div>
      <Lengths clip={clip} targets={targets} />
      <p className="section__note">{P.clipNote}</p>
    </figure>
  );
}
