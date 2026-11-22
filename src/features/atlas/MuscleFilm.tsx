/**
 * Página do músculo como filme: palco pleno preso atrás, pranchas de vidro passando à esquerda. Cada prancha dirige a
 * câmera quando cruza o meio da tela (01 anatomia: vista de três quartos com origem e inserção acesas; 02 ações: a ação
 * no meio da tela toca a demonstração; 03 curvas: o cursor do gráfico move a articulação; 04 exercícios; 05 fontes).
 * shortcut: a câmera troca de plano por prancha (voo amortecido), não segue a rolagem quadro a quadro; se pedirem "scrub", interpolar órbitas entre pranchas.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { LineChart, type LinePattern } from '@/charts/LineChart';
import { getReference } from '@/data';
import type { MuscleDef } from '@/data/schema/muscle';
import { fmt, t } from '@/i18n/app';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { exercisesForMuscle, movementById, muscleRefIds, posterSrc } from '@/features/library/catalog';
import { EmphasisMark } from '@/features/library/EmphasisMark';
import { actionCurves, actionHasPart, type ActionCurve } from './model';
import { DemoButton, DemoControls, useDemoActive, useDemoMarker } from './explorer/ActionDemo';
import { LiveLabels } from './explorer/LiveLabels';
import { Dive } from './dive/Dive';
import { PartPicker } from './explorer/Panel';
import { Viewport } from './explorer/Viewport';
import { defaultView, useAtlas, type Pick } from './store';
import { Title } from '@/ui/Title';
import { exerciseHref, muscleHref, R } from '@/app/routes';

const PATTERNS: LinePattern[] = ['solid', 'dashed', 'dotted'];
const unverifiedOf = (src: readonly { refId: string }[]) => !src.some((s) => getReference(s.refId)?.verified === true);
const startCurve = (c: ActionCurve) => useAtlas.getState().startDemo({ dof: c.dof, range: c.range, from: c.from, to: c.to, base: c.base, plane: c.movement.plane, key: c.key });

/** Chama `onCue` quando o elemento cruza a faixa do meio da tela (rolando para baixo ou para cima). */
function useCue(onCue: () => void) {
  const ref = useRef<HTMLElement | null>(null);
  const cb = useRef(onCue);
  cb.current = onCue;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && cb.current(), { rootMargin: '-45% 0px -45% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Plate({ n, id, title, onCue, children }: { n: number; id: string; title: string; onCue: () => void; children: React.ReactNode }) {
  const ref = useCue(onCue);
  return (
    <section ref={ref} className="film-plate" aria-labelledby={id}>
      <header className="film-plate__head">
        <span className="film-plate__n" aria-hidden="true">
          {String(n).padStart(2, '0')}
        </span>
        <h2 id={id}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function describe(title: string, c: ActionCurve, pick: (s: ActionCurve['series'][number]) => number[], unit: string) {
  return `${title}, ${t.sr.range(c.axisLabel, c.range[0], c.range[1])}: ` + c.series.map((s) => {
    const v = pick(s);
    return t.sr.goes(s.label, fmt.n1(v[0] ?? 0), fmt.n1(v[v.length - 1] ?? 0), unit);
  }).join('; ');
}

function CurveCard({ c }: { c: ActionCurve }) {
  const A = t.atlas;
  const marker = useDemoMarker(c);
  const active = useDemoActive(c);
  const labels = [`${c.range[0]}°`, `${c.range[1]}°`] as const;
  const lenSeries = c.series.map((s, i) => ({ id: s.partId, label: s.label, values: s.length.map((v) => v * 100), pattern: PATTERNS[i] ?? 'solid' }));
  const armSeries = c.series.map((s, i) => ({ id: s.partId, label: s.label, values: s.arm.map((v) => v * 100), pattern: PATTERNS[i] ?? 'solid' }));
  return (
    <div className="curve" data-active={active}>
      <h3 className="curve__title">
        {c.movement.label}
        <span className="curve__axis">{A.axis(c.axisLabel)}</span>
      </h3>
      <div className="curve__demo">
        <DemoButton c={c} className="chip chip--small curve__play" />
      </div>
      {active && <DemoControls c={c} />}
      {c.series.length > 1 && (
        <ul className="curve__legend">
          {c.series.map((s, i) => (
            <li key={s.partId}>
              <svg className="pattern-key" viewBox="0 0 28 8" aria-hidden="true">
                <line x1="1" y1="4" x2="27" y2="4" strokeDasharray={PATTERNS[i] === 'dashed' ? '6 4' : PATTERNS[i] === 'dotted' ? '1.4 3.4' : undefined} />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="chart-pair">
        <LineChart
          title={A.length}
          unit={A.lengthUnit}
          x={c.x}
          series={lenSeries}
          marker={marker}
          xLabels={labels}
          zeroLine
          reveal={false}
          yFormat={(v) => `${fmt.n0(Math.round(v) || 0)}%`}
          description={describe(A.length, c, (s) => s.length.map((v) => v * 100), t.sr.pct)}
        />
        <LineChart
          title={A.arm}
          unit={A.armUnit}
          x={c.x}
          series={armSeries}
          marker={marker}
          xLabels={labels}
          zeroLine
          reveal={false}
          yFormat={(v) => fmt.n1(v)}
          description={describe(A.arm, c, (s) => s.arm.map((v) => v * 100), t.sr.cm)}
        />
      </div>
    </div>
  );
}

/** Linha de ação: ao passar pelo meio da tela, a demonstração dela toca no corpo. */
function ActionRow({ m, a, curve }: { m: MuscleDef; a: MuscleDef['actions'][number]; curve: ActionCurve | undefined }) {
  const A = t.atlas;
  const ref = useCue(() => curve && useAtlas.getState().demo.spec?.key !== curve.key && startCurve(curve));
  const parts = a.parts?.map((p) => m.parts.find((x) => x.id === p)?.name ?? p);
  const mv = movementById(a.movement);
  const gap = a.unmodeled ?? (mv && !mv.dof ? mv.note : undefined);
  return (
    <li ref={ref as React.RefObject<HTMLLIElement>} data-role={a.role}>
      {curve ? <DemoButton c={curve} className="action-list__play" /> : <span className="action-list__name">{mv?.label ?? a.movement}</span>}
      <span className="action-list__role">{t.roles[a.role]}</span>
      {parts && (
        <span className="action-list__parts">
          {A.parts} {parts.join(', ').toLowerCase()}
        </span>
      )}
      <EvidenceSeal confidence={a.evidence.confidence} unverified={unverifiedOf(a.evidence.source)} compact />
      {a.evidence.note && <span className="action-list__note">{a.evidence.note}</span>}
      {gap && (
        <span className="action-list__note action-list__note--model">
          {A.unmodeled} {gap}
        </span>
      )}
    </li>
  );
}

export function MuscleFilm({ m, part, setPart }: { m: MuscleDef; part: string | undefined; setPart: (p: string | undefined) => void }) {
  const A = t.atlas;
  const E = A.ex;
  const [, navigate] = useLocation();
  const partDef = part ? m.parts.find((p) => p.id === part) : undefined;
  const actions = m.actions.filter((a) => actionHasPart(a, part));
  const curves = useMemo(() => actionCurves(m, part), [m, part]);
  const curveOf = (movement: string) => curves.find((c) => c.movement.id === movement);
  const uses = exercisesForMuscle(m.id);
  const sel: Pick = { kind: 'muscle', id: m.id, side: 'r', part };

  useEffect(() => {
    useAtlas.getState().reset({ kind: 'muscle', id: m.id, side: 'r' }, defaultView(m.group));
  }, [m]);
  // A parte muda sem refazer a página: só a seleção (e a câmera voa até ela).
  useEffect(() => {
    const st = useAtlas.getState();
    const s = st.selection;
    if (s?.kind === 'muscle' && s.id === m.id && s.part === part) return;
    st.select({ kind: 'muscle', id: m.id, side: s?.side ?? 'r', part }, { fly: true });
  }, [m, part]);
  // Desktop: as pranchas ocupam a esquerda e o corpo vai para a direita do quadro.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1000px)');
    const sync = () => useAtlas.getState().setShift(wide.matches ? 0.16 : 0);
    sync();
    wide.addEventListener('change', sync);
    return () => {
      wide.removeEventListener('change', sync);
      useAtlas.getState().setShift(0);
    };
  }, []);

  useEffect(() => {
    useAtlas.getState().setDiveable(true);
    return () => useAtlas.getState().setDiveable(false);
  }, []);

  const st = useAtlas.getState;
  const onTap = (p: Pick) => {
    if (p.kind === 'muscle' && p.id !== m.id) navigate(muscleHref(p.id, p.part));
    else if (p.kind === 'muscle' && p.part !== part) setPart(p.part);
    else if (p.kind === 'muscle') st().frame();
  };
  const cues = {
    // Três quartos, um pouco de cima: origem e inserção à vista, as pontas acesas.
    anatomy: () => {
      st().stopDemo();
      st().select({ ...sel, side: st().selection?.side ?? 'r' }, { fly: true, view: defaultView(m.group) });
      st().orbitBy(0.55, 0.12);
    },
    actions: () => {
      const c = curves[0];
      if (c && !st().demo.spec) startCurve(c);
    },
    curves: () => {
      const c = curves[0];
      if (c && !st().demo.spec) startCurve(c);
    },
    exercises: () => {
      st().stopDemo();
      st().select({ ...sel, side: st().selection?.side ?? 'r' }, { fly: true, view: defaultView(m.group) });
      st().zoomBy(1.5);
    },
    sources: () => st().stopDemo(),
  };

  return (
    <main id="conteudo" className="mfilm">
      <div className="mfilm__stage">
        <Viewport
          label={`${A.figure} ${m.name}.`}
          className="mfilm__view"
          scrolls
          onTap={onTap}
          hoverText={(name, p) => (p.kind === 'muscle' && p.id !== m.id ? E.hoverOpen(name) : p.kind === 'muscle' && p.part !== part ? E.hoverPart(name) : null)}
        />
        <LiveLabels muscles={false} />
      </div>
      <header className="mfilm__head">
        <Link href={R.atlas} className="mfilm__back">
          {A.back}
        </Link>
        <Title text={m.name} />
        <p className="mfilm__latin latin">{m.latin}</p>
        <p className="mfilm__group">{t.groups[m.group]}</p>
        {m.parts.length > 1 && <PartPicker muscle={m} selection={sel} onPick={setPart} />}
        <button
          type="button"
          className="mfilm__dive"
          onClick={() => {
            st().zoomBy(0.05);
            st().setDive(1);
          }}
        >
          {A.dive.open}
        </button>
      </header>
      <Dive m={m} part={part} />

      <div className="mfilm__plates">
        <Plate n={1} id="mu-anat" title={A.anatomy} onCue={cues.anatomy}>
          <dl className="facts facts--stack">
            <div>
              <dt>{A.origin}</dt>
              <dd>{m.origin}</dd>
            </div>
            <div>
              <dt>{A.insertion}</dt>
              <dd>{m.insertion}</dd>
            </div>
          </dl>
          <EvidenceSeal confidence={m.anatomy.confidence} unverified={unverifiedOf(m.anatomy.source)} />
        </Plate>

        <Plate n={2} id="mu-act" title={partDef ? A.actionsOfPart(partDef.name) : A.actions} onCue={cues.actions}>
          <p className="film-plate__note">{A.actionsNote}</p>
          {curves.length > 0 && <p className="film-plate__note">{A.filmActions}</p>}
          <ul className="action-list">
            {actions.map((a) => (
              <ActionRow key={`${a.movement}-${a.parts?.join() ?? ''}`} m={m} a={a} curve={curveOf(a.movement)} />
            ))}
          </ul>
        </Plate>

        <Plate n={3} id="mu-model" title={A.modelTitle} onCue={cues.curves}>
          <p className="film-plate__note">{A.modelNote}</p>
          <EvidenceSeal confidence="especulativo" />
          {curves.length === 0 ? (
            <p className="film-plate__note">{A.noModel}</p>
          ) : (
            <div className="curve-list">
              {curves.map((c) => (
                <CurveCard key={c.key} c={c} />
              ))}
            </div>
          )}
        </Plate>

        <Plate n={4} id="mu-ex" title={A.exercises} onCue={cues.exercises}>
          {uses.length === 0 ? (
            <p className="film-plate__note">{A.noExercises}</p>
          ) : (
            <ul className="film-strip">
              {uses.map((u) => (
                <li key={u.exercise.id} data-role={u.role}>
                  <Link href={exerciseHref(u.exercise.id)} className="film-strip__card">
                    <img src={posterSrc(u.exercise.id)} alt="" width={640} height={800} loading="lazy" decoding="async" />
                    <span className="film-strip__name">{u.exercise.name}</span>
                    <span className="film-strip__meta">
                      <EmphasisMark emphasis={u.emphasis} /> {t.emphasis[u.emphasis].toLowerCase()} · {t.roles[u.role].toLowerCase()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Plate>

        <Plate n={5} id="mu-src" title={A.sources} onCue={cues.sources}>
          <Sources ids={muscleRefIds(m)} />
          <p className="disclaimer">{A.disclaimer}</p>
          <p className="film-plate__note">{t.body.credit}</p>
        </Plate>
      </div>
    </main>
  );
}
