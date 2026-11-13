import { useEffect, useMemo, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { LineChart, type LinePattern } from '@/charts/LineChart';
import { getReference } from '@/data';
import type { MuscleDef } from '@/data/schema/muscle';
import { fmt, t } from '@/i18n/app';
import { useStage } from '@/scene/stageStore';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { exercisesForMuscle, movementById, muscleById, muscleRefIds } from '@/features/library/catalog';
import { EmphasisMark } from '@/features/library/EmphasisMark';
import { actionCurves, type ActionCurve } from './model';
import { defaultView, useAtlas, type AtlasView } from './store';
import '@/features/heat/heat.css';
import './atlas.css';

const PATTERNS: LinePattern[] = ['solid', 'dashed', 'dotted'];
const VIEWS: AtlasView[] = ['front', 'back', 'side'];

/** Sem nenhuma fonte conferida = marca [a verificar]. */
const unverifiedOf = (src: readonly { refId: string }[]) => !src.some((s) => getReference(s.refId)?.verified === true);

function Stage({ m }: { m: MuscleDef }) {
  const ref = useRef<HTMLDivElement>(null);
  const setSlot = useAtlas((s) => s.setSlot);
  const show = useAtlas((s) => s.show);
  const view = useAtlas((s) => s.view);
  const setView = useAtlas((s) => s.setView);
  const setScene = useStage((s) => s.setScene);
  const ready = useStage((s) => s.ready);
  const hover = useAtlas((s) => s.hover);
  const setHover = useAtlas((s) => s.setHover);
  const [, navigate] = useLocation();

  useEffect(() => {
    show(m.id, defaultView(m.group));
  }, [m, show]);
  useEffect(() => {
    setScene('atlas');
    setSlot(ref.current);
    return () => {
      setSlot(null);
      setScene('none');
    };
  }, [setScene, setSlot]);

  return (
    <figure className="atlas-stage">
      <figcaption className="atlas-stage__cap">
        <span className="atlas-stage__label">{t.atlas.views}</span>
        <span className="atlas-stage__views">
          {VIEWS.map((v) => (
            <button key={v} type="button" className="chip chip--small" aria-pressed={view === v} onClick={() => setView(v)}>
              {t.atlas.view[v]}
            </button>
          ))}
        </span>
      </figcaption>
      <div
        ref={ref}
        className="atlas-stage__slot viewport"
        role="img"
        aria-label={`${t.atlas.figure} ${m.name}.`}
        data-ready={ready}
        data-hover={hover !== null && hover !== m.id}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const r = e.currentTarget.getBoundingClientRect();
          setHover(useAtlas.getState().pick?.(e.clientX - r.left, e.clientY - r.top) ?? null);
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const id = useAtlas.getState().pick?.(e.clientX - r.left, e.clientY - r.top);
          if (id && id !== m.id) navigate(`/atlas/${id}`);
        }}
      />
      <p className="atlas-stage__hint" aria-hidden="true">
        {hover && hover !== m.id ? t.atlas.hoverOpen(muscleById(hover)?.name ?? hover) : t.atlas.pickHint}
      </p>
      <p className="atlas-stage__credit">{t.body.credit}</p>
    </figure>
  );
}

function describe(title: string, c: ActionCurve, pick: (s: ActionCurve['series'][number]) => number[], unit: string) {
  return `${title}, ${c.axisLabel} de ${c.range[0]} a ${c.range[1]} graus: ` + c.series.map((s) => {
    const v = pick(s);
    return `${s.label} vai de ${fmt.n1(v[0] ?? 0)} a ${fmt.n1(v[v.length - 1] ?? 0)} ${unit}`;
  }).join('; ');
}

function Curves({ m }: { m: MuscleDef }) {
  const curves = useMemo(() => actionCurves(m), [m]);
  const A = t.atlas;
  if (curves.length === 0) return <p className="section__note">{A.noModel}</p>;
  return (
    <div className="curve-list">
      {curves.map((c) => {
        const labels = [`${c.range[0]}°`, `${c.range[1]}°`] as const;
        const lenSeries = c.series.map((s, i) => ({ id: s.partId, label: s.label, values: s.length.map((v) => v * 100), pattern: PATTERNS[i] ?? 'solid' }));
        const armSeries = c.series.map((s, i) => ({ id: s.partId, label: s.label, values: s.arm.map((v) => v * 100), pattern: PATTERNS[i] ?? 'solid' }));
        return (
          <div key={`${c.movement.id}-${c.series.map((s) => s.partId).join()}`} className="curve">
            <h3 className="curve__title">
              {c.movement.label}
              <span className="curve__axis">
                eixo: {c.axisLabel.toLowerCase()}, em graus
              </span>
            </h3>
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
                marker={c.neutralAt}
                xLabels={labels}
                zeroLine
                reveal={false}
                yFormat={(v) => `${fmt.n0(Math.round(v) || 0)}%`}
                description={describe(A.length, c, (s) => s.length.map((v) => v * 100), 'por cento')}
              />
              <LineChart
                title={A.arm}
                unit={A.armUnit}
                x={c.x}
                series={armSeries}
                marker={c.neutralAt}
                xLabels={labels}
                zeroLine
                reveal={false}
                yFormat={(v) => fmt.n1(v)}
                description={describe(A.arm, c, (s) => s.arm.map((v) => v * 100), 'centímetros')}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MusclePage({ id }: { id: string }) {
  const m = muscleById(id);
  const A = t.atlas;
  if (!m) {
    return (
      <main id="conteudo" className="sheet">
        <p>{A.notFound}</p>
        <Link href="/atlas" className="link-btn">
          {A.back}
        </Link>
      </main>
    );
  }
  const uses = exercisesForMuscle(m.id);

  return (
    <main id="conteudo" className="sheet atlas-page">
      <header className="sheet__head atlas-page__head">
        <Link href="/atlas" className="sheet__plate sheet__plate--link">
          {A.back}
        </Link>
        <h1 className="sheet__title">{m.name}</h1>
        <p className="atlas-page__latin latin">{m.latin}</p>
        <p className="atlas-page__group">{t.groups[m.group]}</p>
      </header>

      <Stage m={m} />

      <div className="atlas-page__body">
        <section className="section" aria-labelledby="mu-anat">
          <header className="section__head">
            <h2 id="mu-anat">{A.anatomy}</h2>
          </header>
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
        </section>

        <section className="section" aria-labelledby="mu-act">
          <header className="section__head">
            <h2 id="mu-act">{A.actions}</h2>
            <p>{A.actionsNote}</p>
          </header>
          <ul className="action-list">
            {m.actions.map((a) => {
              const parts = a.parts?.map((p) => m.parts.find((x) => x.id === p)?.name ?? p);
              return (
                <li key={`${a.movement}-${a.parts?.join() ?? ''}`} data-role={a.role}>
                  <span className="action-list__name">{movementById(a.movement)?.label ?? a.movement}</span>
                  <span className="action-list__role">{t.roles[a.role]}</span>
                  {parts && (
                    <span className="action-list__parts">
                      {A.parts} {parts.join(', ').toLowerCase()}
                    </span>
                  )}
                  <EvidenceSeal confidence={a.evidence.confidence} unverified={unverifiedOf(a.evidence.source)} compact />
                  {a.evidence.note && <span className="action-list__note">{a.evidence.note}</span>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="section" aria-labelledby="mu-model">
          <header className="section__head">
            <h2 id="mu-model">{A.modelTitle}</h2>
            <p>{A.modelNote}</p>
            <EvidenceSeal confidence="especulativo" />
          </header>
          <Curves m={m} />
        </section>

        <section className="section" aria-labelledby="mu-ex">
          <header className="section__head">
            <h2 id="mu-ex">{A.exercises}</h2>
          </header>
          {uses.length === 0 ? (
            <p className="section__note">{A.noExercises}</p>
          ) : (
            <ul className="target-list">
              {uses.map((u) => (
                <li key={u.exercise.id} data-role={u.role}>
                  <Link href={`/exercicios/${u.exercise.id}`} className="target-list__name">
                    {u.exercise.name}
                  </Link>
                  <span className="target-list__parts">
                    <EmphasisMark emphasis={u.emphasis} /> {t.emphasis[u.emphasis].toLowerCase()}
                  </span>
                  <span className="target-list__role">{t.roles[u.role]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section" aria-labelledby="mu-src">
          <header className="section__head">
            <h2 id="mu-src">{A.sources}</h2>
          </header>
          <Sources ids={muscleRefIds(m)} />
          <p className="disclaimer">{A.disclaimer}</p>
        </section>
      </div>
    </main>
  );
}
