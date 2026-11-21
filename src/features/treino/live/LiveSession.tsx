/**
 * Sessão ao vivo: o dia do mesociclo ativo, exercício a exercício e série a série. Cada cartão mostra a
 * prescrição, a última vez e a carga sugerida (progressão dupla); "Feita" grava a série, confere
 * recorde e começa o descanso. Superssérie: descanso só depois do último exercício da sequência.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import trainingJson from '@/data/training.json';
import type { TrainingFile } from '@/data/schema/planning';
import { currentWeek, nextDay, scaleSets } from '@/engine/planning/volume';
import { doubleProgression, type Suggestion } from '@/engine/training/progression';
import { epley1RM } from '@/engine/training/progress';
import { beatsRecord } from '@/engine/training/records';
import { warmupSets } from '@/engine/training/warmup';
import { fmt, t } from '@/i18n/app';
import { repository, requestPersistence } from '@/storage/db';
import type { Plan, PlanContext, PlanItemEntry, SessionWithSets, SetEntry, SetKind, Unit } from '@/storage/types';
import { incrementFor, isIsolated, restOf, usesBarbell, weeksOf, weekStart } from '@/features/plano/model';
import { exerciseName, parseLoad, RirSelect, shortDateFmt } from '../shared';
import { fmtLoad, fromKg, toKg, useUnit } from '../units';
import { barFor, Plates } from './Plates';
import { useRestTimer } from './timer';
import './live.css';
import { exerciseHref, R } from '@/app/routes';

const training = trainingJson as unknown as TrainingFile;

interface Props {
  open: SessionWithSets | undefined;
  /** Recarrega a sessão aberta no pai. */
  onLogged: () => Promise<void>;
  onContext: (c: PlanContext | undefined) => void;
}

/** Séries de trabalho da última sessão (fora a aberta) em que o exercício apareceu. */
function lastSession(history: readonly SetEntry[], exerciseId: string, openId: string | undefined): SetEntry[] {
  let sid: string | undefined;
  let at = -Infinity;
  for (const s of history)
    if (s.exerciseId === exerciseId && s.kind !== 'aquecimento' && s.sessionId !== openId && s.createdAt > at) {
      at = s.createdAt;
      sid = s.sessionId;
    }
  return sid ? history.filter((s) => s.sessionId === sid && s.exerciseId === exerciseId && s.kind !== 'aquecimento') : [];
}

function setsText(sets: readonly SetEntry[], unit: Unit): string {
  const loads = new Set(sets.map((s) => s.loadKg));
  if (loads.size === 1) return `${fmtLoad(sets[0]?.loadKg ?? 0, unit)} × ${sets.map((s) => s.reps).join(', ')}`;
  return sets.map((s) => `${fmt.n1(fromKg(s.loadKg, unit))} × ${s.reps}`).join(', ') + ` ${unit}`;
}

/** Cadeias de superssérie: item com `superset` liga ao seguinte. */
function chains(items: readonly PlanItemEntry[]): PlanItemEntry[][] {
  const out: PlanItemEntry[][] = [];
  let cur: PlanItemEntry[] = [];
  items.forEach((it, i) => {
    cur.push(it);
    if (!it.superset || i === items.length - 1) {
      out.push(cur);
      cur = [];
    }
  });
  return out;
}

interface LogInput {
  kind: SetKind;
  load: number;
  reps: number;
  rir?: number;
}

interface CardProps {
  item: PlanItemEntry;
  index: number;
  planned: number;
  rir: number | undefined;
  unit: Unit;
  done: SetEntry[];
  warm: SetEntry[];
  last: SetEntry[];
  flash: boolean;
  onLog: (item: PlanItemEntry, x: LogInput) => Promise<void>;
}

function SetInputs({ label, exName, defaults, unit, rirDefault, kind, onLog }: {
  label: string;
  exName: string;
  defaults: { load: string; reps: string };
  unit: Unit;
  rirDefault: string;
  kind: SetKind;
  onLog: (x: LogInput) => Promise<void>;
}) {
  const L = t.training.live;
  const [load, setLoad] = useState<string | null>(null);
  const [reps, setReps] = useState<string | null>(null);
  const [rir, setRir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadS = load ?? defaults.load;
  const repsS = reps ?? defaults.reps;
  const rirS = rir ?? rirDefault;
  const loadN = parseLoad(loadS);
  const repsN = Number(repsS);
  const ok = Number.isFinite(loadN) && loadN >= 0 && loadN <= 4000 && Number.isInteger(repsN) && repsN > 0 && repsN <= 1000;
  return (
    <li className="live-set live-set--active" data-kind={kind}>
      <span className="live-set__n">{label}</span>
      <label className="live-set__field">
        <span className="visually-hidden">{L.loadLabel(`${label}, ${exName}`, unit)}</span>
        <input inputMode="decimal" value={loadS} onChange={(e) => setLoad(e.target.value)} aria-invalid={loadS !== '' && !Number.isFinite(loadN)} />
        <span className="live-set__unit">{unit}</span>
      </label>
      <span className="live-set__x" aria-hidden="true">
        ×
      </span>
      <label className="live-set__field live-set__field--reps">
        <span className="visually-hidden">{L.repsLabel(`${label}, ${exName}`)}</span>
        <input inputMode="numeric" value={repsS} onChange={(e) => setReps(e.target.value)} />
      </label>
      <label className="live-set__rir">
        <span>RIR</span>
        <RirSelect value={rirS} onChange={setRir} />
      </label>
      <button
        type="button"
        className="live-set__done"
        disabled={!ok || busy}
        aria-label={L.doneLabel(`${label}, ${exName}`)}
        onClick={() => {
          setBusy(true);
          void onLog({ kind, load: loadN, reps: repsN, ...(rirS !== '' && { rir: Number(rirS) }) }).finally(() => {
            setBusy(false);
            setLoad(null);
            setReps(null);
            setRir(null);
          });
        }}
      >
        {L.done}
      </button>
    </li>
  );
}

function ExerciseCard({ item, index, planned, rir, unit, done, warm, last, flash, onLog }: CardProps) {
  const L = t.training.live;
  const P = t.plan;
  const name = exerciseName(item.exerciseId);
  const [showWarm, setShowWarm] = useState(false);
  const [showPlates, setShowPlates] = useState(false);
  const [extra, setExtra] = useState(false);
  const inc = incrementFor(item.exerciseId, unit);
  const sug: Suggestion | undefined = useMemo(
    () =>
      doubleProgression(
        last.map((s) => ({ load: fromKg(s.loadKg, unit), reps: s.reps })),
        item.reps,
        inc,
      ),
    [last, item.reps, inc, unit],
  );
  const prev = done.at(-1);
  const loadDefault = prev ? fmt.n1(fromKg(prev.loadKg, unit)) : sug ? fmt.n1(sug.load) : '';
  const repsDefault = String(prev?.reps ?? sug?.reps ?? item.reps[0]);
  const rirDefault = rir === undefined ? '' : String(rir);
  const workLoad = parseLoad(loadDefault);
  const barbell = usesBarbell(item.exerciseId);
  const warmSteps = isIsolated(item.exerciseId) ? training.warmup.value.isolado : training.warmup.value.composto;
  const warmups = Number.isFinite(workLoad) && inc > 0 ? warmupSets(workLoad, warmSteps, { step: inc, min: barbell ? barFor(unit) : 0 }) : [];
  const technique = item.technique ?? 'none';
  const finished = done.length >= planned;
  const extraKind: SetKind = technique === 'drop' ? 'drop' : technique === 'myo_reps' ? 'rest-pause' : 'trabalho';
  const log = (x: LogInput) => onLog(item, x);

  return (
    <article className="live-card" data-finished={finished || undefined} data-flash={flash || undefined} aria-labelledby={`live-${item.exerciseId}`}>
      <header className="live-card__head">
        <span className="live-card__n" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="live-card__title">
          <h3 id={`live-${item.exerciseId}`}>
            <Link href={exerciseHref(item.exerciseId)}>{name}</Link>
          </h3>
          <p className="live-card__presc">
            {P.sets(planned)} · {P.reps(item.reps[0], item.reps[1])}
            {rir !== undefined && <> · {P.rir(rir)}</>} · {P.rest(restOf(item))}
          </p>
        </div>
        <span className="live-card__count">{L.progress(Math.min(done.length, planned), planned)}</span>
      </header>
      <div className="live-card__meter" aria-hidden="true">
        <span style={{ '--p': Math.min(1, done.length / Math.max(1, planned)) } as React.CSSProperties} />
      </div>
      <p className="live-card__last">{last.length ? L.last(shortDateFmt.format(last[0]?.createdAt ?? 0), setsText(last, unit)) : L.first}</p>
      {sug && (
        <p className="live-card__sug" data-reason={sug.reason}>
          <strong>
            {L.suggest}: {sug.load > 0 ? `${fmt.n1(sug.load)} ${unit} × ${sug.reps}` : `× ${sug.reps}`}
          </strong>{' '}
          {L.reason[sug.reason]}
        </p>
      )}
      {technique !== 'none' && (
        <p className="live-card__tech">
          {L.technique(P.techniques[technique])}. {P.techniqueHow[technique]}
        </p>
      )}

      <div className="live-card__tools">
        {inc > 0 && (
          <button type="button" className="chip chip--small" aria-expanded={showWarm} onClick={() => setShowWarm((v) => !v)}>
            {showWarm ? L.warmupHide : L.warmupShow}
          </button>
        )}
        {barbell && (
          <button type="button" className="chip chip--small" aria-expanded={showPlates} onClick={() => setShowPlates((v) => !v)}>
            {showPlates ? L.platesHide : L.platesShow}
          </button>
        )}
      </div>
      {showPlates && <Plates load={workLoad} unit={unit} />}
      {showWarm && (
        <ol className="live-sets live-sets--warm" aria-label={L.warmup}>
          {warmups.length === 0 && <li className="section__note">{L.warmupNone}</li>}
          {warmups.map((w, i) =>
            i < warm.length ? (
              <li key={i} className="live-set live-set--done" data-kind="aquecimento">
                <span className="live-set__n">{L.warmupSet(i + 1)}</span>
                <span className="live-set__value">
                  {fmtLoad(warm[i]?.loadKg ?? 0, unit)} × {warm[i]?.reps}
                </span>
              </li>
            ) : (
              <SetInputs
                key={`w${i}-${w.load}`}
                label={L.warmupSet(i + 1)}
                exName={name}
                defaults={{ load: fmt.n1(w.load), reps: String(w.reps) }}
                unit={unit}
                rirDefault=""
                kind="aquecimento"
                onLog={log}
              />
            ),
          )}
        </ol>
      )}

      <ol className="live-sets" aria-label={name}>
        {done.map((s, i) => (
          <li key={s.id} className="live-set live-set--done" data-kind={s.kind}>
            <span className="live-set__n">{s.kind === 'trabalho' ? L.setN(i + 1) : t.training.kinds[s.kind]}</span>
            <span className="live-set__value">
              {fmtLoad(s.loadKg, unit)} × {s.reps}
              {s.rir !== undefined && <span className="live-set__rir-done"> RIR {s.rir}</span>}
            </span>
          </li>
        ))}
        {!finished && (
          <SetInputs
            key={`a${done.length}`}
            label={L.setN(done.length + 1)}
            exName={name}
            defaults={{ load: loadDefault, reps: repsDefault }}
            unit={unit}
            rirDefault={rirDefault}
            kind="trabalho"
            onLog={log}
          />
        )}
        {Array.from({ length: Math.max(0, planned - done.length - 1) }, (_, i) => (
          <li key={`p${i}`} className="live-set live-set--pending">
            <span className="live-set__n">{L.setN(done.length + i + 2)}</span>
          </li>
        ))}
        {finished && extra && (
          <SetInputs
            key={`e${done.length}`}
            label={extraKind === 'trabalho' ? L.setN(done.length + 1) : t.training.kinds[extraKind]}
            exName={name}
            defaults={{ load: loadDefault, reps: repsDefault }}
            unit={unit}
            rirDefault={rirDefault}
            kind={extraKind}
            onLog={log}
          />
        )}
      </ol>
      {finished && !extra && (
        <button type="button" className="link-btn" onClick={() => setExtra(true)}>
          {technique === 'drop' || technique === 'myo_reps' ? L.techniqueSet[technique] : L.extra}
        </button>
      )}
    </article>
  );
}

export function LiveSession({ open, onLogged, onContext }: Props) {
  const L = t.training.live;
  const unit = useUnit();
  const startTimer = useRestTimer((s) => s.start);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [lastDay, setLastDay] = useState<string | undefined>();
  const [picked, setPicked] = useState<string | undefined>();
  const [history, setHistory] = useState<SetEntry[]>([]);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await repository().allSets());
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const r = repository();
    void (async () => {
      try {
        const p = await r.activePlan();
        if (!alive) return;
        setPlan(p ?? null);
        if (p) {
          const ss = await r.planSessions(p.id);
          if (alive) setLastDay(ss.at(-1)?.session.dayId);
        }
      } catch {
        if (alive) setPlan(null);
      }
    })();
    void loadHistory();
    return () => {
      alive = false;
    };
  }, [loadHistory]);

  const week = plan?.startedAt !== undefined ? currentWeek(plan.startedAt, Date.now(), weekStart) : null;
  const ids = plan?.days.map((d) => d.id) ?? [];
  const sessionDay = open?.session.mesocycleId === plan?.id ? open?.session.dayId : undefined;
  const dayId = picked && ids.includes(picked) ? picked : (sessionDay ?? nextDay(ids, lastDay));
  const overdue = plan !== null && week !== null && week > plan.weeks;
  const ctx = useMemo(() => (plan && dayId && week !== null && !overdue ? { mesocycleId: plan.id, week, dayId } : undefined), [plan, dayId, week, overdue]);
  useEffect(() => onContext(ctx), [ctx, onContext]);

  if (!plan || week === null) return null;
  const presc = weeksOf(plan)[Math.min(week, plan.weeks) - 1];
  const day = plan.days.find((d) => d.id === dayId);
  const openSets = open?.sets ?? [];

  async function log(item: PlanItemEntry, x: LogInput, chain: readonly PlanItemEntry[]) {
    try {
      const before = history;
      const entry = await repository().logSet({
        ...(ctx && { plan: ctx }),
        exerciseId: item.exerciseId,
        kind: x.kind,
        loadKg: toKg(x.load, unit),
        reps: x.reps,
        ...(x.rir !== undefined && { rir: x.rir }),
      });
      void requestPersistence();
      await Promise.all([onLogged(), loadHistory()]);
      const rec = beatsRecord(before, entry);
      const name = exerciseName(item.exerciseId);
      if (rec.e1rm || rec.reps) {
        setFlash(item.exerciseId);
        setTimeout(() => setFlash(null), 2400);
      }
      setMsg(
        rec.e1rm
          ? L.record.e1rm(fmtLoad(epley1RM(entry.loadKg, entry.reps) ?? entry.loadKg, unit))
          : rec.reps
            ? L.record.reps(fmtLoad(entry.loadKg, unit), entry.reps)
            : L.logged,
      );
      if (x.kind === 'aquecimento') return;
      const pos = chain.indexOf(item);
      const nextInChain = pos >= 0 && pos < chain.length - 1 ? chain[pos + 1] : undefined;
      if (nextInChain) {
        setMsg(L.next(exerciseName(nextInChain.exerciseId)));
        return;
      }
      startTimer(restOf(item), chain.length > 1 ? exerciseName(chain[0]?.exerciseId ?? item.exerciseId) : name);
    } catch {
      setMsg(t.training.error);
    }
  }

  return (
    <section className="section live-session" aria-labelledby="live-title">
      <header className="section__head">
        <h2 id="live-title">{L.title}</h2>
        <p>{overdue ? L.overdue : `${L.lead(week, plan.weeks)} ${presc?.deload ? L.deload : presc ? L.rirWeek(presc.rir) : ''}`}</p>
      </header>
      {!overdue && (
        <>
          <div className="today__days" role="group" aria-label={L.pick}>
            {plan.days.map((d) => (
              <button key={d.id} type="button" className="chip chip--small" aria-pressed={d.id === dayId} onClick={() => setPicked(d.id)}>
                {t.plan.day(d.id)} <span className="live__focus">{d.focus === 'custom' ? t.plan.focus.custom : t.plan.focus[d.focus]}</span>
              </button>
            ))}
          </div>
          <p className="logger__status" role="status">
            {msg}
          </p>
          {day && (
            <div className="live__list">
              {chains(day.items).map((chain, ci) => {
                const cards = chain.map((it) => {
                  const index = day.items.indexOf(it);
                  const mine = openSets.filter((s) => s.exerciseId === it.exerciseId);
                  return (
                    <ExerciseCard
                      key={it.exerciseId}
                      item={it}
                      index={index}
                      planned={scaleSets(it.sets, presc?.setsFactor ?? 1)}
                      rir={it.rir ?? presc?.rir}
                      unit={unit}
                      done={mine.filter((s) => s.kind !== 'aquecimento')}
                      warm={mine.filter((s) => s.kind === 'aquecimento')}
                      last={lastSession(history, it.exerciseId, open?.session.id)}
                      flash={flash === it.exerciseId}
                      onLog={(item, x) => log(item, x, chain)}
                    />
                  );
                });
                return chain.length > 1 ? (
                  <div key={ci} className="live__superset" role="group" aria-label={L.superset}>
                    <p className="live__superset-head">
                      <strong>{L.superset}</strong> {L.supersetLead}
                    </p>
                    {cards}
                  </div>
                ) : (
                  cards
                );
              })}
            </div>
          )}
        </>
      )}
      <Link href={R.plan} className="link-btn">
        {L.seePlan}
      </Link>
    </section>
  );
}
