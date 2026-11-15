import { useEffect, useMemo } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { LineChart, type LinePattern } from '@/charts/LineChart';
import { getReference } from '@/data';
import type { MuscleDef } from '@/data/schema/muscle';
import { fmt, t } from '@/i18n/app';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { exercisesForMuscle, movementById, muscleById, muscleRefIds } from '@/features/library/catalog';
import { EmphasisMark } from '@/features/library/EmphasisMark';
import { actionCurves, actionHasPart, type ActionCurve } from './model';
import { DemoButton, DemoControls, useDemoActive, useDemoMarker } from './explorer/ActionDemo';
import { CameraBar, LayerControls, PartPicker, ToolControls } from './explorer/Panel';
import { Viewport } from './explorer/Viewport';
import { defaultView, useAtlas, type Pick } from './store';
import './explorer/explorer.css';
import '@/features/heat/heat.css';
import './atlas.css';
import '@/ui/target-list.css';
import { Title } from '@/ui/Title';

const PATTERNS: LinePattern[] = ['solid', 'dashed', 'dotted'];

/** Sem nenhuma fonte conferida = marca [a verificar]. */
const unverifiedOf = (src: readonly { refId: string }[]) => !src.some((s) => getReference(s.refId)?.verified === true);

/** Parte em foco pela URL (`?parte=deltoid_ant`): dá para mandar o link da parte. */
function usePart(m: MuscleDef): [string | undefined, (part: string | undefined) => void] {
  const search = useSearch();
  const [, navigate] = useLocation();
  const raw = new URLSearchParams(search).get('parte') ?? undefined;
  const part = m.parts.length > 1 && m.parts.some((p) => p.id === raw) ? raw : undefined;
  const setPart = (p: string | undefined) => navigate(`/atlas/${m.id}${p ? `?parte=${p}` : ''}`, { replace: true });
  return [part, setPart];
}

function Stage({ m, part, setPart }: { m: MuscleDef; part: string | undefined; setPart: (p: string | undefined) => void }) {
  const [, navigate] = useLocation();
  const E = t.atlas.ex;
  useEffect(() => {
    useAtlas.getState().reset({ kind: 'muscle', id: m.id, side: 'r' }, defaultView(m.group));
  }, [m]);
  // A parte muda sem refazer a página: só a seleção (e a câmera voa até ela).
  useEffect(() => {
    const st = useAtlas.getState();
    const sel = st.selection;
    if (sel?.kind === 'muscle' && sel.id === m.id && sel.part === part) return;
    st.select({ kind: 'muscle', id: m.id, side: sel?.side ?? 'r', part }, { fly: true });
  }, [m, part]);
  const onTap = (p: Pick) => {
    if (p.kind === 'muscle' && p.id !== m.id) navigate(`/atlas/${p.id}${p.part ? `?parte=${p.part}` : ''}`);
    else if (p.kind === 'muscle' && p.part !== part) setPart(p.part);
    else if (p.kind === 'muscle') useAtlas.getState().frame();
  };
  return (
    <figure className="atlas-stage">
      <CameraBar compact />
      <Viewport
        label={`${t.atlas.figure} ${m.name}.`}
        className="atlas-stage__slot"
        onTap={onTap}
        hoverText={(name, p) => (p.kind === 'muscle' && p.id !== m.id ? E.hoverOpen(name) : p.kind === 'muscle' && p.part !== part ? E.hoverPart(name) : null)}
      />
      {m.parts.length > 1 && <PartPicker muscle={m} selection={{ kind: 'muscle', id: m.id, side: 'r', part }} onPick={setPart} />}
      <details className="atlas-stage__more">
        <summary className="chip chip--small">{`${E.layers} e ${E.tools.toLowerCase()}`}</summary>
        <div className="atlas-stage__more-body">
          <LayerControls />
          <ToolControls />
        </div>
      </details>
      <figcaption className="atlas-stage__hint">{t.atlas.pickHint}</figcaption>
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
        <span className="curve__axis">eixo: {c.axisLabel.toLowerCase()}, em graus</span>
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
          description={describe(A.length, c, (s) => s.length.map((v) => v * 100), 'por cento')}
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
          description={describe(A.arm, c, (s) => s.arm.map((v) => v * 100), 'centímetros')}
        />
      </div>
    </div>
  );
}

function Curves({ m, part }: { m: MuscleDef; part: string | undefined }) {
  const curves = useMemo(() => actionCurves(m, part), [m, part]);
  if (curves.length === 0) return <p className="section__note">{t.atlas.noModel}</p>;
  return (
    <div className="curve-list">
      {curves.map((c) => (
        <CurveCard key={c.key} c={c} />
      ))}
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
  return <MuscleBody m={m} />;
}

function MuscleBody({ m }: { m: MuscleDef }) {
  const A = t.atlas;
  const [part, setPart] = usePart(m);
  const partDef = part ? m.parts.find((p) => p.id === part) : undefined;
  const actions = m.actions.filter((a) => actionHasPart(a, part));
  const uses = exercisesForMuscle(m.id);

  return (
    <main id="conteudo" className="sheet atlas-page">
      <header className="sheet__head atlas-page__head">
        <Link href="/atlas" className="sheet__plate sheet__plate--link">
          {A.back}
        </Link>
        <Title text={m.name} />
        <p className="atlas-page__latin latin">{m.latin}</p>
        <p className="atlas-page__group">{t.groups[m.group]}</p>
      </header>

      <Stage m={m} part={part} setPart={setPart} />

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
            <h2 id="mu-act">{partDef ? A.actionsOfPart(partDef.name) : A.actions}</h2>
            <p>{A.actionsNote}</p>
          </header>
          <ul className="action-list">
            {actions.map((a) => {
              const parts = a.parts?.map((p) => m.parts.find((x) => x.id === p)?.name ?? p);
              const mv = movementById(a.movement);
              const gap = a.unmodeled ?? (mv && !mv.dof ? mv.note : undefined);
              return (
                <li key={`${a.movement}-${a.parts?.join() ?? ''}`} data-role={a.role}>
                  <span className="action-list__name">{mv?.label ?? a.movement}</span>
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
            })}
          </ul>
        </section>

        <section className="section" aria-labelledby="mu-model">
          <header className="section__head">
            <h2 id="mu-model">{A.modelTitle}</h2>
            <p>{A.modelNote}</p>
            <EvidenceSeal confidence="especulativo" />
          </header>
          <Curves m={m} part={part} />
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
