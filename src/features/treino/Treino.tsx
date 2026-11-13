import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { t } from '@/i18n/app';
import { exerciseById, library } from '@/features/library/catalog';
import { repository, requestPersistence } from '@/storage/db';
import type { PlanContext, SessionWithSets, SetKind } from '@/storage/types';
import { Today } from '@/features/plano/Today';
import { KindSelect, loadValid, parseLoad, repsValid, RirSelect, SetRow, timeFmt, TreinoHeader, variantsOf } from './shared';

export default function Treino() {
  const L = t.training;
  const uid = useId();
  const search = useSearch();
  const initial = useMemo(() => {
    const q = new URLSearchParams(search).get('exercicio');
    return q && exerciseById(q) ? q : (library[0]?.id ?? 'squat');
  }, [search]);

  const [exerciseId, setExerciseId] = useState(initial);
  const variants = variantsOf(exerciseId);
  const [picked, setVariantId] = useState('');
  // Variação escolhida só vale se for do exercício atual; senão, a primeira dele.
  const variantId = variants.some((v) => v.id === picked) ? picked : (variants[0]?.id ?? '');
  const [load, setLoad] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState('');
  const [kind, setKind] = useState<SetKind>('trabalho');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error' | 'ended'>('idle');
  const [open, setOpen] = useState<SessionWithSets | undefined>();
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [planCtx, setPlanCtx] = useState<PlanContext | undefined>();

  const refresh = useCallback(async () => {
    try {
      const o = await repository().openSession();
      setOpen(o);
      setNotes(o?.session.notes ?? '');
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadN = parseLoad(load);
  const repsN = Number(reps);
  const loadOk = loadValid(loadN);
  const repsOk = repsValid(repsN);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loadOk || !repsOk) return;
    try {
      await repository().logSet({
        ...(planCtx && { plan: planCtx }),
        exerciseId,
        ...(variantId && { variantId }),
        kind,
        loadKg: loadN,
        reps: repsN,
        ...(rir !== '' && { rir: Number(rir) }),
        ...(note.trim() && { note: note.trim() }),
      });
      void requestPersistence();
      setStatus('saved');
      setNote('');
      await refresh();
    } catch {
      setStatus('error');
    }
  }

  async function endSession() {
    if (!open) return;
    try {
      await repository().endSession(open.session.id);
      setStatus('ended');
      await refresh();
    } catch {
      setStatus('error');
    }
  }

  async function saveNotes() {
    if (!open) return;
    try {
      await repository().setSessionNotes(open.session.id, notes);
      setNotesSaved(true);
    } catch {
      setStatus('error');
    }
  }

  function pick(id: string) {
    setExerciseId(id);
    setStatus('idle');
    document.getElementById(`${uid}-form`)?.scrollIntoView({ block: 'start' });
  }

  const ex = exerciseById(exerciseId);
  const message = { idle: '', saved: L.saved, error: L.error, ended: L.session.ended }[status];

  return (
    <main id="conteudo" className="sheet">
      <TreinoHeader title={L.title} lead={L.lead} />
      <Today open={open} exerciseId={exerciseId} onPick={pick} onContext={setPlanCtx} />

      <section className="section" aria-labelledby={`${uid}-form`}>
        <header className="section__head">
          <h2 id={`${uid}-form`}>{t.lab.log.title}</h2>
          <p>{L.privacy}</p>
        </header>
        <form className="logger__form" onSubmit={onSubmit}>
          <label className="field field--wide">
            <span>{L.exercise}</span>
            <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
              {library.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {variants.length > 0 && (
            <label className="field field--wide">
              <span>{L.variant}</span>
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>{L.load}</span>
            <input inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} aria-invalid={load !== '' && !loadOk} />
          </label>
          <label className="field">
            <span>{L.reps}</span>
            <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} aria-invalid={reps !== '' && !repsOk} />
          </label>
          <label className="field">
            <span>{L.rir}</span>
            <RirSelect value={rir} onChange={setRir} />
          </label>
          <label className="field field--wide">
            <span>{L.kind}</span>
            <KindSelect value={kind} onChange={setKind} />
          </label>
          <label className="field field--wide">
            <span>{L.note}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L.notePlaceholder} maxLength={200} />
          </label>
          <button type="submit" className="btn-primary" disabled={!loadOk || !repsOk}>
            {L.save}
          </button>
          <p className="logger__status" role="status">
            {message}
          </p>
        </form>
        {ex && (
          <Link href={`/exercicios/${ex.id}`} className="link-btn">
            {L.seeExercise}: {ex.name}
          </Link>
        )}
      </section>

      <section className="section" aria-labelledby={`${uid}-open`}>
        <header className="section__head">
          <h2 id={`${uid}-open`}>{L.session.open}</h2>
          {open && (
            <p>
              {L.session.started} {timeFmt.format(open.session.startedAt)}, {L.session.sets(open.sets.length)}
            </p>
          )}
        </header>
        {!open ? (
          <p className="logger__empty">{L.session.none}</p>
        ) : (
          <>
            <ol className="logger__list">
              {open.sets.map((s) => (
                <SetRow key={s.id} set={s} onChanged={() => void refresh()} />
              ))}
            </ol>
            <div className="session-notes">
              <label className="field field--wide">
                <span>{L.session.notes}</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={notes}
                  placeholder={L.session.notesPlaceholder}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesSaved(false);
                  }}
                />
              </label>
              <div className="session-notes__actions">
                <button type="button" className="btn-secondary" onClick={() => void saveNotes()}>
                  {notesSaved ? L.session.notesSaved : L.session.saveNotes}
                </button>
                <button type="button" className="btn-secondary" onClick={() => void endSession()}>
                  {L.session.end}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
