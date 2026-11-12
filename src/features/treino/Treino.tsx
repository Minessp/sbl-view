import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { fmt, t } from '@/i18n';
import { exerciseById, library } from '@/features/library/catalog';
import squatJson from '@/data/exercises/squat.json';
import type { Exercise } from '@/data/schema/exercise';
import { repository, requestPersistence } from '@/storage/db';
import type { SetEntry } from '@/storage/types';
import './treino.css';

const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const squat = squatJson as unknown as Exercise;

/** Variações conhecidas por exercício (hoje só o agachamento do Lab tem). */
function variantsOf(exerciseId: string): { id: string; label: string; short: string }[] {
  const e = exerciseById(exerciseId);
  return e?.labId === squat.id ? squat.variants : [];
}

function variantShort(exerciseId: string, variantId: string | undefined): string {
  if (!variantId) return '';
  return variantsOf(exerciseId).find((v) => v.id === variantId)?.short ?? '';
}

/** Agrupa por dia civil local, mantendo a ordem (mais recente primeiro). */
function byDay(sets: readonly SetEntry[]): { key: string; label: string; sets: SetEntry[] }[] {
  const out: { key: string; label: string; sets: SetEntry[] }[] = [];
  for (const s of sets) {
    const d = new Date(s.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = out[out.length - 1];
    if (last?.key === key) last.sets.push(s);
    else out.push({ key, label: dayFmt.format(d), sets: [s] });
  }
  return out;
}

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
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [recent, setRecent] = useState<SetEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRecent(await repository().recentAll(40));
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadN = Number(load.replace(',', '.'));
  const repsN = Number(reps);
  const loadOk = load.trim() !== '' && Number.isFinite(loadN) && loadN >= 0;
  const repsOk = Number.isInteger(repsN) && repsN > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loadOk || !repsOk) return;
    try {
      await repository().logSet({
        exerciseId,
        ...(variantId && { variantId }),
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

  async function remove(id: string) {
    try {
      await repository().deleteSet(id);
      await refresh();
    } catch {
      setStatus('error');
    }
  }

  const ex = exerciseById(exerciseId);

  return (
    <main id="conteudo" className="sheet">
      <header className="sheet__head">
        <p className="sheet__plate">{L.plate}</p>
        <h1 className="sheet__title">{L.title}</h1>
        <p className="sheet__lead prose">{L.lead}</p>
      </header>

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
            <select value={rir} onChange={(e) => setRir(e.target.value)}>
              <option value="">{L.rirNone}</option>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--wide">
            <span>{L.note}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L.notePlaceholder} maxLength={200} />
          </label>
          <button type="submit" className="btn-primary" disabled={!loadOk || !repsOk}>
            {L.save}
          </button>
          <p className="logger__status" role="status">
            {status === 'saved' ? L.saved : status === 'error' ? L.error : ''}
          </p>
        </form>
        {ex && (
          <Link href={`/exercicios/${ex.id}`} className="link-btn">
            {L.seeExercise}: {ex.name}
          </Link>
        )}
      </section>

      <section className="section" aria-labelledby={`${uid}-recent`}>
        <header className="section__head">
          <h2 id={`${uid}-recent`}>{L.recent}</h2>
        </header>
        {recent.length === 0 ? (
          <p className="logger__empty">{L.empty}</p>
        ) : (
          byDay(recent).map((day) => (
            <div key={day.key} className="log-day">
              <h3 className="log-day__title">{day.label}</h3>
              <ol className="logger__list">
                {day.sets.map((s) => (
                  <li key={s.id}>
                    <span className="logger__when">{timeFmt.format(s.createdAt)}</span>
                    <span className="logger__what">
                      <span className="logger__ex">{exerciseById(s.exerciseId)?.name ?? s.exerciseId}</span>{' '}
                      <strong>
                        {fmt.n1(s.loadKg)} kg × {s.reps}
                      </strong>
                      {s.rir !== undefined && <span className="logger__rir"> RIR {s.rir}</span>}
                    </span>
                    <span className="logger__variant">{variantShort(s.exerciseId, s.variantId)}</span>
                    <button type="button" className="link-btn" aria-label={`${L.removeLabel}: ${fmt.n1(s.loadKg)} kg × ${s.reps}`} onClick={() => void remove(s.id)}>
                      {L.remove}
                    </button>
                    {s.note && <span className="logger__note">{s.note}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
