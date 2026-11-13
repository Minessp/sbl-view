/**
 * Slot do explorador: o palco desenha aqui. Recebe o ponteiro (o canvas fixo não recebe): arrastar gira, dois dedos
 * ou botão direito arrastam a vista, roda e pinça aproximam, toque seleciona. Teclado: setas, Shift+setas, + e −,
 * Enter e Esc. Nada aqui importa three.js.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/i18n/app';
import { useStage } from '@/scene/stageStore';
import { samePick, useAtlas, type Pick } from '../store';
import { describe } from './names';

const ORBIT_K = 0.0085;
const PITCH_K = 0.0065;
const TAP_PX = 6;

interface Props {
  label: string;
  /** Toque numa estrutura. Padrão: seleciona e voa até ela. */
  onTap?: (p: Pick) => void;
  /** Texto do rótulo flutuante sobre a estrutura sob o ponteiro. */
  hoverText?: (name: string, p: Pick) => string | null;
  className?: string;
}

export function Viewport({ label, onTap, hoverText, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const keysId = useId();
  const setSlot = useAtlas((s) => s.setSlot);
  const setScene = useStage((s) => s.setScene);
  const ready = useStage((s) => s.ready);
  const hover = useAtlas((s) => s.hover);
  const selection = useAtlas((s) => s.selection);
  const structures = useAtlas((s) => s.structures);
  /** Ponteiro em coordenadas da janela (o rótulo vai por portal para a camada do palco, acima do canvas). */
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  /** Mira no centro enquanto o foco é de teclado (Enter seleciona o que está sob ela). */
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const overlay = typeof document === 'undefined' ? null : document.getElementById('stage-overlay');
  const aimAt = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setAim({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, sx: 0, sy: 0, pan: false, dist: 0, mx: 0, my: 0 });
  const raf = useRef(0);

  useEffect(() => {
    setScene('atlas');
    setSlot(ref.current);
    return () => {
      setSlot(null);
      setScene('none');
    };
  }, [setScene, setSlot]);

  const tap = (p: Pick) => (onTap ? onTap(p) : useAtlas.getState().select(p, { fly: true }));
  const pickAt = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return useAtlas.getState().pick?.(clientX - r.left, clientY - r.top) ?? null;
  };

  // Roda: precisa de ouvinte não passivo para não rolar a página.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      useAtlas.getState().zoomBy(Math.exp(Math.max(-60, Math.min(60, d)) * 0.0022));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const hoverName = hover ? describe(hover, structures)?.name : null;
  const text = hover && hoverName && !samePick(hover, selection) ? (hoverText ? hoverText(hoverName, hover) : t.atlas.ex.hover(hoverName)) : null;

  return (
    <div
      ref={ref}
      className={`explorer-view viewport ${className}`}
      role="application"
      aria-roledescription={t.atlas.ex.roledesc}
      aria-label={label}
      aria-describedby={keysId}
      tabIndex={0}
      data-ready={ready}
      data-hover={text !== null}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gesture.current;
        if (ptrs.current.size === 1) {
          g.moved = false;
          g.sx = e.clientX;
          g.sy = e.clientY;
          g.pan = e.button === 2 || e.shiftKey;
        } else if (ptrs.current.size === 2) {
          const [a, b] = [...ptrs.current.values()];
          if (a && b) {
            g.dist = Math.hypot(a.x - b.x, a.y - b.y);
            g.mx = (a.x + b.x) / 2;
            g.my = (a.y + b.y) / 2;
          }
          g.moved = true;
        }
        useAtlas.getState().setHover(null);
        setTip(null);
      }}
      onPointerMove={(e) => {
        const el = e.currentTarget;
        const prev = ptrs.current.get(e.pointerId);
        if (!prev) {
          if (e.pointerType !== 'mouse') return;
          const { clientX, clientY } = e;
          cancelAnimationFrame(raf.current);
          raf.current = requestAnimationFrame(() => {
            useAtlas.getState().setHover(pickAt(clientX, clientY));
            setTip({ x: clientX, y: clientY });
          });
          return;
        }
        ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const h = Math.max(1, el.clientHeight);
        const g = gesture.current;
        const st = useAtlas.getState();
        if (ptrs.current.size === 1) {
          if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > TAP_PX) g.moved = true;
          if (!g.moved) return;
          const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          if (g.pan) st.panBy(dx / h, dy / h);
          else st.orbitBy(-dx * ORBIT_K, dy * PITCH_K);
        } else if (ptrs.current.size === 2) {
          const [a, b] = [...ptrs.current.values()];
          if (!a || !b) return;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          if (g.dist > 0 && dist > 0) st.zoomBy(g.dist / dist);
          st.panBy((mx - g.mx) / h, (my - g.my) / h);
          g.dist = dist;
          g.mx = mx;
          g.my = my;
        }
      }}
      onPointerUp={(e) => {
        const was = ptrs.current.size;
        ptrs.current.delete(e.pointerId);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        const g = gesture.current;
        if (was === 1 && !g.moved && (e.pointerType !== 'mouse' || e.button === 0)) {
          const p = pickAt(e.clientX, e.clientY);
          if (p) tap(p);
        }
        if (ptrs.current.size === 1) {
          // Saiu um dedo da pinça: o que ficou continua girando sem salto.
          const [rest] = [...ptrs.current.values()];
          if (rest) {
            g.sx = rest.x;
            g.sy = rest.y;
          }
          g.pan = false;
        }
      }}
      onPointerCancel={(e) => {
        ptrs.current.delete(e.pointerId);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && ptrs.current.size === 0) {
          cancelAnimationFrame(raf.current);
          useAtlas.getState().setHover(null);
          setTip(null);
        }
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) aimAt(e.currentTarget);
      }}
      onBlur={() => setAim(null)}
      onKeyDown={(e) => {
        aimAt(e.currentTarget);
        const st = useAtlas.getState();
        const step = e.shiftKey ? 0.04 : 0.18;
        let handled = true;
        switch (e.key) {
          case 'ArrowLeft':
            if (e.shiftKey) st.panBy(-step, 0);
            else st.orbitBy(step, 0);
            break;
          case 'ArrowRight':
            if (e.shiftKey) st.panBy(step, 0);
            else st.orbitBy(-step, 0);
            break;
          case 'ArrowUp':
            if (e.shiftKey) st.panBy(0, -step);
            else st.orbitBy(0, step * 0.6);
            break;
          case 'ArrowDown':
            if (e.shiftKey) st.panBy(0, step);
            else st.orbitBy(0, -step * 0.6);
            break;
          case '+':
          case '=':
            st.zoomBy(0.85);
            break;
          case '-':
          case '_':
            st.zoomBy(1 / 0.85);
            break;
          case 'Enter':
          case ' ': {
            const r = e.currentTarget.getBoundingClientRect();
            const p = pickAt(r.left + r.width / 2, r.top + r.height / 2);
            if (p) tap(p);
            break;
          }
          case 'Escape':
            if (st.selection && !onTap) st.select(null);
            else handled = false;
            break;
          default:
            handled = false;
        }
        if (handled) e.preventDefault();
      }}
    >
      <p id={keysId} className="visually-hidden">
        {t.atlas.ex.keys}
      </p>
      {overlay &&
        createPortal(
          <>
            {text && tip && (
              <span className="explorer-tip" aria-hidden="true" style={{ transform: `translate(${tip.x.toFixed(0)}px, ${tip.y.toFixed(0)}px)` }}>
                <span className="explorer-tip__label">{text}</span>
              </span>
            )}
            {aim && <span className="explorer-aim" aria-hidden="true" style={{ transform: `translate(${aim.x.toFixed(0)}px, ${aim.y.toFixed(0)}px)` }} />}
          </>,
          overlay,
        )}
    </div>
  );
}
