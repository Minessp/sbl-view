/**
 * Palco do exercício: o corpo executa em tela cheia (o palco desenha no slot) e a interface fica nas bordas: réguas de
 * comprimento dos alvos à esquerda, câmeras e chaves no alto, trilho da repetição embaixo, rótulos da telemetria presos
 * ao corpo. Nada aqui importa three.js.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LineChart, type LinePattern } from '@/charts/LineChart';
import { cycleLength, repAt, repLegs, timeAtU } from '@/engine/motion/keys';
import type { CompiledClip } from '@/engine/motion/evaluate';
import { mainJoint, pathsOf } from '@/features/lab/compare/analysis';
import { fmt, locale, t } from '@/i18n/app';
import { bindAnchor, HUD_TAGS, hudTrail } from '@/scene/annotations';
import { useStage } from '@/scene/stageStore';
import { LengthLegend } from '@/ui/LengthLegend';
import { muscleById } from '../catalog';
import { lengthCurves, valueAt } from './lengths';
import { PLAYER_SPEEDS, PLAYER_VIEWS, usePlayer, type PlayerTargets } from './store';
import './player.css';

const PATTERNS: LinePattern[] = ['solid', 'dashed', 'dotted'];
const ORBIT_K = 0.0085;
/** Desktop: corpo a 58% da largura, chão a ~82% da altura, ~70% da altura do quadro. */
const DESKTOP = '(min-width: 900px)';
const COMPOSE = { x: 0.08, y: 0, margin: 1.43 };

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
    // Palco pleno: a roda rola a página (a prancha passa por cima); Ctrl + roda (pinça do trackpad) aproxima.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
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

/** Trilho da repetição: excêntrica em azul, concêntrica em laranja, pausas marcadas, marcas a cada 0,25 s. */
function Timeline({ clip }: { clip: CompiledClip }) {
  const P = t.exercise.player;
  const id = useId();
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const speed = usePlayer((s) => s.speed);
  const tp = clip.clip.tempo;
  const T = cycleLength(tp);
  const now = time % T;
  const rep = repAt(tp, time);
  const phase = P.phase[rep.phase];
  return (
    <div className="player__timeline" role="group" aria-label={P.controls}>
      <button type="button" className="player__play" aria-pressed={playing} aria-label={playing ? P.pause : P.play} onClick={() => usePlayer.getState().setPlaying(!playing)}>
        <Icon d={playing ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 2.5v11l9-5.5z'} />
      </button>
      <div className="player__track">
        <div className="player__legs" aria-hidden="true" style={{ '--ticks': T / 0.25 } as CSSProperties}>
          {repLegs(tp).map((l) => (l.dur > 0 ? <span key={l.phase} data-phase={l.phase} style={{ flexGrow: l.dur }} /> : null))}
          <span className="player__cursor" style={{ '--p': now / T } as CSSProperties} />
        </div>
        <label htmlFor={id} className="visually-hidden">
          {P.time}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={Math.round(T * 100) / 100}
          step={0.01}
          value={Math.round(now * 100) / 100}
          aria-valuetext={t.sr.timeNow(fmt.n1(now), fmt.n1(T), phase.toLowerCase())}
          onChange={(e) => {
            const st = usePlayer.getState();
            st.setPlaying(false);
            st.setTime(Number(e.target.value));
          }}
        />
        <p className="player__read" aria-hidden="true">
          <span className="player__phase" data-phase={rep.phase}>
            {phase}
          </span>
          <span className="player__clock">{`${fmt.n1(now)} / ${fmt.n1(T)} s`}</span>
        </p>
      </div>
      <span className="player__steps">
        <button type="button" className="player__step" aria-label={P.prev} onClick={() => usePlayer.getState().step(-1)}>
          <Icon d="M3 3h2v10H3zM13 3v10L6 8z" />
        </button>
        <button type="button" className="player__step" aria-label={P.next} onClick={() => usePlayer.getState().step(1)}>
          <Icon d="M11 3h2v10h-2zM3 3v10l7-5z" />
        </button>
      </span>
      <span className="player__speeds" role="group" aria-label={P.speed}>
        {PLAYER_SPEEDS.map((v) => (
          <button key={v} type="button" className="chip chip--small" aria-pressed={speed === v} onClick={() => usePlayer.getState().setSpeed(v)}>
            {`${v.toLocaleString(locale)}×`}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Câmeras e chaves no alto do palco. */
function Top() {
  const P = t.exercise.player;
  const view = usePlayer((s) => s.view);
  const showLoad = usePlayer((s) => s.showLoad);
  const skin = usePlayer((s) => s.skin);
  const telemetry = usePlayer((s) => s.telemetry);
  const st = usePlayer.getState;
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true" />
      {label}
    </label>
  );
  return (
    <div className="player__top">
      <span className="player__cams" role="group" aria-label={P.view}>
        {PLAYER_VIEWS.map((v) => (
          <button key={v} type="button" className="chip chip--small" aria-pressed={view === v} onClick={() => st().setView(v)}>
            {P.views[v]}
          </button>
        ))}
      </span>
      <span className="player__keys">
        <XrayButton />
        {toggle(P.telemetry, telemetry, st().setTelemetry)}
        {toggle(P.load, showLoad, st().setShowLoad)}
        {toggle(P.skin, skin, st().setSkin)}
      </span>
    </div>
  );
}

/** Raio X ao segurar: botão (ponteiro, Enter ou espaço) e a tecla X em qualquer lugar da página. */
function XrayButton() {
  const P = t.exercise.player;
  const on = usePlayer((s) => s.xray);
  const set = (v: boolean) => usePlayer.getState().setXray(v);
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'x' || e.key === 'X') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e)) set(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'x' || e.key === 'X') set(false);
    };
    const off = () => set(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', off);
      set(false);
    };
  }, []);
  return (
    <button
      type="button"
      className="chip chip--small player__xray"
      aria-pressed={on}
      aria-keyshortcuts="X"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          set(true);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') set(false);
      }}
      onBlur={() => set(false)}
    >
      {P.xray}
    </button>
  );
}

/**
 * Alça de carga: anel no ponto da carga. Arrastar percorre a repetição pelo rastro (u = amostra mais perto do
 * ponteiro); setas andam um quadro, Home/End vão às pontas. O palco põe a posição (rótulo `hud-handle`).
 */
function ScrubHandle({ clip }: { clip: CompiledClip }) {
  const P = t.exercise.player;
  const ref = useRef<HTMLDivElement>(null);
  const tp = clip.clip.tempo;
  const u = usePlayer((s) => repAt(tp, s.time).u);
  const phase = usePlayer((s) => repAt(tp, s.time).phase);
  useEffect(() => {
    bindAnchor(HUD_TAGS.handle, ref.current, null);
    return () => bindAnchor(HUD_TAGS.handle, null, null);
  }, []);
  const goU = (u: number) => {
    const st = usePlayer.getState();
    const dir = repAt(tp, st.time).phase === 'eccentric' ? 'eccentric' : 'concentric';
    st.setPlaying(false);
    st.setTime(timeAtU(tp, u, dir));
  };
  const fromPointer = (x: number, y: number) => {
    const pts = hudTrail.pts;
    let best = -1;
    let bd = Infinity;
    pts.forEach(([px, py], i) => {
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0 && pts.length > 1) goU(best / (pts.length - 1));
  };
  const pct = Math.round(u * 100);
  return (
    <div
      ref={ref}
      className="player__handle"
      role="slider"
      tabIndex={0}
      aria-label={P.handle}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={t.sr.handleAt(fmt.n0(pct), P.phase[phase].toLowerCase())}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        const st = usePlayer.getState();
        const k = e.key;
        if (k === 'ArrowRight' || k === 'ArrowUp') st.step(1);
        else if (k === 'ArrowLeft' || k === 'ArrowDown') st.step(-1);
        else if (k === 'Home') goU(0);
        else if (k === 'End') goU(1);
        else return;
        e.preventDefault();
      }}
    />
  );
}

/** Rótulo das pontas da repetição (alongado / encurtado) no alvo principal; o palco só mostra perto de u = 0 e u = 1. */
function EndCallout({ clip, targets }: { clip: CompiledClip; targets: PlayerTargets }) {
  const P = t.exercise.player;
  const ref = useRef<HTMLDivElement>(null);
  const curves = useMemo(() => lengthCurves(clip, targets.primary.slice(0, 1)), [clip, targets]);
  const u = usePlayer((s) => repAt(clip.clip.tempo, s.time).u);
  useEffect(() => {
    bindAnchor(HUD_TAGS.end, ref.current, null);
    return () => bindAnchor(HUD_TAGS.end, null, null);
  }, []);
  const s = curves.series[0];
  const v = s ? Math.round(100 + valueAt(curves.x, s.values, u)) : null;
  const [host] = useState(() => (typeof document === 'undefined' ? null : document.getElementById('stage-overlay')));
  if (!host) return null;
  return createPortal(
    <div ref={ref} className="hud-tag hud-tag--end" data-end={u < 0.5 ? 'long' : 'short'} aria-hidden="true">
      <span className="hud-tag__label">{u < 0.5 ? P.ends[0] : P.ends[1]}</span>
      {v !== null && <span>{`${fmt.n0(v)}%`}</span>}
    </div>,
    host,
  );
}

/**
 * Uma régua vertical por alvo, zero no meio (em pé): laranja sobe = mais curto, azul desce = mais comprido. Passar
 * o ponteiro isola o músculo no corpo; clicar (ou Enter) deixa isolado.
 */
function LengthBars({ clip, targets }: { clip: CompiledClip; targets: PlayerTargets }) {
  const P = t.exercise.player;
  const curves = useMemo(() => lengthCurves(clip, targets.primary), [clip, targets]);
  const u = usePlayer((s) => repAt(clip.clip.tempo, s.time).u);
  const [locked, setLocked] = useState<string | null>(null);
  useEffect(() => setLocked(null), [clip]);
  if (!curves.series.length) return null;
  const full = Math.max(10, ...curves.series.flatMap((s) => s.values.map(Math.abs)));
  const isolate = (id: string | null) => usePlayer.getState().setIsolate(id);
  return (
    <div className="player__bars" role="group" aria-label={P.bars}>
      {curves.series.map((s) => {
        const r = valueAt(curves.x, s.values, u);
        const n = Math.round(r);
        const name = muscleById(s.id)?.name ?? s.id;
        return (
          <button
            key={s.id}
            type="button"
            className="player__bar"
            aria-label={name}
            aria-pressed={locked === s.id}
            data-dir={n < 0 ? 'short' : n > 0 ? 'long' : 'rest'}
            onPointerEnter={() => isolate(s.id)}
            onPointerLeave={() => isolate(locked)}
            onClick={() => {
              const next = locked === s.id ? null : s.id;
              setLocked(next);
              isolate(next);
            }}
          >
            <span className="player__rule" aria-hidden="true">
              <span className="player__fill" style={{ '--v': Math.max(-1, Math.min(1, -r / full)) } as CSSProperties} />
            </span>
            <span className="player__pct" aria-hidden="true">{`${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt.n0(Math.abs(n))}%`}</span>
            <span className="player__name" aria-hidden="true">
              {name}
            </span>
          </button>
        );
      })}
      <LengthLegend />
    </div>
  );
}

/** Rótulos da telemetria no overlay do palco: o palco posiciona e escreve o número. */
function HudTag({ id, label }: { id: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bindAnchor(id, ref.current, null);
    return () => bindAnchor(id, null, null);
  }, [id]);
  return (
    <div ref={ref} className="hud-tag" data-tag={id} aria-hidden="true">
      <span data-v="" />
      {label && <span className="hud-tag__label">{label}</span>}
    </div>
  );
}

function HudTags() {
  const P = t.exercise.player;
  const [host] = useState(() => (typeof document === 'undefined' ? null : document.getElementById('stage-overlay')));
  if (!host) return null;
  return createPortal(
    <>
      <HudTag id={HUD_TAGS.angle} />
      <HudTag id={HUD_TAGS.load} label={P.loadTag} />
      <HudTag id={HUD_TAGS.arm} label={P.armTag} />
    </>,
    host,
  );
}

/** Gráfico do comprimento dos alvos na repetição inteira, com o cursor no relógio do player. */
export function LengthChart({ clip, targets }: { clip: CompiledClip; targets: PlayerTargets }) {
  const P = t.exercise.player;
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
      .map((s) => t.sr.goes(s.label, fmt.n0(Math.round(s.values[0] ?? 0)), fmt.n0(Math.round(s.values[s.values.length - 1] ?? 0)), t.sr.pct))
      .join('; ');
  return (
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
  );
}

export function Player({ name, clip, targets, head }: { name: string; clip: CompiledClip; targets: PlayerTargets; head?: ReactNode }) {
  const P = t.exercise.player;
  const isolate = usePlayer((s) => s.isolate);
  useEffect(() => {
    usePlayer.getState().load(clip, targets);
    return () => usePlayer.getState().load(null, { primary: [], synergist: [] });
  }, [clip, targets]);

  // Articulação da telemetria: a do músculo isolado se ele tiver uma; senão a do primeiro alvo que tem.
  useEffect(() => {
    const own = isolate ? mainJoint(clip, isolate) : null;
    const first = targets.primary.map((m) => mainJoint(clip, m)).find((d) => d !== null) ?? null;
    const target = targets.primary.map((m) => pathsOf(m)[0]).find((p) => p !== undefined) ?? null;
    usePlayer.getState().setJoint({ dof: own ?? first, paths: own && isolate ? pathsOf(isolate) : [], target });
  }, [clip, targets, isolate]);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const apply = () => usePlayer.getState().setCompose(mq.matches ? COMPOSE : null);
    apply();
    mq.addEventListener('change', apply);
    return () => {
      mq.removeEventListener('change', apply);
      usePlayer.getState().setCompose(null);
    };
  }, []);

  return (
    <section className="player" aria-label={P.figure(name)}>
      <Slot label={P.figure(name)} />
      <div className="player__side">
        {head && <div className="player__head">{head}</div>}
        <LengthBars clip={clip} targets={targets} />
      </div>
      <Top />
      <Timeline clip={clip} />
      <ScrubHandle clip={clip} />
      <HudTags />
      <EndCallout clip={clip} targets={targets} />
    </section>
  );
}
