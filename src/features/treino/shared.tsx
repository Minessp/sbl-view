/**
 * Peças comuns das páginas do Treino: cabeçalho com abas, formatação e a linha de série
 * (leitura e edição no lugar).
 */
import { useState } from 'react';
import { Link, useRoute } from 'wouter';
import { fmt, locale, t } from '@/i18n/app';
import { exerciseById } from '@/features/library/catalog';
import squatJson from '@/data/exercises/squat.json';
import type { Exercise } from '@/data/schema/exercise';
import { repository } from '@/storage/db';
import { SET_KINDS, type SetEntry, type SetKind, type Unit } from '@/storage/types';
import { fmtLoad, fromKg, toKg, useUnit } from './units';
import './treino.css';
import { Title } from '@/ui/Title';

export const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long' });
export const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
export const shortDateFmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });

const squat = squatJson as unknown as Exercise;

/** Variações conhecidas por exercício (hoje só o agachamento do Lab tem). */
export function variantsOf(exerciseId: string): { id: string; label: string; short: string }[] {
  const e = exerciseById(exerciseId);
  return e?.labId === squat.id ? squat.variants : [];
}

export function variantShort(exerciseId: string, variantId: string | undefined): string {
  if (!variantId) return '';
  return variantsOf(exerciseId).find((v) => v.id === variantId)?.short ?? '';
}

export const exerciseName = (id: string): string => exerciseById(id)?.name ?? id;

/** "42,5" ou "42.5" → 42.5; inválido → NaN. */
export const parseLoad = (s: string): number => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
export const loadValid = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 2000;
export const repsValid = (n: number): boolean => Number.isInteger(n) && n > 0 && n <= 1000;

function Tab({ href, children }: { href: string; children: string }) {
  const [active] = useRoute(href);
  return (
    <Link href={href} className="tabs__link" aria-current={active ? 'page' : undefined}>
      {children}
    </Link>
  );
}

export function TreinoHeader({ title, lead }: { title: string; lead: string }) {
  const L = t.training;
  return (
    <header className="sheet__head">
      <p className="sheet__plate">{L.plate}</p>
      <Title text={title} />
      <p className="sheet__lead prose">{lead}</p>
      <nav className="tabs" aria-label={L.tabs.label}>
        <Tab href="/treino">{L.tabs.log}</Tab>
        <Tab href="/treino/plano">{L.tabs.plan}</Tab>
        <Tab href="/treino/historico">{L.tabs.history}</Tab>
        <Tab href="/treino/progresso">{L.tabs.progress}</Tab>
        <Tab href="/treino/analise">{L.tabs.analysis}</Tab>
        <Tab href="/treino/dados">{L.tabs.data}</Tab>
      </nav>
    </header>
  );
}

export function KindSelect({ value, onChange }: { value: SetKind; onChange: (k: SetKind) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as SetKind)}>
      {SET_KINDS.map((k) => (
        <option key={k} value={k}>
          {t.training.kinds[k]}
        </option>
      ))}
    </select>
  );
}

export function RirSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t.training.rirNone}</option>
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

const setLabel = (s: SetEntry, unit: Unit) => `${fmtLoad(s.loadKg, unit)} × ${s.reps}`;

/** Uma série: hora, exercício, carga × reps; editar e apagar no lugar. */
export function SetRow({ set, showExercise = true, onChanged }: { set: SetEntry; showExercise?: boolean; onChanged: () => void }) {
  const L = t.training;
  const unit = useUnit();
  const [editing, setEditing] = useState(false);
  const [load, setLoad] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState('');
  const [kind, setKind] = useState<SetKind>('trabalho');
  const [note, setNote] = useState('');
  const [error, setError] = useState(false);

  function open() {
    setLoad(fmt.n1(fromKg(set.loadKg, unit)));
    setReps(String(set.reps));
    setRir(set.rir === undefined ? '' : String(set.rir));
    setKind(set.kind);
    setNote(set.note ?? '');
    setError(false);
    setEditing(true);
  }

  const loadN = parseLoad(load);
  const repsN = Number(reps);
  const ok = loadValid(toKg(loadN, unit)) && repsValid(repsN);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    try {
      await repository().updateSet(set.id, { loadKg: toKg(loadN, unit), reps: repsN, kind, rir: rir === '' ? null : Number(rir), note: note.trim() || null });
      setEditing(false);
      onChanged();
    } catch {
      setError(true);
    }
  }

  async function remove() {
    try {
      await repository().deleteSet(set.id);
      onChanged();
    } catch {
      setError(true);
    }
  }

  if (editing) {
    return (
      <li className="set-row set-row--edit">
        <form className="set-edit" onSubmit={save} aria-label={`${L.editLabel}: ${setLabel(set, unit)}`}>
          <label className="field">
            <span>{L.loadIn(unit)}</span>
            <input inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} aria-invalid={!loadValid(loadN)} />
          </label>
          <label className="field">
            <span>{L.reps}</span>
            <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} aria-invalid={!repsValid(repsN)} />
          </label>
          <label className="field">
            <span>{L.rir}</span>
            <RirSelect value={rir} onChange={setRir} />
          </label>
          <label className="field">
            <span>{L.kind}</span>
            <KindSelect value={kind} onChange={setKind} />
          </label>
          <label className="field field--wide">
            <span>{L.note}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </label>
          <div className="set-edit__actions">
            <button type="submit" className="btn-secondary" disabled={!ok}>
              {L.apply}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              {L.cancel}
            </button>
          </div>
          {error && (
            <p className="logger__status" role="status">
              {L.error}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="set-row" data-kind={set.kind}>
      <span className="logger__when">{timeFmt.format(set.createdAt)}</span>
      <span className="logger__what">
        {showExercise && <span className="logger__ex">{exerciseName(set.exerciseId)} </span>}
        <strong>{setLabel(set, unit)}</strong>
        {set.rir !== undefined && <span className="logger__rir"> RIR {set.rir}</span>}
        {set.kind !== 'trabalho' && <span className="set-row__kind"> {L.kinds[set.kind]}</span>}
        {set.variantId && <span className="logger__variant"> {variantShort(set.exerciseId, set.variantId)}</span>}
      </span>
      <button type="button" className="link-btn" aria-label={`${L.editLabel}: ${setLabel(set, unit)}`} onClick={open}>
        {L.edit}
      </button>
      <button type="button" className="link-btn" aria-label={`${L.removeLabel}: ${setLabel(set, unit)}`} onClick={() => void remove()}>
        {L.remove}
      </button>
      {set.note && <span className="logger__note">{set.note}</span>}
      {error && (
        <span className="logger__status" role="status">
          {L.error}
        </span>
      )}
    </li>
  );
}
