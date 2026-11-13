/**
 * Plano de hoje, no topo do Registrar: escolhe o dia do mesociclo ativo e mostra as séries
 * planejadas × feitas na sessão aberta. Tocar no exercício preenche o formulário.
 */
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { currentWeek, nextDay, scaleSets } from '@/engine/planning/volume';
import { t } from '@/i18n';
import { repository } from '@/storage/db';
import type { Plan, PlanContext, SessionWithSets } from '@/storage/types';
import { exerciseName } from '@/features/treino/shared';
import { weeksOf, weekStart } from './model';
import './plano.css';

interface Props {
  open: SessionWithSets | undefined;
  exerciseId: string;
  onPick: (exerciseId: string) => void;
  /** Contexto a gravar com a próxima série (ou undefined sem plano ativo). */
  onContext: (c: PlanContext | undefined) => void;
}

export function Today({ open, exerciseId, onPick, onContext }: Props) {
  const T = t.plan.today;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [lastDay, setLastDay] = useState<string | undefined>();
  const [picked, setPicked] = useState<string | undefined>();

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
    return () => {
      alive = false;
    };
  }, []);

  const week = plan?.startedAt !== undefined ? currentWeek(plan.startedAt, Date.now(), weekStart) : null;
  const ids = plan?.days.map((d) => d.id) ?? [];
  // Sessão aberta já ligada ao plano manda no dia; senão, o próximo depois do último feito.
  const sessionDay = open?.session.mesocycleId === plan?.id ? open?.session.dayId : undefined;
  const dayId = picked && ids.includes(picked) ? picked : (sessionDay ?? nextDay(ids, lastDay));
  const overdue = plan !== null && week !== null && week > plan.weeks;

  useEffect(() => {
    onContext(plan && dayId && week !== null && !overdue ? { mesocycleId: plan.id, week, dayId } : undefined);
  }, [plan, dayId, week, overdue, onContext]);

  if (!plan || week === null) return null;
  const presc = weeksOf(plan)[Math.min(week, plan.weeks) - 1];
  const day = plan.days.find((d) => d.id === dayId);
  const done = (id: string) => (open?.sets ?? []).filter((s) => s.exerciseId === id && s.kind !== 'aquecimento').length;

  return (
    <section className="section" aria-labelledby="today-title">
      <header className="section__head">
        <h2 id="today-title">{T.title}</h2>
        <p>
          {overdue ? T.overdue : `${T.lead(week, plan.weeks)} ${presc?.deload ? T.deload : presc ? T.rir(presc.rir) : ''}`}
        </p>
      </header>
      {!overdue && (
        <>
          <div className="today__days" role="group" aria-label={T.pick}>
            {plan.days.map((d) => (
              <button key={d.id} type="button" className="chip chip--small" aria-pressed={d.id === dayId} onClick={() => setPicked(d.id)}>
                {t.plan.day(d.id)}
              </button>
            ))}
          </div>
          {day && (
            <ul className="today__list">
              {day.items.map((it) => {
                const planned = scaleSets(it.sets, presc?.setsFactor ?? 1);
                const n = done(it.exerciseId);
                const name = exerciseName(it.exerciseId);
                return (
                  <li key={it.exerciseId} className="today__item" data-done={n >= planned}>
                    <button type="button" className="today__pick" aria-pressed={exerciseId === it.exerciseId} aria-label={T.logThis(name)} onClick={() => onPick(it.exerciseId)}>
                      <span className="today__name">{name}</span>
                    </button>
                    <span className="today__count">
                      {T.done(n, planned)}, {t.plan.reps(it.reps[0], it.reps[1])}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <Link href="/treino/plano" className="link-btn">
        {T.seePlan}
      </Link>
    </section>
  );
}
