import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'wouter';
import { fmt, t } from '@/i18n';
import { bindAnchor } from '@/scene/annotations';
import { useStage } from '@/scene/stageStore';
import { CALLOUTS, type CalloutDef } from './callouts';
import { openingFrame, type LayerId } from './timeline';
import './abertura.css';

const LAYERS: LayerId[] = ['skin', 'superficial', 'deep', 'bone'];
const byLayer = (l: LayerId) => CALLOUTS.filter((c) => c.layer === l);

function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const setProgress = useStage((s) => s.setProgress);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const total = el.offsetHeight - window.innerHeight;
      setProgress(total > 0 ? -el.getBoundingClientRect().top / total : 0);
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
    };
  }, [ref, setProgress]);
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
      destroy = () => lenis.destroy();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, []);
}

function CutRuler() {
  const p = useStage((s) => s.progress);
  const f = openingFrame(p);
  const cm = f.activeCut === null ? null : Math.max(0, Math.round(f.activeCut * 100));
  const ticks = Array.from({ length: 19 }, (_, i) => i * 10);
  return (
    <aside className="cut-ruler" aria-hidden="true">
      <div className="cut-ruler__readout" data-active={cm !== null}>
        <span className="cut-ruler__label">{t.opening.cutLabel}</span>
        <span className="cut-ruler__value">{cm === null ? '—' : fmt.n0(cm)}</span>
        <span className="cut-ruler__unit">{t.opening.cutUnit}</span>
      </div>
      <div className="cut-ruler__scale">
        {ticks.map((v) => (
          <span key={v} className="cut-ruler__tick" data-major={v % 50 === 0} style={{ bottom: `${(v / 180) * 100}%` }}>
            {v % 50 === 0 && <span>{v}</span>}
          </span>
        ))}
        {cm !== null && <span className="cut-ruler__marker" style={{ bottom: `${(Math.min(180, cm) / 180) * 100}%` }} />}
      </div>
    </aside>
  );
}

function Callout({ def, n }: { def: CalloutDef; n: number }) {
  const el = useRef<HTMLDivElement>(null);
  const line = useRef<SVGLineElement>(null);
  useEffect(() => {
    bindAnchor(def.id, el.current, line.current);
    return () => bindAnchor(def.id, null, null);
  }, [def.id]);
  return (
    <>
      <svg className="callout__svg" aria-hidden="true">
        <line ref={line} className="callout__line" />
      </svg>
      <div ref={el} className="callout" aria-hidden="true" style={{ visibility: 'hidden' }}>
        <span className="callout__dot" />
        <span className="callout__label">
          <span className="callout__num">{n}</span>
          <span className="callout__name">{def.label}</span>
        </span>
      </div>
    </>
  );
}

function Callouts() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById('stage-overlay')), []);
  if (!host) return null;
  return createPortal(
    <>
      {LAYERS.flatMap((l) => byLayer(l).map((c, i) => <Callout key={c.id} def={c} n={i + 1} />))}
    </>,
    host,
  );
}

export default function Abertura() {
  const root = useRef<HTMLElement>(null);
  const setScene = useStage((s) => s.setScene);
  useEffect(() => {
    setScene('opening');
    return () => setScene('none');
  }, [setScene]);
  useScrollProgress(root);
  useSmoothScroll();

  return (
    <main id="conteudo" ref={root} className="opening">
      <section className="opening__intro" aria-labelledby="opening-title">
        <h1 id="opening-title" className="opening__title">
          {t.opening.title}
        </h1>
        <p className="opening__lead prose">{t.opening.lead}</p>
      </section>

      {LAYERS.map((l) => {
        const legend = byLayer(l);
        const copy = t.opening.layers[l];
        return (
          <section key={l} className="opening__layer" data-layer={l} aria-labelledby={`layer-${l}`}>
            <div className="plate-card">
              <h2 id={`layer-${l}`} className="plate-card__title">
                {copy.name}
              </h2>
              <p className="plate-card__body prose">{copy.body}</p>
              {legend.length > 0 && (
                <ol className="legend">
                  {legend.map((c, i) => (
                    <li key={c.id}>
                      <span className="legend__num">{i + 1}</span>
                      <span className="legend__name">{c.label}</span>
                      {c.latin && <span className="legend__latin latin">{c.latin}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        );
      })}

      <section className="opening__end" aria-labelledby="opening-end">
        <div className="plate-card plate-card--end">
          <h2 id="opening-end" className="plate-card__title">
            {t.opening.end.title}
          </h2>
          <ul className="next-plates">
            <li>
              <Link href="/lab/agachamento" className="next-plates__item next-plates__item--link">
                <span className="next-plates__name">{t.opening.end.lab}</span>
                <span className="next-plates__status">{t.opening.end.labStatus}</span>
              </Link>
            </li>
            <li>
              <Link href="/atlas" className="next-plates__item next-plates__item--link">
                <span className="next-plates__name">{t.opening.end.atlas}</span>
                <span className="next-plates__status">{t.opening.end.atlasStatus}</span>
              </Link>
            </li>
            <li>
              <Link href="/exercicios" className="next-plates__item next-plates__item--link">
                <span className="next-plates__name">{t.opening.end.library}</span>
                <span className="next-plates__status">{t.opening.end.libraryStatus}</span>
              </Link>
            </li>
            <li>
              <Link href="/sistema" className="next-plates__item next-plates__item--link">
                <span className="next-plates__name">{t.opening.end.system}</span>
              </Link>
            </li>
          </ul>
          <p className="opening__note">{t.opening.note}</p>
        </div>
      </section>

      <CutRuler />
      <Callouts />
    </main>
  );
}
