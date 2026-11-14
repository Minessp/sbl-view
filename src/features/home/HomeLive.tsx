/**
 * Capítulo "Ao vivo" da página inicial: a rolagem comanda a repetição. O bloco é alto e a cena fica presa na tela;
 * cada trecho de rolagem é uma repetição de um exercício (alongado → encurtado → alongado), quatro em sequência.
 * O corpo é o do player (mesma cena); ao lado, o comprimento de cada alvo em relação a em pé, o ângulo da articulação
 * principal e a fase, todos ao vivo. GSAP ScrollTrigger dá o progresso com inércia (scrub); o React só redesenha quando
 * o exercício muda: o resto vai direto ao DOM por ref, quadro a quadro.
 *
 * Redução de movimento: nada preso nem comandado pela rolagem; escolha o exercício e a posição pelo controle deslizante.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { line } from 'd3-shape';
import { Mouse } from 'lucide-react';
import { domMax, LazyMotion, m } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'wouter';
import { evaluateClip } from '@/engine/motion/evaluate';
import { repAt, repLegs } from '@/engine/motion/keys';
import { exerciseById, library, muscleById } from '@/features/library/catalog';
import { lengthCurves, valueAt } from '@/features/library/player/lengths';
import { compiledClip } from '@/features/library/motion';
import { usePlayer } from '@/features/library/player/store';
import { t } from '@/i18n/app';
import { SplitText } from '@/ui/Title';
import { homeScroll } from './store';
import './home-live.css';

gsap.registerPlugin(ScrollTrigger);

type Joint = 'knee' | 'elbow' | 'hip' | 'shoulder';
/** Um de cada canto do corpo, todos com ênfase no comprimento longo; articulação que o número grande mostra. */
const SHOW: readonly { id: string; joint: Joint }[] = [
  { id: 'squat', joint: 'knee' },
  { id: 'bayesian_curl', joint: 'elbow' },
  { id: 'romanian_deadlift', joint: 'hip' },
  { id: 'lat_pulldown', joint: 'shoulder' },
];
const N = SHOW.length;
/** Fração de cada trecho parada nas pontas: a troca de exercício acontece com o corpo na posição inicial. */
const EDGE = 0.1;
/** Escala das barras: ±40% de comprimento enche meia barra. */
const SPAN = 40;
/** Desenho da curva (px do viewBox). */
const CW = 280;
const CH = 96;

interface Track {
  readonly clip: NonNullable<ReturnType<typeof compiledClip>>;
  readonly primary: readonly string[];
  readonly synergist: readonly string[];
  readonly x: readonly number[];
  readonly series: readonly { id: string; values: readonly number[] }[];
  /** Média dos alvos (para a fase). */
  readonly mean: readonly number[];
  readonly angle: readonly number[];
  readonly lo: number;
  readonly hi: number;
}

const tracks = new Map<string, Track>();

function trackOf(id: string, joint: Joint): Track | null {
  const hit = tracks.get(id);
  if (hit) return hit;
  const clip = compiledClip(id);
  const e = exerciseById(id);
  if (!clip || !e) return null;
  const primary = e.targets.filter((x) => x.role === 'alvo').map((x) => x.muscle);
  const synergist = e.targets.filter((x) => x.role === 'sinergista').map((x) => x.muscle);
  const { x, series } = lengthCurves(clip, primary);
  const mean = x.map((_, i) => series.reduce((s, c) => s + (c.values[i] ?? 0), 0) / Math.max(1, series.length));
  const angle = x.map((u) => {
    const d = evaluateClip(clip, u).deg;
    return Math.abs(d[`${joint}_flex_r`] ?? d[`${joint}_flex`] ?? 0);
  });
  const all = series.flatMap((c) => c.values);
  const lo = Math.min(-5, ...all);
  const hi = Math.max(5, ...all);
  const tr: Track = { clip, primary, synergist, x, series, mean, angle, lo, hi };
  tracks.set(id, tr);
  return tr;
}

/** Progresso do bloco (0..1) → exercício e posição no trecho. */
function split(p: number) {
  const f = Math.min(N - 1e-6, Math.max(0, p * N));
  const k = Math.floor(f);
  return { k, s: f - k };
}

/** Posição no trecho → instante da repetição: o primeiro trecho que move na primeira metade, o segundo na outra (as pausas ficam de fora; o tempo do clipe dá a curva). */
function repTime(tr: Track, s: number) {
  const legs = repLegs(tr.clip.clip.tempo);
  const r = Math.min(1, Math.max(0, (s - EDGE) / (1 - 2 * EDGE)));
  const [a, pause, b] = [legs[0], legs[1], legs[2]];
  if (!a || !pause || !b) return 0;
  return r < 0.5 ? r * 2 * a.dur : a.dur + pause.dur + (r - 0.5) * 2 * b.dur;
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}%`;

export function HomeLive() {
  const L = t.homeMore.live;
  const S = t.homeMore.show;
  const root = useRef<HTMLElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [still] = useState(() => typeof window !== 'undefined' && reduced());
  /** Posição manual (controle deslizante) quando nada é comandado pela rolagem. */
  const [manual, setManual] = useState(0.5);
  const kRef = useRef(0);
  const item = SHOW[k] ?? SHOW[0];
  const tr = item ? trackOf(item.id, item.joint) : null;
  const ex = item ? exerciseById(item.id) : undefined;

  // Corpo do player nesta vista; parado (o relógio é a rolagem).
  useEffect(() => {
    usePlayer.getState().setSlot(slot.current);
    return () => {
      usePlayer.getState().setSlot(null);
      usePlayer.getState().setPlaying(false);
    };
  }, []);

  useEffect(() => {
    if (!tr) return;
    usePlayer.getState().load(tr.clip, { primary: tr.primary, synergist: tr.synergist });
    usePlayer.setState({ playing: false });
  }, [tr]);

  /** Escreve o quadro: pose do corpo (via store) e o painel (direto no DOM). */
  const paint = useMemo(
    () => (kk: number, s: number) => {
      const it = SHOW[kk];
      const tk = it ? trackOf(it.id, it.joint) : null;
      const box = hud.current;
      if (!tk || !box) return;
      const time = repTime(tk, s);
      usePlayer.setState({ time, playing: false });
      const { u, phase } = repAt(tk.clip.clip.tempo, time);
      for (const c of tk.series) {
        const el = box.querySelector<HTMLElement>(`[data-g="${c.id}"]`);
        if (!el) continue;
        const v = valueAt(tk.x, c.values, u);
        el.style.setProperty('--v', String(Math.max(-1, Math.min(1, v / SPAN))));
        const num = el.querySelector('[data-num]');
        if (num) num.textContent = fmtPct(v);
      }
      const ang = root.current?.querySelector('[data-angle]');
      if (ang) ang.textContent = valueAt(tk.x, tk.angle, u).toFixed(0);
      // Fase pelo sentido da média dos alvos no sentido do movimento.
      const dir = phase === 'concentric' ? 1 : phase === 'eccentric' ? -1 : 0;
      const d = dir === 0 ? 0 : (valueAt(tk.x, tk.mean, Math.min(1, u + 0.02)) - valueAt(tk.x, tk.mean, Math.max(0, u - 0.02))) * dir;
      const ph = root.current?.querySelector<HTMLElement>('[data-phase]');
      if (ph) {
        const key = Math.abs(d) < 0.05 ? 'still' : d > 0 ? 'long' : 'short';
        if (ph.dataset.k !== key) {
          ph.dataset.k = key;
          ph.textContent = key === 'still' ? L.still : key === 'long' ? L.lengthening : L.shortening;
        }
      }
      const head = box.querySelector<SVGGElement>('[data-head]');
      if (head) head.setAttribute('transform', `translate(${(u * CW).toFixed(1)} 0)`);
      root.current?.style.setProperty('--seg', String(s));
      const range = box.querySelector<HTMLInputElement>('input[type="range"]');
      if (range && document.activeElement !== range) range.value = String(Math.round(s * 100));
    },
    [L],
  );

  // Rolagem → progresso com inércia (scrub). Só sem redução de movimento.
  useEffect(() => {
    const el = root.current;
    if (!el || still) return;
    const proxy = { p: 0 };
    const ctx = gsap.context(() => {
      gsap.to(proxy, {
        p: 1,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 0.6 },
        onUpdate: () => {
          const { k: kk, s } = split(proxy.p);
          if (kk !== kRef.current) {
            kRef.current = kk;
            setK(kk);
          }
          paint(kk, s);
          el.style.setProperty('--p', proxy.p.toFixed(4));
        },
      });
    }, el);
    paint(0, 0);
    return () => ctx.revert();
  }, [still, paint]);

  // Sem rolagem no comando: o controle deslizante manda.
  useEffect(() => {
    if (still) paint(k, manual);
  }, [still, k, manual, paint, tr]);

  /** Rola até o começo do trecho do exercício (ou troca direto, sem rolagem no comando). */
  const goTo = (kk: number, s = EDGE * 0.6) => {
    const el = root.current;
    if (still || !el) {
      kRef.current = kk;
      setK(kk);
      return;
    }
    const top = el.getBoundingClientRect().top + window.scrollY;
    const y = top + ((kk + s) / N) * (el.offsetHeight - window.innerHeight);
    if (homeScroll.to) homeScroll.to(y);
    else window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const curve = useMemo(() => {
    if (!tr) return [];
    const sy = (v: number) => CH - 6 - ((v - tr.lo) / (tr.hi - tr.lo)) * (CH - 12);
    const mk = line<number>()
      .x((_, i) => (tr.x[i] ?? 0) * CW)
      .y((v) => sy(v));
    return [...tr.series.map((c) => ({ id: c.id, d: mk([...c.values]) ?? '' })), { id: '__zero', d: `M0 ${sy(0).toFixed(1)}H${CW}` }];
  }, [tr]);

  return (
    <LazyMotion features={domMax}>
      <section id="home-show" ref={root} className="live" data-still={still} aria-labelledby="live-title">
        <div className="live__pin">
          <header className="live__head">
            <p className="live__kicker">{S.eyebrow}</p>
            <h2 id="live-title" className="live__title">
              <SplitText text={L.title} />
            </h2>
            <p className="live__body">{L.body}</p>
            <ol className="live__picks" aria-label={S.list}>
              {SHOW.map((x, i) => (
                <li key={x.id}>
                  <button type="button" className="live__pick" aria-pressed={i === k} onClick={() => goTo(i)}>
                    {i === k && <m.span layoutId="live-pick" className="live__pick-lit" transition={{ type: 'spring', stiffness: 420, damping: 38 }} />}
                    <span className="live__pick-num" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="live__pick-name">{exerciseById(x.id)?.name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </header>

          <figure className="live__stage">
            <div ref={slot} className="live__view viewport" role="img" aria-label={S.viewer(ex?.name ?? '')} />
            <div className="live__segs" aria-hidden="true">
              {SHOW.map((x, i) => (
                <span key={x.id} className="live__seg" data-state={i < k ? 'done' : i === k ? 'now' : 'next'} />
              ))}
            </div>
            <figcaption className="live__read" aria-hidden="true">
              <span className="live__joint">{item ? L.joints[item.joint] : ''}</span>
              <span className="live__angle">
                <span data-angle="">0</span>
                <span className="live__deg">°</span>
              </span>
              <span className="live__phase" data-phase="" data-k="still">
                {L.still}
              </span>
            </figcaption>
            {!still && (
              <p className="live__hint" aria-hidden="true">
                <Mouse size={16} strokeWidth={1.5} />
                {L.hint}
              </p>
            )}
          </figure>

          <div ref={hud} className="live__hud">
            <h3 className="live__hud-title">
              {S.targets} <span className="live__hud-sub">{L.vsStand}</span>
            </h3>
            <ul className="live__gauges">
              {tr?.series.map((c, i) => (
                <li key={`${item?.id}-${c.id}`} className="live__gauge" data-g={c.id} style={{ '--i': i } as CSSProperties}>
                  <Link href={`/atlas/${c.id}`} className="live__gauge-name">
                    {muscleById(c.id)?.name ?? c.id}
                  </Link>
                  <span className="live__gauge-num" data-num="">
                    0%
                  </span>
                  <span className="live__bar" aria-hidden="true">
                    <span className="live__bar-fill" />
                  </span>
                </li>
              ))}
            </ul>
            <figure className="live__curve">
              <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label={L.curve}>
                {curve.map((c, i) => (
                  <path key={c.id} d={c.d} className={c.id === '__zero' ? 'live__zero' : 'live__line'} data-n={i} />
                ))}
                <g data-head="">
                  <line x1="0" x2="0" y1="0" y2={CH} className="live__head-line" />
                </g>
              </svg>
            </figure>
            <label className="live__scrub">
              <span>{L.scrub}</span>
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={50}
                onChange={(e) => {
                  const s = Number(e.currentTarget.value) / 100;
                  if (still) setManual(s);
                  else goTo(kRef.current, Math.min(0.999, s));
                }}
              />
            </label>
            <div className="live__links">
              {ex && (
                <Link href={`/exercicios/${ex.id}`} className="btn-primary">
                  {S.open(ex.name)}
                </Link>
              )}
              <Link href="/exercicios" className="btn-secondary">
                {S.all(library.length)}
              </Link>
            </div>
            <p className="live__note">{S.note}</p>
          </div>
        </div>
      </section>
    </LazyMotion>
  );
}
