/**
 * Parte de baixo da página inicial (chunk à parte, montado quando o leitor se aproxima): exercícios da biblioteca
 * executados ao vivo pelo mesmo corpo do player e os Mundos (as quatro entradas sobre o mesmo corpo).
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { t } from '@/i18n/app';
import { Doors } from './Doors';
import { HomeLive } from './HomeLive';
import './home-more.css';

/**
 * Frase que acende palavra a palavra conforme a rolagem: o bloco é alto e o texto fica preso no meio da tela; o
 * progresso (0..1, --p) acende cada palavra pela ordem (--i de --n). Com redução de movimento, já vem acesa e sem
 * prender. Palavras entre asteriscos acendem em tungstênio.
 */
function Statement() {
  const S = t.homeMore.say;
  const ref = useRef<HTMLElement>(null);
  const words = S.text.split(' ');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--p', '1');
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      const p = run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 1;
      el.style.setProperty('--p', p.toFixed(3));
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
  }, []);
  return (
    <section id="home-say" ref={ref} className="home-say" aria-label={S.label} style={{ '--n': words.length } as CSSProperties}>
      <div className="home-say__pin">
        <p className="home-say__text">
          {words.map((w, i) => {
            const key = w.startsWith('*');
            return (
              <span key={i}>
                <span className={key ? 'home-say__w home-say__w--key' : 'home-say__w'} style={{ '--i': i } as CSSProperties}>
                  {w.replaceAll('*', '')}
                </span>{' '}
              </span>
            );
          })}
        </p>
        <span className="home-say__rule" aria-hidden="true" />
      </div>
    </section>
  );
}

export default function HomeMore() {
  return (
    <>
      <Statement />
      <HomeLive />
      <Doors />
    </>
  );
}
