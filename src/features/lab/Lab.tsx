import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'wouter';
import { LineChart, type ChartSeries } from '@/charts/LineChart';
import { getReference } from '@/data';
import type { Confidence } from '@/data/schema/evidence';
import { depthAt } from '@/engine/exercises/squat';
import { fmt, t } from '@/i18n/app';
import { useStage } from '@/scene/stageStore';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { effortRefs, rawEffort, sampleAt } from './derive';
import { getLabBody, seriesFor, squat, TRACKED_MUSCLES, variantById, type VariantSeries } from './model';
import { LabSettingsPanel } from './Settings';
import { PATTERNS, useLab, useLabSlots } from './store';
import { Scrubber } from './Scrubber';
import './lab.css';
import { TableWrap } from '@/ui/TableWrap';

const N = 49;
const X = Array.from({ length: N }, (_, i) => i / (N - 1));

function useSeries(): VariantSeries[] {
  const ids = useLab((s) => s.variantIds);
  const settings = useLab((s) => s.settings);
  return useMemo(() => {
    const body = getLabBody(settings);
    return ids.map((id) => seriesFor(body, variantById(id), settings, N));
  }, [ids, settings]);
}

function PatternKey({ i }: { i: number }) {
  const p = PATTERNS[i] ?? 'solid';
  return (
    <svg className="pattern-key" viewBox="0 0 28 8" aria-hidden="true">
      <line x1="1" y1="4" x2="27" y2="4" strokeDasharray={p === 'dashed' ? '6 4' : p === 'dotted' ? '1.4 3.4' : undefined} strokeLinecap={p === 'dotted' ? 'round' : 'butt'} />
    </svg>
  );
}

function VariantPicker() {
  const ids = useLab((s) => s.variantIds);
  const toggle = useLab((s) => s.toggleVariant);
  return (
    <fieldset className="variant-picker">
      <legend className="variant-picker__legend">{t.lab.variants}</legend>
      <div className="variant-picker__list">
        {squat.variants.map((v) => {
          const i = ids.indexOf(v.id);
          return (
            <button key={v.id} type="button" className="chip" aria-pressed={i >= 0} onClick={() => toggle(v.id)}>
              {i >= 0 && <PatternKey i={i} />}
              <span>{v.label}</span>
            </button>
          );
        })}
      </div>
      <p className="variant-picker__hint">{t.lab.variantsHint}</p>
    </fieldset>
  );
}

function ViewSlot({ id, index }: { id: string; index: number }) {
  const setSlot = useLabSlots((s) => s.setSlot);
  const setOverlay = useLabSlots((s) => s.setOverlay);
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const v = variantById(id);
  useEffect(() => {
    setSlot(id, ref.current);
    setHost(document.getElementById('stage-overlay'));
    return () => setSlot(id, null);
  }, [id, setSlot]);
  return (
    <figure className="view-slot">
      <figcaption className="view-slot__cap">
        <PatternKey i={index} />
        <span className="view-slot__name">{v.label}</span>
        {index === 0 && <span className="view-slot__ref">{t.lab.primary}</span>}
      </figcaption>
      <div ref={ref} className="view-slot__stage" role="img" aria-label={t.lab.viewFigure(v.label)} />
      {host &&
        createPortal(
          <div
            className="view-overlay"
            data-balanced="true"
            ref={(el) => {
              setOverlay(id, el);
            }}
          >
            <svg className="view-overlay__svg" aria-hidden="true">
              <line data-k="floor" className="ov-floor" />
              <line data-k="midfoot" className="ov-floor" />
              <line data-k="com" className="ov-com" />
              <circle data-k="com-dot" r="3.5" className="ov-com-dot" />
              <line data-k="hip-arm" className="ov-arm" />
              <line data-k="hip-tick" className="ov-tick" />
              <text data-k="hip-label" className="ov-label" textAnchor="middle" />
              <line data-k="knee-arm" className="ov-arm" />
              <line data-k="knee-tick" className="ov-tick" />
              <text data-k="knee-label" className="ov-label" textAnchor="middle" />
              <path data-k="knee-arc" className="ov-arc" />
              <text data-k="knee-angle" className="ov-angle" textAnchor="middle" />
              <line data-k="trunk-ref" className="ov-ref" />
              <path data-k="trunk-arc" className="ov-arc" />
              <text data-k="trunk-angle" className="ov-angle" textAnchor="middle" />
            </svg>
            <p className="view-overlay__warn">{t.lab.unbalanced}</p>
          </div>,
          host,
        )}
    </figure>
  );
}

function Readouts({ series }: { series: VariantSeries[] }) {
  const tt = useLab((s) => s.t);
  const u = depthAt(tt);
  const first = series[0];
  if (!first) return null;
  const r = sampleAt(first.frames, u);
  const phase = Math.abs(tt - 0.5) < 0.02 ? t.lab.readouts.phaseBottom : tt < 0.5 ? t.lab.readouts.phaseDown : t.lab.readouts.phaseUp;
  return (
    <dl className="readouts" aria-live="off">
      <div className="readouts__item readouts__item--lead">
        <dt>
          {t.lab.readouts.knee} <span className="readouts__phase">{phase}</span>
        </dt>
        <dd>
          {fmt.n0(r.knee)}
          <span className="readouts__unit">{t.lab.readouts.unitDeg}</span>
        </dd>
      </div>
      <div className="readouts__item">
        <dt>{t.lab.readouts.trunk}</dt>
        <dd>
          {fmt.n0(r.trunk)}
          <span className="readouts__unit">{t.lab.readouts.unitDeg}</span>
        </dd>
      </div>
      <div className="readouts__item">
        <dt>
          {t.lab.readouts.hipMoment} <span className="readouts__phase">{t.lab.readouts.perLeg}</span>
        </dt>
        <dd>
          {fmt.n0(r.hipM)}
          <span className="readouts__unit">{t.lab.readouts.unitNm}</span>
        </dd>
      </div>
      <div className="readouts__item">
        <dt>
          {t.lab.readouts.kneeMoment} <span className="readouts__phase">{t.lab.readouts.perLeg}</span>
        </dt>
        <dd>
          {fmt.n0(r.kneeM)}
          <span className="readouts__unit">{t.lab.readouts.unitNm}</span>
        </dd>
      </div>
    </dl>
  );
}

const seriesOf = (all: VariantSeries[], pick: (s: VariantSeries) => number[]): ChartSeries[] =>
  all.map((s, i) => ({ id: s.variant.id, label: s.variant.label, values: pick(s), pattern: PATTERNS[i] ?? 'solid' }));

function describe(title: string, all: VariantSeries[], pick: (s: VariantSeries) => number[], unit: string) {
  return `${title}: ` + all.map((s) => {
    const v = pick(s);
    return `${s.variant.label} vai de ${fmt.n0(v[0] ?? 0)} a ${fmt.n0(v[v.length - 1] ?? 0)} ${unit}, máximo ${fmt.n0(Math.max(...v))}`;
  }).join('; ');
}

function Charts({ series }: { series: VariantSeries[] }) {
  const tt = useLab((s) => s.t);
  const u = depthAt(tt);
  const refs = useMemo(() => effortRefs(series), [series]);
  const efforts = useMemo(() => series.map(rawEffort), [series]);
  const first = series[0];
  const deg = (v: number) => `${Math.round(v)}°`;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const c = t.lab.charts;

  const angle = (title: string, pick: (s: VariantSeries) => number[]) => (
    <LineChart title={title} unit="graus" x={X} series={seriesOf(series, pick)} marker={u} yFormat={deg} description={describe(title, series, pick, 'graus')} />
  );
  const moment = (title: string, pick: (s: VariantSeries) => number[], band?: number[], footer?: string) => (
    <LineChart
      title={title}
      unit="N·m por perna"
      x={X}
      series={seriesOf(series, pick)}
      marker={u}
      zeroLine
      {...(band ? { band: { label: 'esforço', values: band } } : {})}
      footer={footer}
      description={describe(title, series, pick, 'newton-metro')}
    />
  );
  const bandOf = (vals: number[] | undefined) => {
    if (!vals) return undefined;
    const m = Math.max(...vals, 1e-6);
    return vals.map((v) => Math.pow(v / m, 2.2));
  };

  return (
    <>
      <section className="section" aria-labelledby="sec-angles">
        <header className="section__head">
          <h2 id="sec-angles">{t.lab.sections.angles}</h2>
          <p>{t.lab.sections.anglesNote}</p>
        </header>
        <div className="chart-grid">
          {angle(c.knee, (s) => s.frames.map((f) => f.angles.knee))}
          {angle(c.trunk, (s) => s.frames.map((f) => f.angles.trunk))}
          {angle(c.hip, (s) => s.frames.map((f) => f.angles.hip))}
          {angle(c.ankle, (s) => s.frames.map((f) => f.angles.ankle))}
        </div>
      </section>

      <section className="section" aria-labelledby="sec-torque">
        <header className="section__head">
          <h2 id="sec-torque">{t.lab.sections.torque}</h2>
          <p>{t.lab.sections.torqueNote}</p>
          <EvidenceSeal confidence="provavel" />
        </header>
        <div className="chart-grid">
          {moment(c.hipM, (s) => s.frames.map((f) => f.demand.hip.moment), bandOf(efforts[0]?.hip))}
          {moment(c.kneeM, (s) => s.frames.map((f) => f.demand.knee.moment), bandOf(efforts[0]?.knee))}
          {moment(c.ankleM, (s) => s.frames.map((f) => f.demand.ankle.moment), undefined, c.ankleNoCap)}
        </div>
      </section>

      <section className="section" aria-labelledby="sec-effort">
        <header className="section__head">
          <h2 id="sec-effort">{t.lab.sections.effort}</h2>
          <p>{t.lab.sections.effortNote}</p>
          <EvidenceSeal confidence="especulativo" unverified />
        </header>
        <div className="chart-grid">
          {(['hip', 'knee'] as const).map((j) => {
            const title = j === 'hip' ? c.hipE : c.kneeE;
            const pick = (s: VariantSeries) => (efforts[series.indexOf(s)]?.[j] ?? []).map((v) => v / refs[j]);
            return <LineChart key={j} title={title} unit="índice" x={X} series={seriesOf(series, pick)} marker={u} yDomain={[0, 1]} yFormat={(v) => fmt.n1(v)} description={describe(title, series, (s) => pick(s).map((v) => v * 100), 'por cento do pico')} />;
          })}
        </div>
      </section>

      <section className="section" aria-labelledby="sec-length">
        <header className="section__head">
          <h2 id="sec-length">{t.lab.sections.length}</h2>
          <p>{t.lab.sections.lengthNote}</p>
          <EvidenceSeal confidence="especulativo" />
        </header>
        <div className="chart-grid">
          {TRACKED_MUSCLES.map((m) => {
            const pick = (s: VariantSeries) => s.lengths[m.key] ?? [];
            return (
              <LineChart
                key={m.key}
                title={m.label}
                unit={m.biarticular ? 'biarticular' : '% do comprimento em pé'}
                x={X}
                series={seriesOf(series, pick)}
                marker={u}
                zeroLine
                yFormat={pct}
                description={describe(m.label, series, (s) => pick(s).map((v) => v * 100), 'por cento')}
              />
            );
          })}
        </div>
      </section>

      {first && <NumberTable series={series} u={u} />}
    </>
  );
}

function NumberTable({ series, u }: { series: VariantSeries[]; u: number }) {
  return (
    <section className="section" aria-labelledby="sec-table">
      <header className="section__head">
        <h2 id="sec-table">{t.lab.sections.table}</h2>
      </header>
      <TableWrap label={t.lab.sections.table}>
        <table className="num-table">
          <thead>
            <tr>
              <th scope="col">Variação</th>
              <th scope="col">Joelho</th>
              <th scope="col">Quadril</th>
              <th scope="col">Tronco</th>
              <th scope="col">Lombar</th>
              <th scope="col">M quadril</th>
              <th scope="col">Braço quadril</th>
              <th scope="col">M joelho</th>
              <th scope="col">Braço joelho</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => {
              const r = sampleAt(s.frames, u);
              return (
                <tr key={s.variant.id}>
                  <th scope="row">{s.variant.label}</th>
                  <td>{fmt.n0(r.knee)}°</td>
                  <td>{fmt.n0(r.hip)}°</td>
                  <td>{fmt.n0(r.trunk)}°</td>
                  <td>{fmt.n0(r.lumbar)}°</td>
                  <td>{fmt.n0(r.hipM)} N·m</td>
                  <td>{fmt.n1(r.hipArm * 100)} cm</td>
                  <td>{fmt.n0(r.kneeM)} N·m</td>
                  <td>{fmt.n1(r.kneeArm * 100)} cm</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </section>
  );
}

function ModelNotes({ series }: { series: VariantSeries[] }) {
  const refIds = useMemo(() => {
    const ids = new Set<string>(['statics_textbook', 'deleva1996', 'winter2009', 'knee_torque_angle_lit', 'hip_torque_hhd_2017', 'hip_torque_angle_2019', 'sbl_authored']);
    series.forEach((s) => s.variant.rationale.source.forEach((r) => ids.add(r.refId)));
    return [...ids];
  }, [series]);
  return (
    <section className="section section--notes" aria-labelledby="sec-model">
      <header className="section__head">
        <h2 id="sec-model">{t.lab.model.title}</h2>
        <p>{t.lab.model.lead}</p>
      </header>
      <ul className="variant-notes">
        {series.map((s, i) => (
          <li key={s.variant.id}>
            <span className="variant-notes__name">
              <PatternKey i={i} /> {s.variant.label}
            </span>
            <p className="prose variant-notes__text">{s.variant.rationale.text}</p>
            <EvidenceSeal confidence={s.variant.rationale.confidence} />
            {s.variant.rationale.note && <p className="variant-notes__note">{s.variant.rationale.note}</p>}
          </li>
        ))}
      </ul>
      <ol className="assumptions">
        {t.lab.model.items.map((it) => (
          <li key={it.text}>
            <EvidenceSeal confidence={it.confidence as Confidence} unverified={'unverified' in it && Boolean(it.unverified)} compact />
            <span>{it.text}</span>
          </li>
        ))}
      </ol>
      <h3 className="sources__title">{t.lab.model.sources}</h3>
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
      <p className="disclaimer">{t.lab.model.disclaimer}</p>
    </section>
  );
}

export default function Lab() {
  const setScene = useStage((s) => s.setScene);
  const ids = useLab((s) => s.variantIds);
  const setEffortRef = useLab((s) => s.setEffortRef);
  const series = useSeries();

  useEffect(() => {
    setScene('lab');
    return () => setScene('none');
  }, [setScene]);
  useEffect(() => setEffortRef(effortRefs(series)), [series, setEffortRef]);

  return (
    <main id="conteudo" className="lab">
      <header className="lab__head">
        <p className="lab__plate">{t.lab.plate}</p>
        <h1 className="lab__title">{t.lab.title}</h1>
        <p className="lab__lead prose">{t.lab.lead}</p>
      </header>

      {/* O bloco 3D fica fixo só dentro da análise; registro e notas vêm depois, sem ele por cima. */}
      <div className="lab__analysis">
        <div className="lab__stage-block">
          <div className="lab__views" data-count={ids.length}>
            {ids.map((id, i) => (
              <ViewSlot key={id} id={id} index={i} />
            ))}
          </div>
          <Readouts series={series} />
        </div>
        <div className="lab__body">
          <VariantPicker />
          <Charts series={series} />
          <LabSettingsPanel />
        </div>
      </div>
      <div className="lab__after">
        <section className="section lab-log" aria-labelledby="sec-log">
          <header className="section__head">
            <h2 id="sec-log">{t.lab.log.title}</h2>
            <p>{t.lab.log.body}</p>
          </header>
          <Link href="/treino?exercicio=squat" className="btn-secondary">
            {t.lab.log.link}
          </Link>
        </section>
        <ModelNotes series={series} />
      </div>
      <Scrubber series={series} />
    </main>
  );
}
