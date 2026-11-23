import { useEffect, useId, useMemo, useRef } from 'react';
import { Link } from 'wouter';
import { LineChart, type ChartSeries } from '@/charts/LineChart';
import { XYChart } from '@/charts/XYChart';
import { getReference } from '@/data';
import type { Confidence } from '@/data/schema/evidence';
import { fmt, t } from '@/i18n/app';
import { useStage } from '@/scene/stageStore';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { TableWrap } from '@/ui/TableWrap';
import { Title } from '@/ui/Title';
import { exerciseById, muscleById } from '@/features/library/catalog';
import { valueAt } from '@/features/library/player/lengths';
import { LabTabs } from '../LabTabs';
import { PATTERNS } from '../store';
import { analyze, chosenOptions, clipView, comparableTargets, exercisesTargeting, specLabel, variationsFor, type Analysis } from './analysis';
import { COMPARE_VIEWS, decodeQuery, encodeQuery, MAX_EXERCISES, uAtPhase, useCompare, useCompareSlots, type Slot } from './store';
import '../lab.css';
import './compare.css';
import { LengthLegend } from '@/ui/LengthLegend';
import { exerciseHref } from '@/app/routes';

const C = t.labCompare;
const PERIOD_S = 3.2;

function PatternKey({ i }: { i: number }) {
  const p = PATTERNS[i] ?? 'solid';
  return (
    <svg className="pattern-key" viewBox="0 0 28 8" aria-hidden="true">
      <line x1="1" y1="4" x2="27" y2="4" strokeDasharray={p === 'dashed' ? '6 4' : p === 'dotted' ? '1.4 3.4' : undefined} strokeLinecap={p === 'dotted' ? 'round' : 'butt'} />
    </svg>
  );
}

/** Estado inicial pela URL (compartilhável); o resto cai no padrão. */
function useUrlState() {
  const setMuscle = useCompare((s) => s.setMuscle);
  const muscle = useCompare((s) => s.muscle);
  const specs = useCompare((s) => s.specs);
  const ready = useRef(false);
  useEffect(() => {
    const q = decodeQuery(window.location.search);
    const targets = comparableTargets();
    const known = q.specs.filter((s) => exerciseById(s.exercise));
    let m = q.muscle && targets.includes(q.muscle) ? q.muscle : null;
    // Só o exercício (link da biblioteca): o primeiro alvo dele que dá para comparar.
    if (!m && known[0]) m = exerciseById(known[0].exercise)?.targets.find((x) => x.role === 'alvo' && targets.includes(x.muscle))?.muscle ?? null;
    if (m) {
      const ok = known.filter((s) => exercisesTargeting(m).some((e) => e.id === s.exercise));
      const fill = exercisesTargeting(m)
        .map((e) => ({ exercise: e.id, options: {} }))
        .filter((s) => !ok.some((o) => o.exercise === s.exercise));
      setMuscle(m, [...ok, ...fill].slice(0, Math.max(ok.length, Math.min(MAX_EXERCISES, 2))));
    }
  }, [setMuscle]);
  useEffect(() => {
    // A primeira passada ainda vê o estado de antes da leitura da URL: não escreve (senão apagaria a URL recebida).
    if (!ready.current) {
      ready.current = true;
      return;
    }
    const url = window.location.pathname + encodeQuery(muscle, specs);
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
  }, [muscle, specs]);
}

function TargetPicker() {
  const muscle = useCompare((s) => s.muscle);
  const setMuscle = useCompare((s) => s.setMuscle);
  const groups = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const id of comparableTargets()) {
      const g = muscleById(id)?.group ?? 'other';
      out.set(g, [...(out.get(g) ?? []), id]);
    }
    return [...out];
  }, []);
  return (
    <label className="field compare-target">
      <span>{C.target}</span>
      <select
        value={muscle}
        onChange={(e) => {
          const m = e.target.value;
          setMuscle(m, exercisesTargeting(m).slice(0, MAX_EXERCISES).map((x) => ({ exercise: x.id, options: {} })));
        }}
      >
        {groups.map(([g, ids]) => (
          <optgroup key={g} label={(t.groups as Record<string, string>)[g] ?? g}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {muscleById(id)?.name ?? id}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function ExercisePicker() {
  const muscle = useCompare((s) => s.muscle);
  const specs = useCompare((s) => s.specs);
  const toggle = useCompare((s) => s.toggleExercise);
  return (
    <fieldset className="variant-picker">
      <legend className="variant-picker__legend">{C.exercises}</legend>
      <div className="variant-picker__list">
        {exercisesTargeting(muscle).map((e) => {
          const i = specs.findIndex((s) => s.exercise === e.id);
          return (
            <button key={e.id} type="button" className="chip" aria-pressed={i >= 0} onClick={() => toggle(e.id)}>
              {i >= 0 && <PatternKey i={i} />}
              <span>{e.name}</span>
            </button>
          );
        })}
      </div>
      <p className="variant-picker__hint">{C.exercisesHint(MAX_EXERCISES)}</p>
    </fieldset>
  );
}

function VariationControls({ slot }: { slot: Slot }) {
  const setOption = useCompare((s) => s.setOption);
  const chosen = chosenOptions(slot);
  if (!chosen.length) return null;
  return (
    <div className="compare-vars">
      {chosen.map(({ variation, option }) => (
        <div key={variation.id} className="compare-vars__row" role="group" aria-label={`${variation.label}, ${exerciseById(slot.exercise)?.name ?? ''}`}>
          <span className="compare-vars__label">{variation.label}</span>
          {variation.options.map((o) => (
            <button key={o.id} type="button" className="chip chip--small" aria-pressed={o.id === option.id} onClick={() => setOption(slot.key, variation.id, o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Readout({ analysis, u }: { analysis: Analysis | null; u: number }) {
  const len = analysis ? valueAt(analysis.u, analysis.length, u) : null;
  const load = analysis?.dof ? valueAt(analysis.u, analysis.profile, u) : null;
  return (
    <dl className="lane__read" aria-live="off">
      <div>
        <dt>{C.readLength}</dt>
        <dd>{len === null ? '–' : `${len >= 0 ? '+' : ''}${fmt.n0(len)}%`}</dd>
      </div>
      <div>
        <dt>{C.readLoad}</dt>
        <dd>{load === null ? '–' : fmt.n1(load)}</dd>
      </div>
    </dl>
  );
}

/** Recorte onde o palco desenha a raia. */
function useLaneSlot(key: string) {
  const setSlot = useCompareSlots((s) => s.setSlot);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSlot(key, ref.current);
    return () => setSlot(key, null);
  }, [key, setSlot]);
  return ref;
}

function Lane({ slot, index, analysis, u }: { slot: Slot; index: number; analysis: Analysis | null; u: number }) {
  const duplicate = useCompare((s) => s.duplicate);
  const remove = useCompare((s) => s.remove);
  const count = useCompare((s) => s.specs.length);
  const ref = useLaneSlot(slot.key);
  const name = specLabel(slot);
  return (
    <figure className="lane">
      <div ref={ref} className="lane__stage viewport" role="img" aria-label={C.viewFigure(name)} />
      <figcaption className="lane__cap">
        <span className="lane__row">
          <PatternKey i={index} />
          <span className="lane__name">{exerciseById(slot.exercise)?.name ?? slot.exercise}</span>
          <span className="lane__actions">
          {variationsFor(slot.exercise).length > 0 && count < MAX_EXERCISES && (
            <button type="button" className="compare-act" aria-label={C.duplicateLabel(name)} onClick={() => duplicate(slot.key)}>
              {C.duplicate}
            </button>
          )}
          {count > 1 && (
            <button type="button" className="compare-act" aria-label={C.removeLabel(name)} onClick={() => remove(slot.key)}>
              {C.remove}
            </button>
          )}
          </span>
        </span>
        <Readout analysis={analysis} u={u} />
        <VariationControls slot={slot} />
      </figcaption>
    </figure>
  );
}

type Item = { slot: Slot; a: Analysis | null; label: string };

function Lanes({ items, u }: { items: readonly Item[]; u: number }) {
  return (
    <div className="compare-lanes" data-count={items.length}>
      {items.map(({ slot, a }, i) => (
        <Lane key={slot.key} slot={slot} index={i} analysis={a} u={u} />
      ))}
    </div>
  );
}

function Transport() {
  const phase = useCompare((s) => s.phase);
  const playing = useCompare((s) => s.playing);
  const setPhase = useCompare((s) => s.setPhase);
  const setPlaying = useCompare((s) => s.setPlaying);
  const id = useId();

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setPhase(useCompare.getState().phase + dt / PERIOD_S);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setPhase]);

  const u = uAtPhase(phase);
  const pct = Math.round(u * 100);
  const ticks = Array.from({ length: 41 }, (_, i) => i / 40);
  return (
    <div className="scrubber" role="group" aria-label={C.scrub}>
      <button type="button" className="scrubber__play" aria-pressed={playing} aria-label={playing ? t.lab.scrub.pause : t.lab.scrub.play} onClick={() => setPlaying(!playing)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}
        </svg>
      </button>
      <div className="scrubber__track">
        <label htmlFor={id} className="visually-hidden">
          {C.scrub}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(u * 1000)}
          onChange={(e) => {
            setPlaying(false);
            // Régua = u (alongado → encurtado); a fase volta pelo cosseno, na metade de ida.
            setPhase(Math.acos(1 - 2 * (Number(e.target.value) / 1000)) / (2 * Math.PI));
          }}
          aria-valuetext={C.scrubValue(pct)}
        />
        <div className="scrubber__ruler" aria-hidden="true">
          {ticks.map((x) => (
            <span key={x} style={{ left: `${x * 100}%` }} data-major={Math.round(x * 40) % 10 === 0} />
          ))}
        </div>
        <div className="scrubber__labels" aria-hidden="true">
          <span>{C.stretched}</span>
          <span>{C.shortened}</span>
        </div>
      </div>
      <output className="scrubber__out" htmlFor={id}>
        {pct}
        <span>%</span>
      </output>
    </div>
  );
}

function ViewBar() {
  const view = useCompare((s) => s.view);
  const setView = useCompare((s) => s.setView);
  const skin = useCompare((s) => s.skin);
  const setSkin = useCompare((s) => s.setSkin);
  return (
    <div className="compare-bar">
      <div className="compare-bar__views" role="group" aria-label={C.views.label}>
        {COMPARE_VIEWS.map((v) => (
          <button key={v} type="button" className="chip chip--small" aria-pressed={view === v} onClick={() => setView(v)}>
            {C.views[v]}
          </button>
        ))}
      </div>
      <button type="button" className="chip chip--small" aria-pressed={skin} onClick={() => setSkin(!skin)}>
        {C.skin}
      </button>
    </div>
  );
}

const X = Array.from({ length: 41 }, (_, i) => i / 40);

function describe(title: string, rows: { label: string; v: readonly number[] }[], unit: string) {
  return `${title}: ${rows.map((r) => `${t.sr.goes(r.label, fmt.n0(r.v[0] ?? 0), fmt.n0(r.v[r.v.length - 1] ?? 0), unit)}, ${t.sr.max(fmt.n0(Math.max(...r.v)))}`).join('; ')}`;
}

function Charts({ items, u }: { items: Item[]; u: number }) {
  const withA = items.flatMap((it, i) => (it.a ? [{ ...it, a: it.a, i }] : []));
  const withDof = withA.filter((x) => x.a.dof);
  const ser = (list: typeof withA, pick: (a: Analysis) => readonly number[]): ChartSeries[] =>
    list.map((x) => ({ id: x.slot.key, label: x.label, values: pick(x.a), pattern: PATTERNS[x.i] ?? 'solid' }));
  const rows = (list: typeof withA, pick: (a: Analysis) => readonly number[]) => list.map((x) => ({ label: x.label, v: pick(x.a) }));
  const xl: [string, string] = [C.stretched, C.shortened];
  const cm = (v: number) => fmt.n0(v);
  const joints = [...new Set(withDof.map((x) => x.a.motion).filter(Boolean))].join(' · ');

  return (
    <>
      <section className="section" aria-labelledby="cmp-length">
        <header className="section__head">
          <h2 id="cmp-length">{C.sections.length}</h2>
          <p>{C.sections.lengthNote}</p>
          <EvidenceSeal confidence="especulativo" />
        </header>
        <LineChart
          title={C.charts.length}
          unit={C.charts.lengthUnit}
          x={X}
          series={ser(withA, (a) => a.length)}
          marker={u}
          zeroLine
          xLabels={xl}
          yFormat={(v) => `${Math.round(v)}%`}
          description={describe(C.charts.length, rows(withA, (a) => a.length), t.sr.pct)}
        />
      </section>

      {withDof.length > 0 && (
        <section className="section" aria-labelledby="cmp-load">
          <header className="section__head">
            <h2 id="cmp-load">{C.sections.load}</h2>
            <p>
              {C.sections.loadNote} {joints && <strong>{joints}.</strong>}
            </p>
            <EvidenceSeal confidence="provavel" />
          </header>
          <div className="chart-grid">
            <LineChart
              title={C.charts.load}
              unit={C.charts.loadUnit}
              x={X}
              series={ser(withDof, (a) => a.load)}
              marker={u}
              zeroLine
              xLabels={xl}
              yFormat={cm}
              description={describe(C.charts.load, rows(withDof, (a) => a.load), t.sr.cm)}
            />
            <XYChart
              title={C.charts.profile}
              unit={C.charts.profileUnit}
              xTitle={C.charts.profileX}
              series={withDof.map((x) => ({ id: x.slot.key, label: x.label, x: x.a.length, y: x.a.profile, pattern: PATTERNS[x.i] ?? 'solid' }))}
              marker={u}
              zeroLine
              yDomain={[Math.min(0, ...withDof.flatMap((x) => x.a.profile)), 1]}
              xFormat={(v) => `${Math.round(v)}%`}
              yFormat={(v) => fmt.n1(v)}
              description={`${C.sections.profile}: ${withDof.map((x) => t.sr.loadAtLongest(x.label, fmt.n0(x.a.loadAtLongest * 100))).join('; ')}`}
            />
          </div>
          <p className="compare-note">{C.sections.profileNote}</p>
        </section>
      )}

      {withDof.length > 0 && (
        <section className="section" aria-labelledby="cmp-arm">
          <header className="section__head">
            <h2 id="cmp-arm">{C.sections.arm}</h2>
            <p>{C.sections.armNote}</p>
            <EvidenceSeal confidence="especulativo" />
          </header>
          <div className="chart-grid">
            <LineChart
              title={C.charts.arm}
              unit={C.charts.armUnit}
              x={X}
              series={ser(withDof, (a) => a.arm)}
              marker={u}
              zeroLine
              xLabels={xl}
              yFormat={(v) => fmt.n1(v)}
              description={describe(C.charts.arm, rows(withDof, (a) => a.arm), t.sr.cm)}
            />
            <LineChart
              title={C.charts.angle}
              unit={C.charts.angleUnit}
              x={X}
              series={ser(withDof, (a) => a.angle)}
              marker={u}
              xLabels={xl}
              yFormat={(v) => `${Math.round(v)}°`}
              description={describe(C.charts.angle, rows(withDof, (a) => a.angle), t.sr.deg)}
            />
          </div>
        </section>
      )}
    </>
  );
}

function Summary({ items }: { items: Item[] }) {
  const T = C.table;
  const range = (v: readonly number[]) => C.table.rangeOf(fmt.n0(Math.min(...v)), fmt.n0(Math.max(...v)));
  return (
    <section className="section" aria-labelledby="cmp-table">
      <header className="section__head">
        <h2 id="cmp-table">{C.sections.table}</h2>
      </header>
      <TableWrap label={C.sections.table}>
        <table className="num-table">
          <thead>
            <tr>
              <th scope="col">{T.exercise}</th>
              <th scope="col">{T.joint}</th>
              <th scope="col">{T.range}</th>
              <th scope="col">{T.length}</th>
              <th scope="col">{T.atLongest}</th>
              <th scope="col">{T.peakAt}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ slot, a, label }) => (
              <tr key={slot.key}>
                <th scope="row">{label}</th>
                <td>{a?.motion ?? (a ? C.noDof : '–')}</td>
                <td>{a?.dof ? `${range(a.angle)}°` : '–'}</td>
                <td>{a ? `${range(a.length)}%` : '–'}</td>
                <td>{a?.dof ? `${fmt.n0(a.loadAtLongest * 100)}%` : '–'}</td>
                <td>{a?.dof ? `${a.lengthAtPeak >= 0 ? '+' : ''}${fmt.n0(a.lengthAtPeak)}%` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </section>
  );
}

function Notes({ items }: { items: Item[] }) {
  const vars = useMemo(() => [...new Map(items.flatMap(({ slot }) => variationsFor(slot.exercise)).map((v) => [`${v.exercise}/${v.id}`, v])).values()], [items]);
  const refIds = useMemo(() => {
    const ids = new Set<string>(['zanatomy', 'statics_textbook', 'sbl_authored']);
    for (const v of vars) v.evidence.source.forEach((s) => ids.add(s.refId));
    for (const { slot } of items) exerciseById(slot.exercise)?.length.source.forEach((s) => ids.add(s.refId));
    return [...ids];
  }, [vars, items]);
  return (
    <>
      {vars.length > 0 && (
        <section className="section" aria-labelledby="cmp-vars">
          <header className="section__head">
            <h2 id="cmp-vars">{C.sections.variations}</h2>
            <p>{C.sections.variationsNote}</p>
          </header>
          <ul className="variant-notes">
            {vars.map((v) => (
              <li key={`${v.exercise}/${v.id}`}>
                <span className="variant-notes__name">
                  {exerciseById(v.exercise)?.name} · {v.label.toLowerCase()}
                </span>
                <p className="prose variant-notes__text">{v.text}</p>
                <EvidenceSeal confidence={v.evidence.confidence} hypothesis />
                {v.evidence.note && <p className="variant-notes__note">{v.evidence.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="section section--notes" aria-labelledby="cmp-model">
        <header className="section__head">
          <h2 id="cmp-model">{C.model.title}</h2>
          <p>{C.model.lead}</p>
        </header>
        <ul className="variant-notes">
          {items.map(({ slot, label }) => {
            const e = exerciseById(slot.exercise);
            if (!e) return null;
            return (
              <li key={slot.key}>
                <span className="variant-notes__name">
                  <Link href={exerciseHref(e.id)}>{label}</Link>
                </span>
                <p className="prose variant-notes__text">{e.length.text}</p>
                <EvidenceSeal confidence={e.length.confidence} />
              </li>
            );
          })}
        </ul>
        <ol className="assumptions">
          {C.model.items.map((it) => (
            <li key={it.text}>
              <EvidenceSeal confidence={it.confidence as Confidence} compact />
              <span>{it.text}</span>
            </li>
          ))}
        </ol>
        <h3 className="sources__title">{C.model.sources}</h3>
        <ul className="sources">
          {refIds.map((id) => {
            const r = getReference(id);
            if (!r) return null;
            return (
              <li key={id}>
                {r.citation}
                {r.doi && <> doi:{r.doi}</>}
                {!r.verified && <span className="sources__flag"> {t.evidence.unverified}</span>}
              </li>
            );
          })}
        </ul>
        <p className="disclaimer">{C.model.disclaimer}</p>
      </section>
    </>
  );
}

export default function Compare() {
  const setScene = useStage((s) => s.setScene);
  const muscle = useCompare((s) => s.muscle);
  const specs = useCompare((s) => s.specs);
  const phase = useCompare((s) => s.phase);
  const u = uAtPhase(phase);
  useUrlState();

  useEffect(() => {
    setScene('compare');
    return () => setScene('none');
  }, [setScene]);
  useEffect(() => () => useCompare.getState().setPlaying(false), []);
  // Alvo novo: a vista do clipe do primeiro exercício (crucifixo de frente, puxada de costas, rosca de perfil).
  const first = specs[0]?.exercise;
  useEffect(() => {
    if (!first) return;
    useCompare.getState().setView(clipView(first));
  }, [muscle]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo<Item[]>(() => specs.map((slot) => ({ slot, a: analyze(slot, muscle), label: specLabel(slot) })), [specs, muscle]);

  return (
    <main id="conteudo" className="lab lab--compare">
      <header className="lab__head">
        <Title text={C.title} className="lab__title page-title" />
        <div className="lab__intro">
          <p className="lab__lead prose">{C.lead}</p>
          <LabTabs />
        </div>
      </header>

      <ViewBar />
      <Lanes items={items} u={u} />
      <div className="compare-body">
        <LengthLegend className="compare-legend" />
        <div className="compare-pick">
          <TargetPicker />
          <ExercisePicker />
        </div>
        <details className="compare-panel" open>
          <summary className="compare-panel__head">{C.panel}</summary>
          <Charts items={items} u={u} />
        </details>
        <Summary items={items} />
        <Notes items={items} />
      </div>
      <Transport />
    </main>
  );
}
