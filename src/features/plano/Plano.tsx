import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { getReference } from '@/data';
import type { Confidence, Evidence } from '@/data/schema/evidence';
import type { MuscleGroup } from '@/data/schema/muscle';
import type { Priority } from '@/engine/planning/types';
import { classify, currentWeek, scaleSets } from '@/engine/planning/volume';
import { BodyHeatmap } from '@/features/heat/BodyHeatmap';
import { exerciseById, library } from '@/features/library/catalog';
import { fmt, t } from '@/i18n';
import { newId, repository } from '@/storage/db';
import type { Plan, PlanDayEntry } from '@/storage/types';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { exerciseName, TreinoHeader } from '@/features/treino/shared';
import { buildDays, defaultTarget, initialPriorities, plannableGroups, planning, rangeFor, volumeOf, weeksOf, weekStart } from './model';
import './plano.css';

const EQUIPMENT = ['barra', 'halteres', 'maquina', 'polia', 'banco', 'rack', 'peso_corporal'] as const;
const DAY_OPTIONS = [2, 3, 4, 5, 6];
const WEEK_OPTIONS = [3, 4, 5, 6, 7, 8];
const MAX_TARGET = 30;
const PRIORITY_ORDER: Priority[] = ['priorizar', 'manter', 'fora'];

const groupName = (g: string) => t.groups[g as MuscleGroup] ?? g;
const unverified = (ev: Evidence) => !ev.source.some((s) => getReference(s.refId)?.verified === true);

function EvidenceNote({ ev, children }: { ev: Evidence; children: string }) {
  return (
    <div className="plan-evidence">
      <EvidenceSeal confidence={ev.confidence as Confidence} unverified={unverified(ev)} />
      <p className="prose">
        {children}
        {ev.note && <> {ev.note}</>}
      </p>
      <Sources ids={ev.source.map((s) => s.refId)} />
    </div>
  );
}

interface Draft {
  days: number;
  weeks: number;
  deload: boolean;
  equipment: string[];
  priorities: Record<string, Priority>;
  targets: Record<string, number>;
}

function draftFrom(p: Plan | null): Draft {
  if (p) return { days: p.days.length, weeks: p.weeks, deload: p.deload, equipment: [...p.equipment], priorities: { ...p.priorities }, targets: { ...p.targets } };
  const priorities = initialPriorities();
  return {
    days: 3,
    weeks: 5,
    deload: true,
    equipment: [...EQUIPMENT],
    priorities,
    targets: Object.fromEntries(Object.entries(priorities).map(([g, pr]) => [g, defaultTarget(pr)])),
  };
}

function Builder({ initial, onDone, onCancel }: { initial: Plan | null; onDone: (d: Draft) => void; onCancel?: () => void }) {
  const P = t.plan;
  const uid = useId();
  const [d, setD] = useState<Draft>(() => draftFrom(initial));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setPriority = (g: string, p: Priority) => setD((x) => ({ ...x, priorities: { ...x.priorities, [g]: p }, targets: { ...x.targets, [g]: defaultTarget(p) } }));
  const step = (g: string, by: number) => setD((x) => ({ ...x, targets: { ...x.targets, [g]: Math.min(MAX_TARGET, Math.max(0, (x.targets[g] ?? 0) + by)) } }));
  const toggleEq = (q: string) => set('equipment', d.equipment.includes(q) ? d.equipment.filter((x) => x !== q) : [...d.equipment, q]);
  const anyTarget = plannableGroups.some((g) => d.priorities[g] !== 'fora' && (d.targets[g] ?? 0) > 0);

  return (
    <form
      className="plan-builder"
      onSubmit={(e) => {
        e.preventDefault();
        if (anyTarget) onDone(d);
      }}
    >
      <fieldset className="plan-builder__row">
        <legend>{P.days}</legend>
        <div className="chip-row">
          {DAY_OPTIONS.map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={d.days === n} onClick={() => set('days', n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="plan-builder__row plan-builder__row--inline">
        <label className="field">
          <span>{P.weeks}</span>
          <select value={d.weeks} onChange={(e) => set('weeks', Number(e.target.value))}>
            {WEEK_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={d.deload} onChange={(e) => set('deload', e.target.checked)} />
          <span className="toggle__track" aria-hidden="true" />
          {P.deload}
        </label>
      </div>
      <fieldset className="plan-builder__row">
        <legend>{P.equipment}</legend>
        <div className="chip-row">
          {EQUIPMENT.map((q) => (
            <button key={q} type="button" className="chip chip--small" aria-pressed={d.equipment.includes(q)} onClick={() => toggleEq(q)}>
              {t.equipment[q]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="plan-builder__row">
        <legend>{P.priorities}</legend>
        <p className="section__note">{P.prioritiesLead}</p>
        <div className="table-wrap">
          <table className="data-table plan-priorities">
            <thead>
              <tr>
                <th scope="col">{P.group}</th>
                <th scope="col">{P.priority.label}</th>
                <th scope="col">{P.target}</th>
              </tr>
            </thead>
            <tbody>
              {plannableGroups.map((g) => {
                const pr = d.priorities[g] ?? 'fora';
                const range = rangeFor(pr);
                const n = d.targets[g] ?? 0;
                return (
                  <tr key={g}>
                    <th scope="row">{groupName(g)}</th>
                    <td>
                      <span className="segmented" role="group" aria-label={`${P.priority.label}: ${groupName(g)}`}>
                        {PRIORITY_ORDER.map((p) => (
                          <button key={p} type="button" className="chip chip--small" aria-pressed={pr === p} onClick={() => setPriority(g, p)}>
                            {P.priority[p]}
                          </button>
                        ))}
                      </span>
                    </td>
                    <td>
                      {pr === 'fora' ? (
                        <span className="data-table__muted">{P.noRange}</span>
                      ) : (
                        <span className="stepper">
                          <button type="button" className="stepper__btn" aria-label={P.less(groupName(g))} onClick={() => step(g, -1)} disabled={n <= 0}>
                            −
                          </button>
                          <output className="stepper__value" aria-live="polite" id={`${uid}-${g}`}>
                            {n}
                          </output>
                          <button type="button" className="stepper__btn" aria-label={P.more(groupName(g))} onClick={() => step(g, 1)} disabled={n >= MAX_TARGET}>
                            +
                          </button>
                          {range && <span className="stepper__range">{P.range(range[0], range[1])}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </fieldset>
      <div className="sheet__actions">
        <button type="submit" className="btn-primary" disabled={!anyTarget}>
          {P.generate}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {P.cancel}
          </button>
        )}
      </div>
      {!anyTarget && <p className="section__note">{P.needTarget}</p>}
    </form>
  );
}

function DayCard({ day, onChange, factor }: { day: PlanDayEntry; onChange: (d: PlanDayEntry) => void; factor: number }) {
  const P = t.plan;
  const [adding, setAdding] = useState('');
  const setItem = (i: number, sets: number) => onChange({ ...day, items: day.items.map((it, j) => (j === i ? { ...it, sets } : it)) });
  const drop = (i: number) => onChange({ ...day, items: day.items.filter((_, j) => j !== i) });
  const add = (id: string) => {
    const e = exerciseById(id);
    if (!e) return;
    const reps = e.pattern === 'isolado' ? planning.reps.value.isolado : planning.reps.value.composto;
    onChange({ ...day, items: [...day.items, { exerciseId: id, sets: 3, reps: [reps[0], reps[1]] }] });
    setAdding('');
  };
  const options = library.filter((e) => !day.items.some((it) => it.exerciseId === e.id));
  return (
    <article className="plan-day" aria-labelledby={`day-${day.id}`}>
      <h3 id={`day-${day.id}`} className="plan-day__title">
        {P.day(day.id)}
        <span className="plan-day__focus">{P.focus[day.focus]}</span>
      </h3>
      {day.items.length === 0 ? (
        <p className="logger__empty">{P.emptyDay}</p>
      ) : (
        <ol className="plan-day__list">
          {day.items.map((it, i) => {
            const name = exerciseName(it.exerciseId);
            const shown = scaleSets(it.sets, factor);
            return (
              <li key={it.exerciseId} className="plan-item">
                <Link href={`/exercicios/${it.exerciseId}`} className="plan-item__name">
                  {name}
                </Link>
                <span className="plan-item__reps">{P.reps(it.reps[0], it.reps[1])}</span>
                <span className="stepper">
                  <button type="button" className="stepper__btn" aria-label={`${P.fewer}: ${name}`} onClick={() => setItem(i, it.sets - 1)} disabled={it.sets <= 1}>
                    −
                  </button>
                  <output className="stepper__value">{P.sets(shown)}</output>
                  <button type="button" className="stepper__btn" aria-label={`${P.moreSet}: ${name}`} onClick={() => setItem(i, it.sets + 1)} disabled={it.sets >= 12}>
                    +
                  </button>
                </span>
                <button type="button" className="link-btn plan-item__drop" aria-label={P.dropLabel(name)} onClick={() => drop(i)}>
                  {P.drop}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <label className="field field--wide plan-day__add">
        <span>{P.add}</span>
        <select value={adding} onChange={(e) => add(e.target.value)}>
          <option value="">{P.addPlaceholder}</option>
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

function VolumeTable({ plan }: { plan: Plan }) {
  const P = t.plan;
  const v = useMemo(() => volumeOf(plan.days).byGroup, [plan.days]);
  // Grupos do plano mais os que só aparecem como indireta; fora e sem séries não entram.
  const groups = useMemo(() => [...new Set<string>([...plannableGroups, ...v.keys()])].filter((g) => v.has(g) || plan.priorities[g] !== 'fora'), [v, plan.priorities]);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{P.group}</th>
            <th scope="col">{P.priority.label}</th>
            <th scope="col">{P.direct}</th>
            <th scope="col">{P.indirect}</th>
            <th scope="col">{P.rangeCol}</th>
            <th scope="col">{P.status}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const pr = plan.priorities[g] ?? 'fora';
            const range = rangeFor(pr);
            const x = v.get(g) ?? { direct: 0, indirect: 0 };
            const st = range ? classify(x.direct, range) : null;
            return (
              <tr key={g}>
                <th scope="row">{groupName(g)}</th>
                <td>{P.priority[pr]}</td>
                <td>{x.direct}</td>
                <td>{x.indirect || <span className="data-table__muted">0</span>}</td>
                <td>{range ? P.rangeShort(range[0], range[1]) : <span className="data-table__muted">{P.noRange}</span>}</td>
                <td>
                  {st ? (
                    <span className="plan-status" data-status={st}>
                      {P.statusLabel[st]}
                    </span>
                  ) : (
                    <span className="data-table__muted">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MesoTable({ plan, week }: { plan: Plan; week: number | null }) {
  const P = t.plan;
  const weeks = weeksOf(plan);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{P.week}</th>
            <th scope="col">{P.rirTarget}</th>
            <th scope="col">{P.setsPct}</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week} aria-current={week === w.week ? 'true' : undefined} className={week === w.week ? 'is-current' : undefined}>
              <th scope="row">
                {w.week}
                {week === w.week && <span className="plan-now"> {P.now}</span>}
              </th>
              <td>{w.rir}</td>
              <td>{w.deload ? P.half : P.full}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Plano() {
  const P = t.plan;
  const uid = useId();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    try {
      const r = repository();
      const active = await r.activePlan();
      const latest = active ?? (await r.listPlans()).find((p) => !p.endedAt);
      setPlan(latest ?? null);
    } catch {
      setStatus(t.training.error);
      setPlan(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (next: Plan) => {
    setPlan(next);
    try {
      await repository().savePlan(next);
    } catch {
      setStatus(t.training.error);
    }
  }, []);

  const generate = (d: Draft) => {
    const now = Date.now();
    const days = buildDays(d);
    const base: Plan = plan ?? { id: newId(now), createdAt: now, updatedAt: now, name: P.defaultName, weeks: d.weeks, deload: d.deload, equipment: [], priorities: {}, targets: {}, days };
    void save({ ...base, weeks: d.weeks, deload: d.deload, equipment: d.equipment, priorities: d.priorities, targets: d.targets, days });
    setEditing(false);
    setStatus(P.saved);
    window.scrollTo(0, 0);
  };

  const week = plan?.startedAt !== undefined ? currentWeek(plan.startedAt, Date.now(), weekStart) : null;
  const presc = plan && week !== null && week <= plan.weeks ? weeksOf(plan)[week - 1] : undefined;
  const factor = presc?.setsFactor ?? 1;
  const heat = useMemo(() => {
    if (!plan) return {};
    return Object.fromEntries([...volumeOf(plan.days).byMuscle].map(([m, v]) => [m, v.direct]));
  }, [plan]);

  if (plan === undefined) return <main id="conteudo" className="sheet" />;

  const showBuilder = editing || plan === null;
  const meso = planning.mesocycle;

  return (
    <main id="conteudo" className="sheet">
      <TreinoHeader title={P.title} lead={P.lead} />
      <p className="logger__status" role="status">
        {status}
      </p>

      {showBuilder ? (
        <section className="section" aria-labelledby={`${uid}-build`}>
          <header className="section__head">
            <h2 id={`${uid}-build`}>{plan ? P.rebuild : P.build}</h2>
            {plan && <p>{P.rebuildNote}</p>}
          </header>
          <Builder initial={plan} onDone={generate} {...(plan && { onCancel: () => setEditing(false) })} />
          <details className="plan-why">
            <summary>{P.evidence}</summary>
            <EvidenceNote ev={planning.volume.priorizar}>{P.ev.priorizar(...planning.volume.priorizar.value)}</EvidenceNote>
            <EvidenceNote ev={planning.volume.manter}>{P.ev.manter(...planning.volume.manter.value)}</EvidenceNote>
            <EvidenceNote ev={planning.frequency}>{P.ev.frequency(planning.frequency.value)}</EvidenceNote>
            <EvidenceNote ev={planning.maxSetsPerSession}>{P.ev.perSession(planning.maxSetsPerSession.value)}</EvidenceNote>
            <EvidenceNote ev={planning.preferLong}>{P.ev.preferLong}</EvidenceNote>
          </details>
        </section>
      ) : (
        plan && (
          <>
            <section className="section" aria-labelledby={`${uid}-days`}>
              <header className="section__head">
                <h2 id={`${uid}-days`}>{P.week1(plan.days.length)}</h2>
                <p>
                  {plan.startedAt === undefined
                    ? P.draft
                    : week !== null && week > plan.weeks
                      ? P.overdue(plan.weeks)
                      : presc?.deload
                        ? P.activeDeload(presc.week, plan.weeks)
                        : presc
                          ? P.activeWeek(presc.week, plan.weeks, presc.rir)
                          : ''}
                </p>
              </header>
              <div className="plan-days">
                {plan.days.map((d) => (
                  <DayCard key={d.id} day={d} factor={factor} onChange={(nd) => void save({ ...plan, days: plan.days.map((x) => (x.id === nd.id ? nd : x)) })} />
                ))}
              </div>
              <div className="sheet__actions">
                {plan.startedAt === undefined ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      void save({ ...plan, startedAt: Date.now() });
                      setStatus(P.started);
                    }}
                  >
                    {P.start}
                  </button>
                ) : (
                  <Link href="/treino" className="btn-primary">
                    {P.goLog}
                  </Link>
                )}
                <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                  {P.rebuild}
                </button>
                {plan.startedAt !== undefined && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void save({ ...plan, endedAt: Date.now() }).then(() => {
                        setPlan(null);
                        setStatus(P.ended);
                      });
                    }}
                  >
                    {P.end}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (!confirm) {
                      setConfirm(true);
                      return;
                    }
                    void repository()
                      .deletePlan(plan.id)
                      .then(() => {
                        setConfirm(false);
                        setPlan(null);
                        setStatus(P.removed);
                      });
                  }}
                >
                  {confirm ? P.removeConfirm : P.remove}
                </button>
              </div>
            </section>

            <section className="section" aria-labelledby={`${uid}-vol`}>
              <header className="section__head">
                <h2 id={`${uid}-vol`}>{P.volume}</h2>
                <p>{P.volumeLead}</p>
              </header>
              <div className="plan-volume">
                <BodyHeatmap values={heat} caption={P.heatCaption} />
                <VolumeTable plan={plan} />
              </div>
            </section>

            <section className="section" aria-labelledby={`${uid}-meso`}>
              <header className="section__head">
                <h2 id={`${uid}-meso`}>{P.meso}</h2>
                <p>{P.mesoLead}</p>
              </header>
              <MesoTable plan={plan} week={week} />
              <EvidenceNote ev={meso}>{P.ev.meso}</EvidenceNote>
              <EvidenceNote ev={planning.reps}>{P.ev.reps}</EvidenceNote>
            </section>
          </>
        )
      )}
      <p className="disclaimer">{P.disclaimer(fmt.n0(planning.volume.priorizar.value[1]))}</p>
    </main>
  );
}
