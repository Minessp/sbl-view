/**
 * Alavanca de descascar: quatro batentes (pele, superficial, profundo, osso). Arrastar tira as camadas de cima para
 * baixo; entre dois batentes a camada de cima vira vulto acima de uma frente acesa que desce pelo corpo (o palco lê
 * `peel`). Teclado: setas andam um décimo, Page Up/Down pulam de camada, Home e End vão às pontas.
 */
import { animate } from 'motion/react';
import { useId, useRef, type CSSProperties } from 'react';
import { t } from '@/i18n/app';
import { LAYER_ORDER, PEEL_MAX, useAtlas } from '../store';

const E = () => t.atlas.ex;
const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function valueText(p: number): string {
  const i = Math.floor(p + 1e-6);
  const f = p - i;
  const name = (k: number) => E().peelStop[LAYER_ORDER[Math.min(PEEL_MAX, k)] ?? 'bone'];
  return f < 0.005 ? name(i) : E().peelBetween(name(i), name(i + 1), Math.round(f * 100));
}

export function LayerPeel() {
  const peel = useAtlas((s) => s.peel);
  const track = useRef<HTMLDivElement>(null);
  const tween = useRef<{ stop: () => void } | null>(null);
  const keysId = useId();
  const set = (p: number) => useAtlas.getState().setPeel(p);
  const fromY = (y: number) => {
    const r = track.current?.getBoundingClientRect();
    if (r) set(((y - r.top) / Math.max(1, r.height)) * PEEL_MAX);
  };
  /** Vai a um batente com a curva da casa (sem movimento reduzido: salta). */
  const go = (to: number) => {
    tween.current?.stop();
    const goal = Math.min(PEEL_MAX, Math.max(0, to));
    if (reduce()) return set(goal);
    tween.current = animate(useAtlas.getState().peel, goal, { duration: 0.7, ease: [0.16, 1, 0.3, 1], onUpdate: set });
  };
  const at = peel / PEEL_MAX;

  return (
    <div className="peel" role="group" aria-label={E().peel}>
      <div
        ref={track}
        className="peel__track"
        role="slider"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={E().peel}
        aria-describedby={keysId}
        aria-valuemin={0}
        aria-valuemax={PEEL_MAX}
        aria-valuenow={Math.round(peel * 100) / 100}
        aria-valuetext={valueText(peel)}
        style={{ '--at': at } as CSSProperties}
        onPointerDown={(e) => {
          tween.current?.stop();
          e.currentTarget.setPointerCapture(e.pointerId);
          fromY(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromY(e.clientY);
        }}
        onKeyDown={(e) => {
          const p = useAtlas.getState().peel;
          const k = e.key;
          if (k === 'ArrowDown' || k === 'ArrowRight') set(p + 0.1);
          else if (k === 'ArrowUp' || k === 'ArrowLeft') set(p - 0.1);
          else if (k === 'PageDown') go(Math.floor(p + 1e-6) + 1);
          else if (k === 'PageUp') go(Math.ceil(p - 1e-6) - 1);
          else if (k === 'Home') go(0);
          else if (k === 'End') go(PEEL_MAX);
          else return;
          e.preventDefault();
        }}
      >
        <span className="peel__rail" aria-hidden="true" />
        <span className="peel__thumb" aria-hidden="true" />
      </div>
      <p id={keysId} className="visually-hidden">
        {E().peelKeys}
      </p>
      <ol className="peel__stops">
        {LAYER_ORDER.map((l, i) => (
          <li key={l} style={{ '--at': i / PEEL_MAX } as CSSProperties}>
            <button type="button" className="peel__stop" aria-pressed={Math.abs(peel - i) < 0.005} data-past={peel > i + 0.005} onClick={() => go(i)}>
              {E().peelStop[l]}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
