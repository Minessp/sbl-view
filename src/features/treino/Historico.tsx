import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { t } from '@/i18n/app';
import { repository } from '@/storage/db';
import type { SessionWithSets } from '@/storage/types';
import { dayFmt, exerciseName, NothingLogged, SetRow, StoreError, StoreLoading, timeFmt, TreinoHeader } from './shared';

function SessionBlock({ item, i, onChanged }: { item: SessionWithSets; i: number; onChanged: () => void }) {
  const L = t.training;
  const { session, sets } = item;
  const [confirm, setConfirm] = useState(false);
  const last = sets.reduce((m, s) => Math.max(m, s.createdAt), session.startedAt);
  const minutes = Math.round((last - session.startedAt) / 60_000);
  const exercises = new Set(sets.map((s) => s.exerciseId));
  // Séries do mesmo exercício ficam juntas, na ordem em que o exercício apareceu.
  const groups = [...exercises].map((id) => ({ id, sets: sets.filter((s) => s.exerciseId === id) }));

  async function remove() {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    await repository().deleteSession(session.id);
    onChanged();
  }

  return (
    <article className="session rise" style={{ '--i': i } as CSSProperties} aria-label={dayFmt.format(session.startedAt)}>
      <header className="session__head">
        <h2 className="log-day__title">{dayFmt.format(session.startedAt)}</h2>
        <p className="session__meta">
          {timeFmt.format(session.startedAt)}, {L.session.duration(minutes)}, {L.history.exercises(exercises.size)}, {L.session.sets(sets.length)}
        </p>
      </header>
      {groups.map((g) => (
        <section key={g.id} className="session__ex">
          <h3 className="session__ex-name">{exerciseName(g.id)}</h3>
          <ol className="logger__list">
            {g.sets.map((s) => (
              <SetRow key={s.id} set={s} showExercise={false} onChanged={onChanged} />
            ))}
          </ol>
        </section>
      ))}
      {session.notes && <p className="session__notes prose">{session.notes}</p>}
      <button type="button" className="link-btn session__remove" onClick={() => void remove()} onBlur={() => setConfirm(false)}>
        {confirm ? L.session.removeConfirm : L.session.remove}
      </button>
    </article>
  );
}

export default function Historico() {
  const L = t.training;
  const [items, setItems] = useState<SessionWithSets[] | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setItems(await repository().listSessions(60));
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main id="conteudo" className="sheet">
      <TreinoHeader title={L.history.title} lead={L.history.lead} />
      {error ? <StoreError /> : !items && <StoreLoading />}
      {items && items.length === 0 && <NothingLogged title={L.history.emptyTitle} body={L.history.empty} />}
      {items?.map((it, i) => (
        <SessionBlock key={it.session.id} item={it} i={i} onChanged={() => void refresh()} />
      ))}
    </main>
  );
}
