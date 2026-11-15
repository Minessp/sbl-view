/**
 * Barra do descanso: anel que esvazia, tempo grande, ±15 s e pular. No fim vibra, toca um bipe curto
 * (gerado na hora, sem arquivo) e avisa o leitor de tela.
 */
import { useEffect, useState } from 'react';
import { t } from '@/i18n/app';
import { useRestTimer } from './timer';

const R = 26;
const C = 2 * Math.PI * R;

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.45);
    o.onended = () => void ctx.close();
  } catch {
    // Sem áudio: a vibração e o aviso bastam.
  }
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/**
 * O cronômetro fica preso ao pé da tela: publica a altura dele em `--rest-h` (o rodapé do site reserva esse espaço para
 * não ficar escondido embaixo) e limpa ao sair.
 */
function reserve(el: HTMLElement | null): (() => void) | undefined {
  if (!el || typeof ResizeObserver === 'undefined') return undefined;
  const root = document.documentElement;
  const ro = new ResizeObserver(() => root.style.setProperty('--rest-h', `${Math.ceil(el.getBoundingClientRect().height + 16)}px`));
  ro.observe(el);
  return () => {
    ro.disconnect();
    root.style.removeProperty('--rest-h');
  };
}

export function RestTimer() {
  const T = t.training.timer;
  const { endAt, total, label, add, stop } = useRestTimer();
  const [now, setNow] = useState(() => Date.now());
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (endAt === null) return;
    setOver(false);
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endAt]);

  const left = endAt === null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000));
  useEffect(() => {
    if (endAt === null || left > 0 || over) return;
    setOver(true);
    navigator.vibrate?.([180, 80, 180]);
    beep();
    const id = setTimeout(stop, 5000);
    return () => clearTimeout(id);
  }, [endAt, left, over, stop]);

  if (endAt === null) return null;
  const frac = total > 0 ? left / total : 0;
  return (
    <section ref={reserve} className="rest" data-over={over || undefined} aria-label={T.region}>
      <svg className="rest__ring" viewBox="0 0 60 60" aria-hidden="true">
        <circle className="rest__track" cx="30" cy="30" r={R} />
        <circle className="rest__arc" cx="30" cy="30" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      <div className="rest__text">
        <span className="rest__label">{T.label}</span>
        <span className="rest__time" role="timer" aria-live="off">
          {clock(left)}
        </span>
        {label && <span className="rest__next">{T.next(label)}</span>}
      </div>
      <div className="rest__actions">
        <button type="button" className="rest__btn" aria-label={T.minus} onClick={() => add(-15)}>
          −15
        </button>
        <button type="button" className="rest__btn" aria-label={T.plus} onClick={() => add(15)}>
          +15
        </button>
        <button type="button" className="rest__btn rest__btn--skip" onClick={stop}>
          {T.skip}
        </button>
      </div>
      <p className="visually-hidden" role="status">
        {over ? T.over : ''}
      </p>
    </section>
  );
}
