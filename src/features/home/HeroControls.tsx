/**
 * Ponteiro e teclado do herói: a lente segue o cursor, o músculo sob ela acende com o nome ao lado, clique (ou segundo
 * toque) voa até ele e abre no Atlas. Arrastar gira. Profundidade da lente em pílulas (e 1, 2, 3 no teclado).
 * Chunk à parte (nomes dos músculos e o estado do Atlas não entram na shell). Nada aqui importa three.js.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { describe } from '@/features/atlas/explorer/names';
import { useAtlas } from '@/features/atlas/store';
import { t } from '@/i18n';
import { useStage } from '@/scene/stageStore';
import { heroCamera, lens, samePick, useHome, type HomePick } from './store';
import { explodeAt, LENS_DEPTHS, lensRadius, type LensDepth } from './timeline';
import { lightTitle } from './titleLight';

const ORBIT_K = 0.0085;
const TAP_PX = 6;
/** Tempo do voo até a estrutura antes de a página trocar (ms). */
const FLIGHT_MS = 720;
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function HeroControls({ slot }: { slot: HTMLElement }) {
  // Título sob a luz do cursor.
  useEffect(() => {
    const h1 = document.getElementById('home-title');
    return h1 ? lightTitle(h1) : undefined;
  }, []);
  const [, navigate] = useLocation();
  const depth = useHome((s) => s.depth);
  const hover = useHome((s) => s.hover);
  const live = useHome((s) => s.live);
  const leaving = useHome((s) => s.leaving);
  const structures = useAtlas((s) => s.structures);
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);

  useEffect(() => setOverlay(document.getElementById('stage-overlay')), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    let raf = 0;
    const g = { id: -1, sx: 0, sy: 0, x: 0, y: 0, moved: false };
    /** Lente e rótulo no ponto (px da janela). */
    const place = (x: number, y: number) => {
      lens.x = x;
      lens.y = y;
      if (ring.current) ring.current.dataset.on = String(lens.on && explodeAt(useStage.getState().progress) < 0.02);
      const tr = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      if (ring.current) ring.current.style.transform = tr;
      if (tip.current) {
        tip.current.style.transform = tr;
        // Perto da borda direita o rótulo vai para a esquerda da lente (nome longo não sai da tela).
        tip.current.dataset.flip = String(x > window.innerWidth - 380);
      }
    };
    const pickAt = (x: number, y: number): HomePick | null => {
      const r = slot.getBoundingClientRect();
      return useHome.getState().pick?.(x - r.left, y - r.top) ?? null;
    };
    const hoverAt = (x: number, y: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => useHome.getState().setHover(pickAt(x, y)));
    };
    const go = (p: HomePick) => {
      const st = useHome.getState();
      if (st.leaving) return;
      st.leave(p);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => {
          const o = heroCamera.orbit;
          if (o) useAtlas.getState().setHandoff({ orbit: { yaw: o.yaw, pitch: o.pitch, dist: o.dist, target: [o.target[0], o.target[1], o.target[2]] }, selection: p });
          navigate(p.kind === 'muscle' ? `/atlas/${p.id}` : '/atlas');
        },
        reduce() ? 0 : FLIGHT_MS,
      );
    };
    const sizeRing = () => {
      const r = `${lensRadius(slot.getBoundingClientRect().width)}px`;
      ring.current?.style.setProperty('--r', r);
      tip.current?.style.setProperty('--r', r);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      slot.setPointerCapture(e.pointerId);
      Object.assign(g, { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false });
    };
    const move = (e: PointerEvent) => {
      if (g.id === e.pointerId) {
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > TAP_PX) {
          g.moved = true;
          slot.dataset.drag = 'true';
        }
        if (g.moved) useHome.getState().orbitBy(-(e.clientX - g.x) * ORBIT_K);
        g.x = e.clientX;
        g.y = e.clientY;
      }
      if (e.pointerType !== 'mouse') {
        if (g.moved) {
          lens.on = false;
          if (ring.current) ring.current.dataset.on = 'false';
          useHome.getState().setHover(null);
        }
        return;
      }
      sizeRing();
      lens.on = true;
      place(e.clientX, e.clientY);
      useHome.getState().kick();
      if (!g.moved) hoverAt(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (g.id !== e.pointerId) return;
      g.id = -1;
      if (slot.hasPointerCapture(e.pointerId)) slot.releasePointerCapture(e.pointerId);
      delete slot.dataset.drag;
      if (g.moved || !useHome.getState().live) return;
      const st = useHome.getState();
      if (e.pointerType === 'mouse') {
        const p = pickAt(e.clientX, e.clientY);
        if (p) go(p);
        return;
      }
      // Toque: o primeiro mostra a lente e o nome; o segundo no mesmo músculo abre.
      sizeRing();
      lens.on = true;
      place(e.clientX, e.clientY);
      st.kick();
      requestAnimationFrame(() => {
        const p = pickAt(e.clientX, e.clientY);
        if (p && samePick(p, useHome.getState().hover)) go(p);
        else useHome.getState().setHover(p);
      });
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || g.id !== -1) return;
      cancelAnimationFrame(raf);
      lens.on = false;
      if (ring.current) ring.current.dataset.on = 'false';
      useHome.getState().setHover(null);
      useHome.getState().kick();
    };
    // Teclado: a lente fica no centro da vista; Enter abre o que está sob ela.
    const center = () => {
      const r = slot.getBoundingClientRect();
      return { x: r.left + r.width * (r.width > r.height * 1.15 ? 0.66 : 0.5), y: r.top + r.height * 0.45 };
    };
    const focus = () => {
      if (!slot.matches(':focus-visible')) return;
      const c = center();
      sizeRing();
      lens.on = true;
      place(c.x, c.y);
      useHome.getState().kick();
      hoverAt(c.x, c.y);
    };
    const blur = () => {
      lens.on = false;
      if (ring.current) ring.current.dataset.on = 'false';
      useHome.getState().setHover(null);
      useHome.getState().kick();
    };
    const key = (e: KeyboardEvent) => {
      const st = useHome.getState();
      const c = center();
      let handled = true;
      if (e.key === 'ArrowLeft') st.orbitBy(0.18);
      else if (e.key === 'ArrowRight') st.orbitBy(-0.18);
      else if (e.key === 'Enter' || e.key === ' ') {
        const p = pickAt(c.x, c.y);
        if (p && st.live) go(p);
      } else if (e.key === '1' || e.key === '2' || e.key === '3') st.setDepth(LENS_DEPTHS[Number(e.key) - 1] ?? 'superficial');
      else if (e.key === 'Escape') st.setHover(null);
      else handled = false;
      if (!handled) return;
      e.preventDefault();
      sizeRing();
      lens.on = true;
      place(c.x, c.y);
      st.kick();
      // A cena precisa de um quadro com a vista nova antes de escolher.
      requestAnimationFrame(() => requestAnimationFrame(() => hoverAt(c.x, c.y)));
    };
    slot.addEventListener('pointerdown', down);
    slot.addEventListener('pointermove', move);
    slot.addEventListener('pointerup', up);
    slot.addEventListener('pointercancel', up);
    slot.addEventListener('pointerleave', leave);
    slot.addEventListener('focus', focus);
    slot.addEventListener('blur', blur);
    slot.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      lens.on = false;
      slot.removeEventListener('pointerdown', down);
      slot.removeEventListener('pointermove', move);
      slot.removeEventListener('pointerup', up);
      slot.removeEventListener('pointercancel', up);
      slot.removeEventListener('pointerleave', leave);
      slot.removeEventListener('focus', focus);
      slot.removeEventListener('blur', blur);
      slot.removeEventListener('keydown', key);
    };
  }, [slot, navigate]);

  useEffect(() => {
    slot.dataset.hover = String(hover !== null);
  }, [slot, hover]);

  // Profundidade nova: o que está sob a lente muda.
  useEffect(() => {
    if (!lens.on) return;
    const id = requestAnimationFrame(() => {
      const r = slot.getBoundingClientRect();
      useHome.getState().setHover(useHome.getState().pick?.(lens.x - r.left, lens.y - r.top) ?? null);
    });
    return () => cancelAnimationFrame(id);
  }, [depth, slot]);

  const focus = leaving ?? hover;
  const d = focus ? describe(focus, structures) : null;
  const label = d ? (focus?.kind === 'muscle' ? t.home.open(d.name) : d.name) : null;

  return (
    <>
      <div className="home-lens" role="group" aria-label={t.home.lens.label}>
        <span className="home-lens__label" aria-hidden="true">
          {t.home.lens.label}
        </span>
        {LENS_DEPTHS.map((v: LensDepth, i) => (
          <button key={v} type="button" className="home-lens__btn" aria-pressed={depth === v} onClick={() => useHome.getState().setDepth(v)}>
            <span className="home-lens__dot" data-depth={i} aria-hidden="true" />
            {t.home.lens[v]}
          </button>
        ))}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {label ?? ''}
      </p>
      {overlay &&
        createPortal(
          <>
            <span ref={ring} className="home-ring" data-live={live && !leaving} aria-hidden="true" />
            <span ref={tip} className="home-tip" data-on={label !== null} data-leaving={leaving !== null} aria-hidden="true">
              <span className="home-tip__label">{label}</span>
            </span>
          </>,
          overlay,
        )}
    </>
  );
}
