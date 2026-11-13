import { useEffect, useId, useMemo, useState } from 'react';
import { LineChart, type ChartSeries } from '@/charts/LineChart';
import trainingJson from '@/data/training.json';
import { E1RM_MAX_REPS, exerciseProgress, lastWeeks, weeklySetsByGroup } from '@/engine/training/progress';
import { exerciseById, muscleById, REGIONS } from '@/features/library/catalog';
import { fmt, t } from '@/i18n';
import { repository } from '@/storage/db';
import type { SetEntry } from '@/storage/types';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { getReference } from '@/data';
import type { Confidence } from '@/data/schema/evidence';
import { exerciseName, shortDateFmt, TreinoHeader } from './shared';

const WEEKS = 4;
const e1rmEvidence = trainingJson.e1rm.maxReps;

/** Grupos que o exercício tem como alvo. */
function targetGroupsOf(exerciseId: string): string[] {
  const e = exerciseById(exerciseId);
  if (!e) return [];
  return e.targets.filter((x) => x.role === 'alvo').flatMap((x) => muscleById(x.muscle)?.group ?? []);
}

const GROUP_ORDER = REGIONS.flatMap((r) => r.groups);

function ExerciseChart({ sets, exerciseId }: { sets: readonly SetEntry[]; exerciseId: string }) {
  const L = t.training.progress;
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
    if (points.every((p) => p.e1rm !== undefined)) series.push({ id: 'e1rm', label: L.e1rm, values: points.map((p) => p.e1rm ?? 0), pattern: 'solid' });
    series.push({ id: 'top', label: L.top, values: points.map((p) => p.top.loadKg), pattern: 'dashed' });
    const lo = Math.min(...series.flatMap((s) => s.values));
    chart = (
      <LineChart
        title={L.chartTitle}
        unit="kg"
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
          {L.best}: <strong>{fmt.n1(best.v)} kg</strong> ({shortDateFmt.format(best.at)})
        </p>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{L.tableDate}</th>
              <th scope="col">{L.tableTop}</th>
              <th scope="col">{L.tableE1rm}</th>
              <th scope="col">{L.tableSets}</th>
              <th scope="col">{L.tableVolume}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.sessionId}>
                <th scope="row">{shortDateFmt.format(p.at)}</th>
                <td>
                  {fmt.n1(p.top.loadKg)} × {p.top.reps}
                </td>
                <td>{p.e1rm === undefined ? <span className="data-table__muted">{L.outOfRange}</span> : fmt.n1(p.e1rm)}</td>
                <td>{p.workSets}</td>
                <td>{fmt.n0(p.volumeKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="progress__note">
        <EvidenceSeal confidence={e1rmEvidence.confidence as Confidence} unverified={!e1rmEvidence.source.some((s) => getReference(s.refId)?.verified)} />
        <p className="prose">{L.e1rmNote(E1RM_MAX_REPS)}</p>
        <Sources ids={e1rmEvidence.source.map((s) => s.refId)} />
      </div>
    </>
  );
}

function WeeklyTable({ sets }: { sets: readonly SetEntry[] }) {
  const L = t.training.progress;
  const weeks = useMemo(() => lastWeeks(Date.now(), WEEKS), []);
  const rows = useMemo(() => {
    const m = weeklySetsByGroup(sets, weeks, targetGroupsOf);
    return GROUP_ORDER.filter((g) => m.has(g)).map((g) => ({ g, counts: m.get(g) ?? [] }));
  }, [sets, weeks]);
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));

  if (rows.length === 0) return <p className="logger__empty">{L.weeklyEmpty}</p>;
  return (
    <div className="table-wrap">
      <table className="data-table data-table--weeks">
        <thead>
          <tr>
            <th scope="col">{L.group}</th>
            {weeks.map((w, i) => (
              <th key={w} scope="col">
                <span className="visually-hidden">{L.weekOf} </span>
                {i === weeks.length - 1 ? L.thisWeek : shortDateFmt.format(w)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ g, counts }) => (
            <tr key={g}>
              <th scope="row">{t.groups[g as keyof typeof t.groups] ?? g}</th>
              {counts.map((c, i) => (
                // Coloração relativa ao maior valor da tabela: mostra onde se concentra, não se é muito ou pouco.
                <td key={i} className="stain-cell" data-level={c === 0 ? 0 : Math.ceil((5 * c) / max)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Progresso() {
  const L = t.training.progress;
  const uid = useId();
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
    for (const s of sets ?? []) if (s.kind !== 'aquecimento') seen.set(s.exerciseId, s.createdAt);
    return [...seen].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [sets]);
  const exerciseId = options.includes(picked) ? picked : (options[0] ?? '');

  return (
    <main id="conteudo" className="sheet">
      <TreinoHeader title={L.title} lead={L.lead} />
      {error && (
        <p className="logger__status" role="status">
          {t.training.error}
        </p>
      )}
      {sets && (
        <>
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
            {exerciseId ? <ExerciseChart sets={sets} exerciseId={exerciseId} /> : <p className="logger__empty">{L.none}</p>}
          </section>
          <section className="section" aria-labelledby={`${uid}-wk`}>
            <header className="section__head">
              <h2 id={`${uid}-wk`}>{L.weekly}</h2>
              <p>{L.weeklyLead}</p>
            </header>
            <WeeklyTable sets={sets} />
          </section>
        </>
      )}
    </main>
  );
}
