/**
 * Parte de baixo da página inicial (chunk à parte, montado quando o leitor se aproxima): exercícios da biblioteca
 * executados ao vivo pelo mesmo corpo do player, as quatro entradas com números e a nota de fonte.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'wouter';
import { muscleDefs } from '@/data';
import { exerciseById, library, muscleById } from '@/features/library/catalog';
import { compiledClip } from '@/features/library/motion';
import { usePlayer } from '@/features/library/player/store';
import { t as tShell } from '@/i18n';
import { t } from '@/i18n/app';
import { claimTitle } from '@/ui/Title';
import './home-more.css';

/** Um de cada canto do corpo, todos com ênfase no comprimento longo. */
const SHOW = ['squat', 'bayesian_curl', 'romanian_deadlift', 'lat_pulldown'] as const;
/** Repetições de cada exercício antes de passar ao próximo (sem o leitor escolher). */
const REPS = 2;

function targetsOf(id: string) {
  const e = exerciseById(id);
  return {
    primary: e?.targets.filter((x) => x.role === 'alvo').map((x) => x.muscle) ?? [],
    synergist: e?.targets.filter((x) => x.role === 'sinergista').map((x) => x.muscle) ?? [],
  };
}

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

function Showcase() {
  const S = t.homeMore.show;
  const slot = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  /** Escolha do leitor para o rodízio automático. */
  const [auto, setAuto] = useState(true);
  const playing = usePlayer((s) => s.playing);
  const id = SHOW[i] ?? 'squat';
  const ex = exerciseById(id);
  const targets = targetsOf(id);

  useEffect(() => {
    usePlayer.getState().setSlot(slot.current);
    return () => {
      usePlayer.getState().setSlot(null);
      usePlayer.getState().setPlaying(false);
    };
  }, []);

  useEffect(() => {
    usePlayer.getState().load(compiledClip(id), targetsOf(id));
  }, [id]);

  // Rodízio: conta as voltas do relógio da repetição.
  useEffect(() => {
    if (!auto) return;
    let reps = 0;
    return usePlayer.subscribe((s, p) => {
      if (s.clip !== p.clip || s.time >= p.time) return;
      if (++reps >= REPS) setI((k) => (k + 1) % SHOW.length);
    });
  }, [auto, id]);

  // Fora da tela, para (o palco só desenha sob demanda); de volta, continua se o leitor não pausou.
  const paused = useRef(false);
  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(([e]) => {
      if (!e) return;
      if (!e.isIntersecting) usePlayer.getState().setPlaying(false);
      else if (!paused.current && !reduce) usePlayer.getState().setPlaying(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="home-show" className="home-show" aria-labelledby="home-show-title">
      <header className="home-show__head">
        <p className="home-eyebrow">{S.eyebrow}</p>
        <h2 id="home-show-title" className="home-show__title">
          {S.title}
        </h2>
        <p className="home-show__body">{S.body}</p>
      </header>
      <div className="home-show__grid">
        <ol className="home-show__list" aria-label={S.list}>
          {SHOW.map((x, k) => {
            const e = exerciseById(x);
            return (
              <li key={x}>
                <button
                  type="button"
                  className="home-show__pick"
                  aria-pressed={k === i}
                  onClick={() => {
                    setAuto(false);
                    paused.current = false;
                    setI(k);
                  }}
                >
                  <span className="home-show__num" aria-hidden="true">
                    {String(k + 1).padStart(2, '0')}
                  </span>
                  <span className="home-show__name">{e?.name}</span>
                  {k === i && auto && <span className="home-show__bar" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ol>
        <figure className="home-show__stage">
          <div ref={slot} className="home-show__view viewport" role="img" aria-label={S.viewer(ex?.name ?? '')} />
          <figcaption className="home-show__caption">
            <button
              type="button"
              className="btn-secondary home-show__play"
              onClick={() => {
                const next = !usePlayer.getState().playing;
                paused.current = !next;
                if (!next) setAuto(false);
                usePlayer.getState().setPlaying(next);
              }}
            >
              {playing ? S.pause : S.play}
            </button>
            <span className="home-show__legend" aria-hidden="true">
              <span className="home-show__swatch" data-k="short" />
              {S.shorter}
              <span className="home-show__swatch" data-k="long" />
              {S.longer}
            </span>
          </figcaption>
        </figure>
        <div className="home-show__meta">
          <h3 className="home-show__meta-title">{S.targets}</h3>
          <ul className="home-show__targets">
            {targets.primary.map((m) => (
              <li key={m}>
                <Link href={`/atlas/${m}`}>{muscleById(m)?.name ?? m}</Link>
              </li>
            ))}
          </ul>
          {ex && (
            <p className="home-show__summary">
              <span className="home-show__emph">{t.emphasis[ex.length.emphasis]}</span> {ex.summary}
            </p>
          )}
          <div className="home-show__links">
            {ex && (
              <Link href={`/exercicios/${ex.id}`} className="btn-primary">
                {S.open(ex.name)}
              </Link>
            )}
            <Link href="/exercicios" className="btn-secondary">
              {S.all(library.length)}
            </Link>
          </div>
          <p className="home-show__note">{S.note}</p>
        </div>
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
      <Showcase />
      <Doors />
    </>
  );
}
