/**
 * Parte de baixo da página inicial (chunk à parte, montado quando o leitor se aproxima): exercícios da biblioteca
 * executados ao vivo pelo mesmo corpo do player, as quatro entradas com números e a nota de fonte.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { Link } from 'wouter';
import { muscleDefs } from '@/data';
import { library } from '@/features/library/catalog';
import { t as tShell } from '@/i18n';
import { t } from '@/i18n/app';
import { claimTitle } from '@/ui/Title';
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

function Doors() {
  const D = t.homeMore.doors;
  const H = tShell.home.doors;
  const rows = [
    { href: '/atlas', name: H.atlas.name, body: H.atlas.body, stat: D.atlas(muscleDefs.length) },
    { href: '/exercicios', name: H.library.name, body: H.library.body, stat: D.library(library.length) },
    { href: '/lab', name: H.lab.name, body: H.lab.body, stat: D.lab },
    { href: '/treino', name: H.training.name, body: H.training.body, stat: D.training },
  ];
  return (
    <section id="home-gates" className="home-gates" aria-labelledby="home-gates-title">
      <h2 id="home-gates-title" className="home-gates__title">
        {D.title}
      </h2>
      <ol className="home-gates__list">
        {rows.map((r, k) => (
          <li key={r.href} style={{ '--i': k } as CSSProperties}>
            <Link href={r.href} className="home-gates__link lamp" onClick={claimTitle}>
              <span className="home-gates__num" aria-hidden="true">
                {String(k + 1).padStart(2, '0')}
              </span>
              <span className="home-gates__name" data-title="">
                {r.name}
              </span>
              <span className="home-gates__body">{r.body}</span>
              <span className="home-gates__stat">{r.stat}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="home-gates__note">{t.homeMore.note}</p>
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
