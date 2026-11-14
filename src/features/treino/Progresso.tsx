import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { LineChart, type ChartSeries } from '@/charts/LineChart';
import trainingJson from '@/data/training.json';
import { E1RM_MAX_REPS, exerciseProgress } from '@/engine/training/progress';
import { e1rmRecords, repRecords } from '@/engine/training/records';
import { fmt, t } from '@/i18n/app';
import { repository } from '@/storage/db';
import { MEASURE_KINDS, type Measure, type MeasureKind, type SetEntry, type Unit } from '@/storage/types';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { getReference } from '@/data';
import type { Confidence } from '@/data/schema/evidence';
import { exerciseName, NothingLogged, parseLoad, shortDateFmt, StoreError, StoreLoading, TreinoHeader } from './shared';
import { TableWrap } from '@/ui/TableWrap';
import { fmtLoad, fromKg, toKg, useUnit } from './units';

const e1rmEvidence = trainingJson.e1rm.maxReps;

function ExerciseChart({ sets, exerciseId, unit }: { sets: readonly SetEntry[]; exerciseId: string; unit: Unit }) {
  const L = t.training.progress;
  const u = (kg: number) => fromKg(kg, unit);
  const points = useMemo(() => exerciseProgress(sets, exerciseId), [sets, exerciseId]);
  const best = points.reduce<{ v: number; at: number } | null>((b, p) => (p.e1rm !== undefined && (!b || p.e1rm > b.v) ? { v: p.e1rm, at: p.at } : b), null);

  if (points.length === 0) return <p className="logger__empty">{L.none}</p>;

  const first = points[0];
  const last = points[points.length - 1];
  let chart = null;
  if (first && last && points.length >= 2) {
    const span = last.at - first.at || 1;
    const x = points.map((p) => (p.at - first.at) / span);
    const series: ChartSeries[] = [];
    // e1RM só entra se toda sessão tiver estimativa: buraco na linha enganaria.
    if (points.every((p) => p.e1rm !== undefined)) series.push({ id: 'e1rm', label: L.e1rm, values: points.map((p) => u(p.e1rm ?? 0)), pattern: 'solid' });
    series.push({ id: 'top', label: L.top, values: points.map((p) => u(p.top.loadKg)), pattern: 'dashed' });
    const lo = Math.min(...series.flatMap((s) => s.values));
    chart = (
      <LineChart
        title={L.chartTitle}
        unit={unit}
        x={x}
        series={series}
        marker={1}
        reveal={false}
        yDomain={[Math.max(0, Math.floor(lo * 0.9)), Math.max(...series.flatMap((s) => s.values))]}
        yFormat={(v) => fmt.n0(v)}
        xLabels={[shortDateFmt.format(first.at), shortDateFmt.format(last.at)]}
        description={L.chartDescription(exerciseName(exerciseId), points.length)}
        footer={
          <ul className="progress__legend">
            {series.map((s) => (
              <li key={s.id}>
                <svg className="pattern-key" viewBox="0 0 28 8" aria-hidden="true">
                  <line x1="1" y1="4" x2="27" y2="4" strokeDasharray={s.pattern === 'dashed' ? '6 4' : undefined} />
                </svg>
                {s.label}
              </li>
            ))}
          </ul>
        }
      />
    );
  }

  return (
    <>
      {chart ?? <p className="logger__empty">{L.empty}</p>}
      {best && (
        <p className="progress__best">
          {L.best}: <strong>{fmtLoad(best.v, unit)}</strong> ({shortDateFmt.format(best.at)})
        </p>
      )}
      <TableWrap label={L.chartTitle}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{L.tableDate}</th>
              <th scope="col">{L.tableTop}</th>
              <th scope="col">{L.tableE1rm}</th>
              <th scope="col">{L.tableSets}</th>
              <th scope="col">{L.tableVolume(unit)}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.sessionId}>
                <th scope="row">{shortDateFmt.format(p.at)}</th>
                <td>
                  {fmt.n1(u(p.top.loadKg))} × {p.top.reps}
                </td>
                <td>{p.e1rm === undefined ? <span className="data-table__muted">{L.outOfRange}</span> : fmt.n1(u(p.e1rm))}</td>
                <td>{p.workSets}</td>
                <td>{fmt.n0(u(p.volumeKg))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <div className="progress__note">
        <EvidenceSeal confidence={e1rmEvidence.confidence as Confidence} unverified={!e1rmEvidence.source.some((s) => getReference(s.refId)?.verified)} />
        <p className="prose">{L.e1rmNote(E1RM_MAX_REPS)}</p>
        <Sources ids={e1rmEvidence.source.map((s) => s.refId)} />
      </div>
    </>
  );
}

function RecordsTable({ sets, unit }: { sets: readonly SetEntry[]; unit: Unit }) {
  const R = t.training.records;
  const rows = useMemo(() => e1rmRecords(sets), [sets]);
  if (rows.length === 0) return <p className="logger__empty">{R.empty}</p>;
  return (
    <TableWrap label={R.title}>
      <table className="data-table records__table">
        <thead>
          <tr>
            <th scope="col">{R.exercise}</th>
            <th scope="col">{R.e1rm}</th>
            <th scope="col">{R.set}</th>
            <th scope="col">{R.date}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.exerciseId}>
              <th scope="row">{exerciseName(r.exerciseId)}</th>
              <td className="records__e1rm">{fmtLoad(r.e1rm, unit)}</td>
              <td>
                {fmt.n1(fromKg(r.loadKg, unit))} × {r.reps}
              </td>
              <td>{shortDateFmt.format(r.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function RepRecords({ sets, exerciseId, unit }: { sets: readonly SetEntry[]; exerciseId: string; unit: Unit }) {
  const R = t.training.records;
  // Faixas seguidas batidas pela mesma série viram uma linha só ("1–12").
  const rows = useMemo(() => {
    const out: { from: number; to: number; loadKg: number; done: number; at: number }[] = [];
    for (const r of repRecords(sets, exerciseId)) {
      const prev = out.at(-1);
      if (prev && prev.loadKg === r.loadKg && prev.at === r.at && prev.to === r.reps - 1) prev.to = r.reps;
      else out.push({ from: r.reps, to: r.reps, loadKg: r.loadKg, done: r.done, at: r.at });
    }
    return out;
  }, [sets, exerciseId]);
  if (rows.length === 0) return null;
  const top = Math.max(...rows.map((r) => r.loadKg));
  return (
    <div className="records__reps">
      <h3>{R.byReps}</h3>
      <p className="section__note">{R.byRepsLead}</p>
      <TableWrap label={`${R.byReps}: ${exerciseName(exerciseId)}`}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{R.reps}</th>
              <th scope="col">{R.load}</th>
              <th scope="col">{R.done}</th>
              <th scope="col">{R.date}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.from}>
                <th scope="row">{r.from === r.to ? r.from : `${r.from}–${r.to}`}</th>
                <td>
                  <span className="analysis__bar" style={{ '--v': r.loadKg / top } as React.CSSProperties}>
                    {fmtLoad(r.loadKg, unit)}
                  </span>
                </td>
                <td>{r.done}</td>
                <td>{shortDateFmt.format(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

const isoDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** "2026-11-13" → meio-dia local (longe da virada do dia, mesmo com horário de verão). */
const fromIsoDay = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d, 12).getTime() : NaN;
};
/** Peso na unidade de carga; circunferências em cm. */
const measureUnit = (k: MeasureKind, unit: Unit): string => (k === 'weight' ? unit : 'cm');
const measureShow = (k: MeasureKind, v: number, unit: Unit): number => (k === 'weight' ? fromKg(v, unit) : v);

function Measures({ unit }: { unit: Unit }) {
  const M = t.training.measures;
  const uid = useId();
  const [list, setList] = useState<Measure[] | null>(null);
  const [kind, setKind] = useState<MeasureKind>('weight');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(() => isoDay(Date.now()));
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    try {
      setList(await repository().listMeasures());
    } catch {
      setMsg(t.training.error);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const u = measureUnit(kind, unit);
  const n = parseLoad(value);
  const at = fromIsoDay(date);
  const ok = Number.isFinite(n) && n > 0 && n < 1000 && Number.isFinite(at);
  const mine = (list ?? []).filter((m) => m.kind === kind);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    try {
      await repository().addMeasure({ kind, value: kind === 'weight' ? toKg(n, unit) : n, at });
      setValue('');
      setMsg(M.added);
      await refresh();
    } catch {
      setMsg(t.training.error);
    }
  }

  async function remove(id: string) {
    try {
      await repository().deleteMeasure(id);
      await refresh();
    } catch {
      setMsg(t.training.error);
    }
  }

  let chart = null;
  const first = mine[0];
  const last = mine.at(-1);
  if (first && last && mine.length >= 2) {
    const span = last.at - first.at || 1;
    const values = mine.map((m) => measureShow(kind, m.value, unit));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max(0.5, (hi - lo) * 0.15);
    const delta = (values.at(-1) ?? 0) - (values[0] ?? 0);
    chart = (
      <LineChart
        title={M.chart(M.kinds[kind])}
        unit={u}
        x={mine.map((m) => (m.at - first.at) / span)}
        series={[{ id: kind, label: M.kinds[kind], values, pattern: 'solid' }]}
        marker={1}
        reveal={false}
        yDomain={[lo - pad, hi + pad]}
        yFormat={(v) => fmt.n1(v)}
        xLabels={[shortDateFmt.format(first.at), shortDateFmt.format(last.at)]}
        description={M.chartDescription(M.kinds[kind], mine.length)}
        footer={<p className="progress__legend">{M.delta(`${delta > 0 ? '+' : ''}${fmt.n1(delta)} ${u}`)}</p>}
      />
    );
  }

  return (
    <>
      <form className="logger__form measures__form" onSubmit={onSubmit}>
        <label className="field">
          <span>{M.kind}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as MeasureKind)}>
            {MEASURE_KINDS.map((k) => (
              <option key={k} value={k}>
                {M.kinds[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{M.value(u)}</span>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={value !== '' && !ok} />
        </label>
        <label className="field">
          <span>{M.date}</span>
          <input type="date" value={date} max={isoDay(Date.now())} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={!ok}>
          {M.add}
        </button>
        <p className="logger__status" role="status">
          {msg}
        </p>
      </form>
      {list && (
        <div className="measures__view">
          <h3 id={`${uid}-k`}>{M.kinds[kind]}</h3>
          {mine.length === 0 ? <p className="logger__empty">{M.empty}</p> : (chart ?? <p className="logger__empty">{M.few}</p>)}
          {mine.length > 0 && (
            <ol className="measures__list" aria-labelledby={`${uid}-k`}>
              {[...mine].reverse().map((m) => {
                const text = `${fmt.n1(measureShow(kind, m.value, unit))} ${u}`;
                return (
                  <li key={m.id}>
                    <span className="measures__date">{shortDateFmt.format(m.at)}</span>
                    <span className="measures__value">{text}</span>
                    <button type="button" className="link-btn" aria-label={M.remove(`${M.kinds[kind]} ${text}, ${shortDateFmt.format(m.at)}`)} onClick={() => void remove(m.id)}>
                      {t.training.remove}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </>
  );
}

export default function Progresso() {
  const L = t.training.progress;
  const uid = useId();
  const unit = useUnit();
  const [sets, setSets] = useState<SetEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [picked, setPicked] = useState('');

  useEffect(() => {
    repository()
      .allSets()
      .then(setSets)
      .catch(() => setError(true));
  }, []);

  // Exercícios com série de trabalho, o mais recente primeiro.
  const options = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of sets ?? []) if (s.kind !== 'aquecimento' && !s.deletedAt) seen.set(s.exerciseId, s.createdAt);
    return [...seen].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [sets]);
  const exerciseId = options.includes(picked) ? picked : (options[0] ?? '');

  return (
    <main id="conteudo" className="sheet">
      <TreinoHeader title={L.title} lead={L.lead} />
      {error ? <StoreError /> : !sets && <StoreLoading />}
      {sets && options.length === 0 && <NothingLogged title={L.emptyTitle} body={L.emptyBody} />}
      {sets && options.length > 0 && (
        <>
          <section className="section" aria-labelledby={`${uid}-rec`}>
            <header className="section__head">
              <h2 id={`${uid}-rec`}>{t.training.records.title}</h2>
              <p>{t.training.records.lead}</p>
            </header>
            <RecordsTable sets={sets} unit={unit} />
          </section>
          <section className="section" aria-labelledby={`${uid}-ex`}>
            <header className="section__head">
              <h2 id={`${uid}-ex`}>{exerciseId ? exerciseName(exerciseId) : L.title}</h2>
            </header>
            {options.length > 0 && (
              <label className="field field--wide progress__pick">
                <span>{t.training.exercise}</span>
                <select value={exerciseId} onChange={(e) => setPicked(e.target.value)}>
                  {options.map((id) => (
                    <option key={id} value={id}>
                      {exerciseName(id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {exerciseId ? (
              <>
                <ExerciseChart sets={sets} exerciseId={exerciseId} unit={unit} />
                <RepRecords sets={sets} exerciseId={exerciseId} unit={unit} />
              </>
            ) : (
              <p className="logger__empty">{L.none}</p>
            )}
          </section>
        </>
      )}
      <section className="section" aria-labelledby={`${uid}-me`}>
        <header className="section__head">
          <h2 id={`${uid}-me`}>{t.training.measures.title}</h2>
          <p>{t.training.measures.lead}</p>
        </header>
        <Measures unit={unit} />
      </section>
    </main>
  );
}
