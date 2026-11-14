/**
 * Régua de capítulos da página inicial (chunk à parte, só com ponteiro fino e tela larga). Um fio vertical à direita se
 * acende com a rolagem; cada marca é um capítulo e leva até ele. O capítulo atual mostra o nome.
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { t } from '@/i18n/app';
import { homeScroll } from './store';
import { EXPLODE_WINDOW } from './timeline';
import './home-rail.css';

/** Progresso do herói em que as camadas já passaram da metade da abertura e em que estão abertas. */
const P_OPENING = (EXPLODE_WINDOW[0] + EXPLODE_WINDOW[1]) / 2;
const P_OPEN = EXPLODE_WINDOW[1] + 0.04;

/** Capítulos abaixo do herói: id da seção (montada por HomeMore); sem ela, o bloco que a recebe. */
const BELOW = ['home-say', 'home-show', 'home-gates'] as const;

function docTop(el: Element) {
  return el.getBoundingClientRect().top + window.scrollY;
}

/** Onde cada capítulo começa (y do documento) e para onde a marca leva. */
function marks(h: HTMLElement | null) {
  const run = h ? h.offsetHeight - window.innerHeight : 0;
  const top = h ? docTop(h) : 0;
  const more = document.getElementById('home-more');
  const below = BELOW.map((id) => {
    const el = document.getElementById(id) ?? more;
    return el ? docTop(el) - 56 : Infinity;
  });
  return {
    start: [0, top + run * P_OPENING, ...below.map((y) => y - window.innerHeight * 0.45)],
    go: [0, top + run * P_OPEN, ...below],
  };
}

export default function HomeRail({ hero }: { hero: RefObject<HTMLElement | null> }) {
  const R = t.homeMore.rail;
  const rail = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      rail.current?.style.setProperty('--fill', String(max > 0 ? Math.min(1, y / max) : 0));
      const { start } = marks(hero.current);
      let k = 0;
      start.forEach((s, i) => {
        if (y >= s) k = i;
      });
      setActive(k);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, [hero]);

  const go = (k: number) => {
    const y = Math.max(0, marks(hero.current).go[k] ?? 0);
    if (homeScroll.to) homeScroll.to(y);
    else window.scrollTo({ top: y, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <nav ref={rail} className="home-rail" aria-label={R.label}>
      <span className="home-rail__track" aria-hidden="true" />
      <ol>
        {R.items.map((name, k) => (
          <li key={name} style={{ '--k': k } as CSSProperties}>
            <button type="button" className="home-rail__mark" aria-current={k === active ? 'step' : undefined} onClick={() => go(k)}>
              <span className="home-rail__name">{name}</span>
              <span className="home-rail__num" aria-hidden="true">
                {String(k + 1).padStart(2, '0')}
              </span>
              <span className="home-rail__dot" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
