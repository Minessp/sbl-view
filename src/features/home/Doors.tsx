/**
 * Mundos: as quatro entradas do site em faixas de altura total sobre o corpo da vitrine. A faixa em foco (ponteiro,
 * teclado ou primeiro toque) abre e o corpo vai até ela no modo da seção: raio X (Atlas), executando (Exercícios), com
 * arco e rastro (Lab), mapa de calor (Treino). Clique (ou segundo toque) leva à seção com o corte do palco.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'wouter';
import { R } from '@/app/routes';
import { muscleDefs } from '@/data';
import { heatLevel, HEAT_GLOW } from '@/features/heat/levels';
import { exerciseById, library } from '@/features/library/catalog';
import { compiledClip } from '@/features/library/motion';
import { usePlayer } from '@/features/library/player/store';
import { t as tShell } from '@/i18n';
import { t } from '@/i18n/app';
import { useVitrine } from './vitrine';
import './doors.css';

type Mode = 'atlas' | 'library' | 'lab' | 'training';
const H = tShell.home.doors;
const D = t.homeMore.doors;
const WORLDS: readonly { mode: Mode; href: string; name: string; body: string; stat: string }[] = [
  { mode: 'atlas', href: R.atlas, ...H.atlas, stat: D.atlas(muscleDefs.length) },
  { mode: 'library', href: R.library, ...H.library, stat: D.library(library.length) },
  { mode: 'lab', href: R.lab, ...H.lab, stat: D.lab },
  { mode: 'training', href: R.training, ...H.training, stat: D.training },
];
const N = WORLDS.length;
/** Faixa aberta vale OPEN fechadas. */
const OPEN = 3;
/** Em movimento, o agachamento (o Lab é dele); parado, o sissy, sem equipamento que cubra as faixas. */
const CLIP: Record<Mode, string> = { atlas: 'sissy_squat', library: 'squat', lab: 'squat', training: 'sissy_squat' };
/** Semana de exemplo do Treino: os quatro exercícios do "Ao vivo", 5 séries 2 vezes por semana, só o alvo conta. */
const SAMPLE = ['squat', 'romanian_deadlift', 'bayesian_curl', 'lat_pulldown'];
const SETS = 10;

function sampleHeat(): Record<string, number> {
  const sets: Record<string, number> = {};
  for (const id of SAMPLE) for (const x of exerciseById(id)?.targets ?? []) if (x.role === 'alvo') sets[x.muscle] = (sets[x.muscle] ?? 0) + SETS;
  return Object.fromEntries(Object.entries(sets).map(([m, n]) => [m, HEAT_GLOW[heatLevel(n)]]));
}

const desktop = () => window.matchMedia('(min-width: 900px)').matches;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Corpo da vitrine no modo do mundo k, deslocado até o centro da faixa aberta (desktop). */
function apply(k: number) {
  const w = WORLDS[k];
  const clip = w && compiledClip(CLIP[w.mode]);
  const ex = w && exerciseById(CLIP[w.mode]);
  if (!w || !clip || !ex) return;
  const targets = {
    primary: ex.targets.filter((x) => x.role === 'alvo').map((x) => x.muscle),
    synergist: ex.targets.filter((x) => x.role === 'sinergista').map((x) => x.muscle),
  };
  const st = usePlayer.getState();
  if (st.clip !== clip) st.load(clip, targets);
  const moving = w.mode === 'library' || w.mode === 'lab';
  usePlayer.setState({
    targets: w.mode === 'training' ? { primary: [], synergist: [] } : targets,
    xray: w.mode === 'atlas',
    heat: w.mode === 'training' ? sampleHeat() : null,
    telemetry: w.mode === 'lab',
    showLoad: w.mode === 'lab',
    joint: { dof: 'knee_flex_r', paths: [], target: null },
    playing: moving && !reduced(),
    speed: w.mode === 'lab' ? 0.5 : 1,
    view: w.mode === 'atlas' || w.mode === 'training' ? 'front' : 'diagonal',
    ...(moving ? {} : { time: 0 }),
    compose: desktop() ? { x: (k + OPEN / 2) / (N - 1 + OPEN) - 0.5, y: -0.05, margin: 1.4 } : null,
  });
}

export function Doors() {
  const root = useRef<HTMLElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(0);
  const openRef = useRef(0);
  const touch = useRef(false);
  const claim = useCallback(() => apply(openRef.current), []);
  useVitrine(root, slot, claim);

  const choose = (k: number) => {
    openRef.current = k;
    setOpen(k);
    if (usePlayer.getState().slot === slot.current) apply(k);
  };
  // Largura mudou de faixa (desktop ↔ celular): refaz o enquadramento.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const on = () => usePlayer.getState().slot === slot.current && apply(openRef.current);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  return (
    <section id="home-gates" ref={root} className="worlds" aria-labelledby="home-gates-title" style={{ '--open': open } as CSSProperties}>
      <h2 id="home-gates-title" className="worlds__title">
        {D.title}
      </h2>
      <div ref={slot} className="worlds__view" aria-hidden="true" />
      <ol className="worlds__list">
        {WORLDS.map((w, k) => (
          <li key={w.href} className="worlds__item" data-open={open === k}>
            <Link
              href={w.href}
              className="worlds__link"
              onPointerDown={(e) => (touch.current = e.pointerType !== 'mouse')}
              onPointerEnter={(e) => e.pointerType === 'mouse' && choose(k)}
              onFocus={() => choose(k)}
              onClick={(e) => {
                // Toque: o primeiro abre a faixa, o segundo entra.
                if (touch.current && open !== k) {
                  e.preventDefault();
                  choose(k);
                }
              }}
            >
              <span className="worlds__num" aria-hidden="true">
                {String(k + 1).padStart(2, '0')}
              </span>
              <span className="worlds__name">{w.name}</span>
              <span className="worlds__body">{w.body}</span>
              <span className="worlds__stat">{w.stat}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="worlds__sample" data-on={WORLDS[open]?.mode === 'training'}>
        {D.sample}
      </p>
      <p className="worlds__note">{t.homeMore.note}</p>
    </section>
  );
}
