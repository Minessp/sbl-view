/**
 * Arara: o exercício em foco executa no palco, no centro; os vizinhos ficam em cartaz dos lados, menores, desfocados e
 * escurecidos. Arrastar (com inércia e encaixe), roda horizontal, setas e teclado trocam o foco; tocar num músculo do
 * corpo liga o filtro de músculo. Sem palco (sem WebGL, carregando), o cartaz do centro fica à vista.
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { animate, m, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { Link } from 'wouter';
import type { LibraryExercise } from '@/data/schema/exercise';
import { t } from '@/i18n/app';
import { useStage } from '@/scene/stageStore';
import { useTheme } from '@/ui/theme';
import { exerciseHref } from '@/app/routes';
import { muscleById, posterSrc } from './catalog';
import { EmphasisMark } from './EmphasisMark';
import { compiledClip } from './motion';
import { usePlayer } from './player/store';

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPRING = { type: 'spring', stiffness: 260, damping: 32 } as const;
/** Cartazes desenhados de cada lado do foco. */
const SPAN = 4;
const smooth = (a: number, b: number, v: number) => {
  const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function RackPoster({ e, i, pos, gap, live, light }: { e: LibraryExercise; i: number; pos: MotionValue<number>; gap: number; live: MotionValue<number>; light: boolean }) {
  const d = useTransform(pos, (p) => i - p);
  const x = useTransform(d, (v) => v * gap);
  const k = useTransform(d, (v) => Math.min(1, Math.abs(v)));
  const scale = useTransform(k, (v) => 1 - 0.2 * v);
  // Escuro: o vizinho apaga na penumbra. Claro: desbota (escurecer virava borrão preto no ciclorama).
  const filter = useTransform(k, (v) => `blur(${(6 * v).toFixed(2)}px) ${light ? `saturate(${(1 - 0.5 * v).toFixed(3)})` : `brightness(${(1 - 0.55 * v).toFixed(3)})`}`);
  // Com o corpo ao vivo, o cartaz some ao chegar no centro (o corpo toma o lugar dele).
  const opacity = useTransform([k, live], ([v = 0, l = 0]: number[]) => (l > 0.5 ? smooth(0.3, 0.85, v) : 1) * (light ? 1 - 0.45 * v : 1));
  return <m.img className="rack__poster" src={posterSrc(e.id)} alt="" width={640} height={800} decoding="async" draggable={false} style={{ x, scale, filter, opacity }} />;
}

export function Rack({ list, focus, onFocus, onMuscle }: { list: readonly LibraryExercise[]; focus: number; onFocus: (i: number) => void; onMuscle: (id: string) => void }) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(600);
  const gap = h * 0.92 * 0.8 * 0.95;
  const pos = useMotionValue(focus);
  const [near, setNear] = useState(focus);
  const ready = useStage((s) => s.ready);
  const light = useTheme((s) => s.resolved) === 'light';
  const live = useMotionValue(ready ? 1 : 0);
  const [hover, setHover] = useState<{ x: number; y: number; name: string } | null>(null);
  const L = t.library;
  const e = list[focus];

  useEffect(() => live.set(ready ? 1 : 0), [ready, live]);
  useEffect(() => pos.on('change', (p) => setNear(Math.round(p))), [pos]);

  // Foco novo (tecla, botão, filtro): a arara anda até ele com mola.
  useEffect(() => {
    if (reduce()) pos.set(focus);
    else void animate(pos, focus, SPRING);
  }, [focus, pos]);

  // Palco: o corpo executa o exercício em foco.
  useEffect(() => {
    const st = usePlayer.getState();
    const tel = st.telemetry;
    st.setTelemetry(false);
    st.setSlot(slot.current);
    useStage.getState().setScene('motion');
    return () => {
      usePlayer.getState().setSlot(null);
      usePlayer.getState().setTelemetry(tel);
      usePlayer.getState().load(null, { primary: [], synergist: [] });
      useStage.getState().setScene('none');
    };
  }, []);
  useEffect(() => {
    const clip = e ? compiledClip(e.id) : null;
    const targets = { primary: e?.targets.filter((x) => x.role === 'alvo').map((x) => x.muscle) ?? [], synergist: e?.targets.filter((x) => x.role === 'sinergista').map((x) => x.muscle) ?? [] };
    usePlayer.getState().load(clip, targets);
  }, [e]);

  // Fora da tela o corpo para (a parede rola sem o palco desenhando a repetição).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([en]) => usePlayer.getState().setPlaying(!!en?.isIntersecting && !reduce()));
    io.observe(el);
    const ro = new ResizeObserver(([en]) => en && setH(en.contentRect.height));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  const settle = (v = 0) => {
    const to = Math.min(list.length - 1, Math.max(0, Math.round(pos.get() + v * 0.22)));
    if (reduce()) pos.set(to);
    else void animate(pos, to, { ...SPRING, velocity: v });
    if (to !== focus) onFocus(to);
  };

  // Roda horizontal (trackpad): desliza; parada curta encaixa.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let timer = 0;
    const onWheel = (ev: WheelEvent) => {
      if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
      ev.preventDefault();
      pos.stop();
      pos.set(Math.min(list.length - 1, Math.max(0, pos.get() + ev.deltaX / gap)));
      clearTimeout(timer);
      timer = window.setTimeout(() => settleRef.current(), 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      clearTimeout(timer);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gap, list.length, pos]);
  const settleRef = useRef(settle);
  settleRef.current = settle;

  const pickAt = (cx: number, cy: number) => {
    const r = slot.current?.getBoundingClientRect();
    if (!r || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
    return usePlayer.getState().pick?.(cx - r.left, cy - r.top) ?? null;
  };

  const drag = useRef<{ id: number; x0: number; p0: number; moved: boolean; last: { x: number; t: number }[] } | null>(null);

  return (
    <section className="rack" aria-labelledby={`${uid}-name`}>
      <div
        ref={root}
        className="rack__stage"
        role="group"
        aria-roledescription={L.rackRole}
        aria-label={L.rack}
        aria-describedby={`${uid}-keys`}
        tabIndex={0}
        onKeyDown={(ev) => {
          setHover(null);
          const go = (i: number) => onFocus(Math.min(list.length - 1, Math.max(0, i)));
          if (ev.key === 'ArrowRight') go(focus + 1);
          else if (ev.key === 'ArrowLeft') go(focus - 1);
          else if (ev.key === 'Home') go(0);
          else if (ev.key === 'End') go(list.length - 1);
          else if (ev.key === 'Enter' && e) document.getElementById(`${uid}-open`)?.click();
          else return;
          ev.preventDefault();
        }}
        onPointerDown={(ev) => {
          if ((ev.pointerType === 'mouse' && ev.button !== 0) || (ev.target as HTMLElement).closest('a, button')) return;
          pos.stop();
          drag.current = { id: ev.pointerId, x0: ev.clientX, p0: pos.get(), moved: false, last: [{ x: ev.clientX, t: ev.timeStamp }] };
        }}
        onPointerMove={(ev) => {
          const d = drag.current;
          if (d?.id === ev.pointerId) {
            const dx = ev.clientX - d.x0;
            if (!d.moved && Math.abs(dx) > 6) {
              d.moved = true;
              ev.currentTarget.setPointerCapture(ev.pointerId);
              setHover(null);
            }
            if (d.moved) {
              // Além das pontas, resistência (elástico).
              const raw = d.p0 - dx / gap;
              const over = raw < 0 ? raw : raw > list.length - 1 ? raw - (list.length - 1) : 0;
              pos.set(raw - over * 0.7);
              d.last = [...d.last.slice(-4), { x: ev.clientX, t: ev.timeStamp }];
            }
            return;
          }
          if (ev.pointerType !== 'mouse') return;
          const id = pickAt(ev.clientX, ev.clientY);
          const r = root.current?.getBoundingClientRect();
          const name = id ? muscleById(id)?.name : undefined;
          setHover(name && r ? { x: ev.clientX - r.left, y: ev.clientY - r.top, name } : null);
        }}
        onPointerUp={(ev) => {
          const d = drag.current;
          if (d?.id !== ev.pointerId) return;
          drag.current = null;
          if (d.moved) {
            const a = d.last[0];
            const b = d.last[d.last.length - 1];
            const v = a && b && b.t > a.t ? (-(b.x - a.x) / gap / (b.t - a.t)) * 1000 : 0;
            settle(v);
            return;
          }
          const id = pickAt(ev.clientX, ev.clientY);
          if (id) onMuscle(id);
        }}
        onPointerCancel={() => {
          drag.current = null;
          settle();
        }}
        onPointerLeave={() => setHover(null)}
        style={{ '--pw': `${(h * 0.92 * 0.8).toFixed(0)}px` } as CSSProperties}
      >
        <div className="rack__rail" aria-hidden="true">
          {list.map((x, i) => (Math.abs(i - near) <= SPAN ? <RackPoster key={`${x.id}-${light}`} e={x} i={i} pos={pos} gap={gap} live={live} light={light} /> : null))}
        </div>
        <div ref={slot} className="rack__slot" data-ready={ready} />
        {hover && (
          <p className="rack__hover" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
            {hover.name}
            <span>{L.pickHint}</span>
          </p>
        )}
        <button type="button" className="rack__nav rack__nav--prev" aria-label={L.prev} disabled={focus <= 0} onClick={() => onFocus(focus - 1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" />
          </svg>
        </button>
        <button type="button" className="rack__nav rack__nav--next" aria-label={L.next} disabled={focus >= list.length - 1} onClick={() => onFocus(focus + 1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m6 3 5 5-5 5" />
          </svg>
        </button>
        <p id={`${uid}-keys`} className="visually-hidden">
          {L.rackKeys}
        </p>
      </div>

      {e && (
        <div className="rack__read" aria-live="polite">
          <p className="rack__count">
            {String(focus + 1).padStart(2, '0')} {L.of} {list.length}
          </p>
          <h2 id={`${uid}-name`} className="rack__name">
            {e.name}
          </h2>
          <p className="rack__line">
            <span>{t.patterns[e.pattern]}</span>
            <span>{e.equipment.map((q) => t.equipment[q]).join(', ')}</span>
            <span className="rack__len">
              <EmphasisMark emphasis={e.length.emphasis} />
              {t.emphasis[e.length.emphasis]}
            </span>
          </p>
          <div className="rack__targets" role="group" aria-label={L.byMuscle}>
            {e.targets
              .filter((x) => x.role === 'alvo')
              .map((x) => (
                <button key={x.muscle} type="button" className="chip chip--small" onClick={() => onMuscle(x.muscle)}>
                  {muscleById(x.muscle)?.name ?? x.muscle}
                </button>
              ))}
          </div>
          <Link id={`${uid}-open`} href={exerciseHref(e.id)} className="btn-primary rack__open">
            {L.open}
            <span className="visually-hidden"> {e.name}</span>
          </Link>
        </div>
      )}
    </section>
  );
}
