/**
 * Análise: volume por grupo contra a faixa do plano, frequência, aderência ao mesociclo, estagnação
 * com sugestão de descarga, os últimos 7 dias no corpo e a contagem semanal. Tudo sai do histórico.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import trainingJson from '@/data/training.json';
import { getReference } from '@/data';
import type { Confidence } from '@/data/schema/evidence';
import type { TrainingFile } from '@/data/schema/planning';
import { classify, currentWeek, scaleSets } from '@/engine/planning/volume';
import { adherence, groupFrequency, isStalled, suggestDeload, type AdherenceWeek } from '@/engine/training/analysis';
import { exerciseProgress, lastWeeks, weeklySetsByGroup, type SessionPoint } from '@/engine/training/progress';
import { exerciseById, REGIONS } from '@/features/library/catalog';
import { BodyHeatmap } from '@/features/heat/BodyHeatmap';
import { groupsOfExercise, rangeFor, weeksOf, weekStart } from '@/features/plano/model';
import { fmt, t } from '@/i18n/app';
import { repository } from '@/storage/db';
import type { Plan, SessionWithSets, SetEntry } from '@/storage/types';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { TableWrap } from '@/ui/TableWrap';
import { exerciseName, shortDateFmt, TreinoHeader } from './shared';
import { fmtLoad, useUnit } from './units';

const training = trainingJson as unknown as TrainingFile;
const STAG = training.stagnation;
const WEEKS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_ORDER: string[] = REGIONS.flatMap((r) => r.groups);
const groupName = (g: string) => t.groups[g as keyof typeof t.groups] ?? g;
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);

/** Séries de trabalho diretas por músculo desde `since` (mesma regra do plano: só alvo). */
function directByMuscle(sets: readonly SetEntry[], since: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sets) {
    if (s.createdAt < since || s.kind === 'aquecimento' || s.deletedAt) continue;
    for (const x of exerciseById(s.exerciseId)?.targets ?? []) if (x.role === 'alvo') out[x.muscle] = (out[x.muscle] ?? 0) + 1;
  }
  return out;
}

function VolumeTable({ sets, plan, weeks }: { sets: readonly SetEntry[]; plan: Plan | null; weeks: readonly number[] }) {
  const L = t.training.analysis;
  const P = t.plan;
  const rows = useMemo(() => {
    const counts = weeklySetsByGroup(sets, weeks, groupsOfExercise);
    const freq = groupFrequency(sets, weeks, groupsOfExercise);
    const planned = new Set(Object.entries(plan?.priorities ?? {}).flatMap(([g, p]) => (p === 'fora' ? [] : [g])));
    return GROUP_ORDER.filter((g) => counts.has(g) || planned.has(g)).map((g) => {
      const c = counts.get(g) ?? weeks.map(() => 0);
      const f = freq.get(g) ?? weeks.map(() => 0);
      const p = plan?.priorities[g];
      const range = p ? rangeFor(p) : null;
      const avg = c.reduce((a, b) => a + b, 0) / weeks.length;
      return { g, now: c.at(-1) ?? 0, avg, days: f.reduce((a, b) => a + b, 0) / weeks.length, range, status: range ? classify(avg, range) : null };
    });
  }, [sets, plan, weeks]);

  return (
    <>
      {!plan && <p className="section__note">{L.noPlan}</p>}
      {rows.length === 0 ? (
        <p className="logger__empty">{t.training.progress.weeklyEmpty}</p>
      ) : (
        <TableWrap label={L.volume}>
          <table className="data-table analysis__volume">
            <thead>
              <tr>
                <th scope="col">{L.group}</th>
                <th scope="col">{L.thisWeek}</th>
                <th scope="col">{L.avg}</th>
                <th scope="col">{L.days}</th>
                <th scope="col">{L.range}</th>
                <th scope="col">{L.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.g}>
                  <th scope="row">{groupName(r.g)}</th>
                  <td>{r.now}</td>
                  <td>
                    <span className="analysis__bar" style={{ '--v': Math.min(1, r.avg / Math.max(1, r.range?.[1] ?? 20)) } as React.CSSProperties}>
                      {fmt.n1(r.avg)}
                    </span>
                  </td>
                  <td>{fmt.n1(r.days)}</td>
                  <td>{r.range ? `${r.range[0]}–${r.range[1]}` : <span className="data-table__muted">—</span>}</td>
                  <td>
                    {r.status ? (
                      <span className="plan-status" data-status={r.status}>
                        {P.statusLabel[r.status]}
                      </span>
                    ) : (
                      <span className="data-table__muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}

function AdherenceTable({ rows }: { rows: AdherenceWeek[] }) {
  const L = t.training.analysis;
  const total = rows.reduce((a, r) => ({ s: a.s + r.sessionsDone, sp: a.sp + r.sessionsPlanned, x: a.x + r.setsDone, xp: a.xp + r.setsPlanned }), { s: 0, sp: 0, x: 0, xp: 0 });
  const meter = (v: number) => (
    <span className="analysis__meter" style={{ '--v': v / 100 } as React.CSSProperties}>
      {v}
    </span>
  );
  return (
    <TableWrap label={L.adherence}>
      <table className="data-table analysis__adherence">
        <thead>
          <tr>
            <th scope="col">{L.week}</th>
            <th scope="col">{L.sessions}</th>
            <th scope="col">{L.sets}</th>
            <th scope="col">{L.pct}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.week}>
              <th scope="row">{r.week}</th>
              <td>
                {r.sessionsDone}/{r.sessionsPlanned}
              </td>
              <td>
                {r.setsDone}/{r.setsPlanned}
              </td>
              <td>{meter(pct(r.setsDone, r.setsPlanned))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{L.total}</th>
            <td>
              {total.s}/{total.sp}
            </td>
            <td>
              {total.x}/{total.xp}
            </td>
            <td>{meter(pct(total.x, total.xp))}</td>
          </tr>
        </tfoot>
      </table>
    </TableWrap>
  );
}

const score = (p: SessionPoint) => p.e1rm ?? p.top.loadKg;

function Stagnation({ sets }: { sets: readonly SetEntry[] }) {
  const L = t.training.analysis;
  const unit = useUnit();
  const cfg = STAG.value;
  const [now] = useState(() => Date.now());
  const { stalled, active } = useMemo(() => {
    const since = now - cfg.activeWeeks * 7 * DAY_MS;
    const ids = [...new Set(sets.filter((s) => s.createdAt >= since && s.kind !== 'aquecimento' && !s.deletedAt).map((s) => s.exerciseId))];
    const out: { id: string; best: SessionPoint }[] = [];
    for (const id of ids) {
      const pts = exerciseProgress(sets, id);
      if (!isStalled(pts, cfg.window)) continue;
      const before = pts.slice(0, -cfg.window);
      const best = before.reduce((b, p) => (score(p) > score(b) ? p : b));
      out.push({ id, best });
    }
    return { stalled: out, active: ids.length };
  }, [sets, now, cfg.activeWeeks, cfg.window]);
  const deload = suggestDeload(stalled.length, active, cfg);

  return (
    <>
      {deload && (
        <div className="analysis__deload" role="note">
          <strong>{L.deload}</strong>
          <p>{L.deloadLead(stalled.length, active)}</p>
        </div>
      )}
      {stalled.length === 0 ? (
        <p className="logger__empty">{L.stagnationNone}</p>
      ) : (
        <ul className="analysis__stalled">
          {stalled.map(({ id, best }) => (
            <li key={id}>
              <span>{exerciseName(id)}</span>
              <span className="data-table__muted">
                {L.stalled(best.e1rm !== undefined ? `${t.training.records.e1rm} ${fmtLoad(best.e1rm, unit)}` : `${fmtLoad(best.top.loadKg, unit)} × ${best.top.reps}`)}
                {' · '}
                {shortDateFmt.format(best.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="progress__note">
        <EvidenceSeal confidence={STAG.confidence as Confidence} unverified={!STAG.source.some((s) => getReference(s.refId)?.verified)} />
        <p className="prose">
          <strong>{L.evidence}.</strong> {STAG.note}
        </p>
        <Sources ids={STAG.source.map((s) => s.refId)} />
      </div>
    </>
  );
}

function WeeklyTable({ sets, weeks }: { sets: readonly SetEntry[]; weeks: readonly number[] }) {
  const L = t.training.progress;
  const rows = useMemo(() => {
    const m = weeklySetsByGroup(sets, weeks, groupsOfExercise);
    return GROUP_ORDER.filter((g) => m.has(g)).map((g) => ({ g, counts: m.get(g) ?? [] }));
  }, [sets, weeks]);
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));

  if (rows.length === 0) return <p className="logger__empty">{L.weeklyEmpty}</p>;
  return (
    <TableWrap label={L.weekly}>
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
              <th scope="row">{groupName(g)}</th>
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
    </TableWrap>
  );
}

/** Plano para a aderência: o ativo; sem ele, o último começado. */
async function adherencePlan(): Promise<{ plan: Plan; sessions: SessionWithSets[] } | null> {
  const r = repository();
  const plan = (await r.activePlan()) ?? (await r.listPlans()).filter((p) => p.startedAt !== undefined).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
  return plan ? { plan, sessions: await r.planSessions(plan.id) } : null;
}

export default function Analise() {
  const L = t.training.analysis;
  const uid = useId();
  const [sets, setSets] = useState<SetEntry[] | null>(null);
  const [meso, setMeso] = useState<{ plan: Plan; sessions: SessionWithSets[] } | null>(null);
  const [active, setActive] = useState<Plan | null>(null);
  const [error, setError] = useState(false);
  const [now] = useState(() => Date.now());
  const weeks = useMemo(() => lastWeeks(now, WEEKS), [now]);

  useEffect(() => {
    const r = repository();
    Promise.all([r.allSets(), adherencePlan(), r.activePlan()])
      .then(([s, m, a]) => {
        setSets(s);
        setMeso(m);
        setActive(a ?? null);
      })
      .catch(() => setError(true));
  }, []);

  const adh = useMemo(() => {
    if (!meso || meso.plan.startedAt === undefined) return [];
    const { plan, sessions } = meso;
    const presc = weeksOf(plan);
    const upTo = currentWeek(plan.startedAt ?? now, plan.endedAt ?? now, weekStart);
    return adherence(
      { weeks: plan.weeks, days: plan.days, setsIn: (n, w) => scaleSets(n, presc[w - 1]?.setsFactor ?? 1) },
      sessions.flatMap((s) => (s.session.week !== undefined && s.session.dayId ? [{ week: s.session.week, dayId: s.session.dayId, sets: s.sets }] : [])),
      upTo,
    );
  }, [meso, now]);
  const heat = useMemo(() => directByMuscle(sets ?? [], now - 7 * DAY_MS), [sets, now]);

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
          <section className="section" aria-labelledby={`${uid}-vol`}>
            <header className="section__head">
              <h2 id={`${uid}-vol`}>{L.volume}</h2>
              <p>{L.volumeLead}</p>
            </header>
            <VolumeTable sets={sets} plan={active} weeks={weeks} />
          </section>
          <section className="section" aria-labelledby={`${uid}-adh`}>
            <header className="section__head">
              <h2 id={`${uid}-adh`}>{L.adherence}</h2>
              <p>{meso ? `${meso.plan.name}. ${L.adherenceLead}` : L.adherenceLead}</p>
            </header>
            {adh.length ? <AdherenceTable rows={adh} /> : <p className="logger__empty">{L.adherenceEmpty}</p>}
          </section>
          <section className="section" aria-labelledby={`${uid}-stag`}>
            <header className="section__head">
              <h2 id={`${uid}-stag`}>{L.stagnation}</h2>
              <p>{L.stagnationLead(STAG.value.window)}</p>
            </header>
            <Stagnation sets={sets} />
          </section>
          <section className="section" aria-labelledby={`${uid}-heat`}>
            <header className="section__head">
              <h2 id={`${uid}-heat`}>{t.training.progress.heat}</h2>
              <p>{t.training.progress.heatLead}</p>
            </header>
            <BodyHeatmap values={heat} caption={t.training.progress.heatCaption} />
          </section>
          <section className="section" aria-labelledby={`${uid}-wk`}>
            <header className="section__head">
              <h2 id={`${uid}-wk`}>{t.training.progress.weekly}</h2>
              <p>{t.training.progress.weeklyLead}</p>
            </header>
            <WeeklyTable sets={sets} weeks={weeks} />
          </section>
        </>
      )}
    </main>
  );
}
