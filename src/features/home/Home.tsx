/**
 * Página inicial. O corpo anatômico é a primeira coisa na tela e já responde: a lente tira a pele sob o ponteiro, o músculo
 * acende e leva ao Atlas. Rolando, as camadas abrem lado a lado; mais abaixo, exercícios ao vivo e as quatro entradas.
 *
 * Fica na shell (primeira pintura): só texto, o slot da vista e o progresso do scroll. Ponteiro, lente e o resto da
 * página chegam em chunks à parte.
 */
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'wouter';
import { t } from '@/i18n';
import { bindAnchor } from '@/scene/annotations';
import { useStage } from '@/scene/stageStore';
import { claimTitle, SplitText } from '@/ui/Title';
import { homeScroll, useHome } from './store';
import { explodeAt, LAYER_IDS, type LayerId } from './timeline';
import './home.css';

const HeroControls = lazy(() => import('./HeroControls'));
const HomeMore = lazy(() => import('./HomeMore'));
const HomeRail = lazy(() => import('./HomeRail'));
const Atmosphere = lazy(() => import('./Atmosphere'));

const H = t.home;
const DOORS = [
  { href: '/atlas', ...H.doors.atlas },
  { href: '/exercicios', ...H.doors.library },
  { href: '/lab', ...H.doors.lab },
  { href: '/treino', ...H.doors.training },
] as const;

/** Progresso do scroll dentro do bloco do herói (0..1) → palco; o DOM lê a abertura das camadas como variável de CSS. */
function useHeroProgress(wrap: React.RefObject<HTMLElement | null>, root: React.RefObject<HTMLElement | null>) {
  const setProgress = useStage((s) => s.setProgress);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = wrap.current;
      if (!el) return;
      const total = el.offsetHeight - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / total)) : 0;
      setProgress(p);
      const ex = explodeAt(p);
      root.current?.style.setProperty('--ex', ex.toFixed(3));
      document.documentElement.style.setProperty('--home-ex', ex.toFixed(3));
      root.current?.setAttribute('data-open', String(ex > 0.5));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
      document.documentElement.style.removeProperty('--home-ex');
    };
  }, [wrap, root, setProgress]);
}

/** Scroll suave só com mouse/trackpad e sem redução de movimento. Lenis carrega sob demanda. */
function useSmoothScroll() {
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;
    let destroy: (() => void) | undefined;
    let cancelled = false;
    void import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis({ autoRaf: true, lerp: 0.12 });
      homeScroll.to = (y) => lenis.scrollTo(y, { duration: 1.4 });
      destroy = () => {
        homeScroll.to = null;
        lenis.destroy();
      };
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);
}

/** Rótulo de uma camada aberta; a cena escreve a posição (sobre a cabeça da camada). */
function LayerTag({ l, n }: { l: LayerId; n: number }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = `home-layer-${l}`;
    bindAnchor(id, el.current, null);
    return () => bindAnchor(id, null, null);
  }, [l]);
  return (
    <span ref={el} className="home-tag" style={{ opacity: 0 }} aria-hidden="true">
      <span className="home-tag__num">{String(n).padStart(2, '0')}</span>
      <span className="home-tag__name">{H.layers[l]}</span>
    </span>
  );
}

function LayerTags() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById('stage-overlay')), []);
  if (!host) return null;
  return createPortal(
    <>
      {LAYER_IDS.map((l, i) => (
        <LayerTag key={l} l={l} n={i + 1} />
      ))}
    </>,
    host,
  );
}

function Doors({ className }: { className: string }) {
  return (
    <nav className={`home-doors ${className}`} aria-label={H.entries}>
      <ol>
        {DOORS.map((d, i) => (
          <li key={d.href} style={{ '--i': i } as CSSProperties}>
            <Link href={d.href} className="home-doors__link" onClick={claimTitle}>
              <span className="home-doors__num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="home-doors__name" data-title="">
                {d.name}
              </span>
              <span className="home-doors__body">{d.body}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Monta o resto da página quando o leitor se aproxima (ou o navegador fica ocioso). */
function useNear(ref: React.RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near]);
  return near;
}

export default function Home() {
  const root = useRef<HTMLElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const [slot, setSlotEl] = useState<HTMLDivElement | null>(null);
  const [coarse] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const ready = useStage((s) => s.ready);
  const near = useNear(more);

  useEffect(() => {
    const st = useStage.getState();
    st.setScene('home');
    useHome.getState().reset();
    return () => {
      useStage.getState().setScene('none');
      useStage.getState().setProgress(0);
    };
  }, []);
  useEffect(() => {
    useHome.getState().setSlot(slot);
    return () => useHome.getState().setSlot(null);
  }, [slot]);
  useHeroProgress(wrap, root);
  useSmoothScroll();

  return (
    <main id="conteudo" ref={root} className="home" data-ready={ready}>
      <div ref={wrap} className="home-hero">
        <div className="home-hero__back" aria-hidden="true">
          <Suspense fallback={null}>
            <Atmosphere />
          </Suspense>
        </div>
        <div className="home-hero__pin">
          <div
            ref={setSlotEl}
            className="home-hero__view"
            role="application"
            aria-roledescription={H.viewer}
            aria-label={H.viewer}
            aria-describedby="home-keys"
            tabIndex={0}
          >
            <p id="home-keys" className="visually-hidden">
              {H.keys}
            </p>
          </div>
          <section className="home-hero__copy" aria-labelledby="home-title">
            <h1 id="home-title" className="home-hero__title" data-text={H.title}>
              <SplitText text={H.title} />
            </h1>
            <p className="home-hero__lead home-pin-only">{H.lead}</p>
            <p className="home-hero__hint">{coarse ? H.hintCoarse : H.hintFine}</p>
            {slot && (
              <Suspense fallback={null}>
                <HeroControls slot={slot} />
              </Suspense>
            )}
            <Doors className="home-pin-only" />
          </section>
          <section className="home-hero__open" aria-labelledby="home-open">
            <h2 id="home-open" className="home-hero__open-title">
              {H.explode.title}
            </h2>
            <p className="home-hero__open-body">{H.explode.body}</p>
          </section>
          <p className="home-hero__cue" aria-hidden="true">
            <span className="home-hero__cue-rule" />
            {H.cue}
          </p>
        </div>
      </div>
      <div className="home-flow">
        <p className="home-hero__lead">{H.lead}</p>
        <Doors className="" />
      </div>
      <div ref={more} id="home-more" className="home-more">
        {near && (
          <Suspense fallback={null}>
            <HomeMore />
          </Suspense>
        )}
      </div>
      <LayerTags />
      {!coarse && (
        <Suspense fallback={null}>
          <HomeRail hero={wrap} />
        </Suspense>
      )}
    </main>
  );
}
