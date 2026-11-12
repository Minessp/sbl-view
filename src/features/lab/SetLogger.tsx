import { useCallback, useEffect, useId, useState } from 'react';
import { fmt, t } from '@/i18n';
import { repository, requestPersistence } from '@/storage/db';
import type { SetEntry } from '@/storage/types';
import { squat, variantById } from './model';
import { useLab } from './store';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function SetLogger() {
  const ids = useLab((s) => s.variantIds);
  const loadSetting = useLab((s) => s.settings.loadMass);
  const L = t.lab.logger;
  const uid = useId();
  const [variantId, setVariantId] = useState(ids[0] ?? 'high_bar');
  const [load, setLoad] = useState(String(loadSetting));
  const [reps, setReps] = useState('5');
  const [rir, setRir] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [recent, setRecent] = useState<SetEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRecent(await repository().recentSets(squat.id, 8));
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => setLoad(String(loadSetting)), [loadSetting]);

  const loadN = Number(load.replace(',', '.'));
  const repsN = Number(reps);
  const valid = Number.isFinite(loadN) && loadN >= 0 && Number.isInteger(repsN) && repsN > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      await repository().logSet({
        exerciseId: squat.id,
        variantId,
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
    await repository().deleteSet(id);
    await refresh();
  }

  return (
    <section className="lab-section logger" aria-labelledby="sec-logger">
      <header className="lab-section__head">
        <h2 id="sec-logger">{L.title}</h2>
        <p>{L.privacy}</p>
      </header>
      <form className="logger__form" onSubmit={onSubmit}>
        <label className="field field--wide">
          <span>{L.variant}</span>
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            {squat.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{L.load}</span>
          <input inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} aria-invalid={!Number.isFinite(loadN) || loadN < 0} />
        </label>
        <label className="field">
          <span>{L.reps}</span>
          <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} aria-invalid={!Number.isInteger(repsN) || repsN <= 0} />
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
        <button type="submit" className="btn-primary" disabled={!valid}>
          {L.save}
        </button>
        <p className="logger__status" role="status" id={`${uid}-st`}>
          {status === 'saved' ? L.saved : status === 'error' ? L.error : ''}
        </p>
      </form>

      <h3 className="logger__recent-title">{L.recent}</h3>
      {recent.length === 0 ? (
        <p className="logger__empty">{L.empty}</p>
      ) : (
        <ol className="logger__list">
          {recent.map((s) => (
            <li key={s.id}>
              <span className="logger__when">{dateFmt.format(s.createdAt)}</span>
              <span className="logger__what">
                <strong>
                  {fmt.n1(s.loadKg)} kg × {s.reps}
                </strong>
                {s.rir !== undefined && <span className="logger__rir"> RIR {s.rir}</span>}
              </span>
              <span className="logger__variant">{s.variantId ? variantById(s.variantId).short : ''}</span>
              <button type="button" className="link-btn" onClick={() => void remove(s.id)}>
                {L.remove}
              </button>
              {s.note && <span className="logger__note">{s.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
