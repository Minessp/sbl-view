import { useId, useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { Equipment, LibraryExercise, MovementPattern } from '@/data/schema/exercise';
import type { MuscleGroup } from '@/data/schema/muscle';
import { t } from '@/i18n';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { filterExercises, library, muscleById, NO_FILTERS, targetGroups, type ExerciseFilters } from './catalog';
import { EmphasisMark } from './EmphasisMark';
import './library.css';

const PATTERNS = Object.keys(t.patterns) as MovementPattern[];
const EQUIPMENT = (Object.keys(t.equipment) as Equipment[]).filter((q) => library.some((e) => e.equipment.includes(q)));

function ExerciseCard({ e }: { e: LibraryExercise }) {
  const targets = e.targets.filter((x) => x.role === 'alvo').map((x) => muscleById(x.muscle)?.name ?? x.muscle);
  return (
    <li className="ex-card">
      <Link href={`/exercicios/${e.id}`} className="ex-card__link">
        <span className="ex-card__name">{e.name}</span>
        <span className="ex-card__pattern">{t.patterns[e.pattern]}</span>
      </Link>
      <dl className="ex-card__meta">
        <div>
          <dt>{t.library.targets}</dt>
          <dd>{targets.join(', ')}</dd>
        </div>
        <div>
          <dt>{t.exercise.equipment}</dt>
          <dd>{e.equipment.map((q) => t.equipment[q]).join(', ')}</dd>
        </div>
      </dl>
      <p className="ex-card__length">
        <EmphasisMark emphasis={e.length.emphasis} />
        <span>{t.emphasis[e.length.emphasis]}</span>
      </p>
      <EvidenceSeal confidence={e.length.confidence} hypothesis={e.status === 'hipotese'} />
    </li>
  );
}

export default function Library() {
  const uid = useId();
  const [f, setF] = useState<ExerciseFilters>(NO_FILTERS);
  const groups = useMemo(() => targetGroups(), []);
  const list = useMemo(() => filterExercises(library, f), [f]);
  const set = (patch: Partial<ExerciseFilters>) => setF((cur) => ({ ...cur, ...patch }));
  const toggleEq = (q: Equipment) => set({ equipment: f.equipment.includes(q) ? f.equipment.filter((x) => x !== q) : [...f.equipment, q] });
  const dirty = JSON.stringify(f) !== JSON.stringify(NO_FILTERS);
  const L = t.library;

  return (
    <main id="conteudo" className="sheet">
      <header className="sheet__head">
        <p className="sheet__plate">{L.plate}</p>
        <h1 className="sheet__title">{L.title}</h1>
        <p className="sheet__lead prose">{L.lead}</p>
      </header>

      <section className="filters" aria-labelledby={`${uid}-f`}>
        <h2 id={`${uid}-f`} className="visually-hidden">
          {L.filters}
        </h2>
        <div className="filters__row">
          <label className="field">
            <span>{L.group}</span>
            <select value={f.group ?? ''} onChange={(e) => set({ group: (e.target.value || null) as MuscleGroup | null })}>
              <option value="">{L.anyGroup}</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {t.groups[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{L.pattern}</span>
            <select value={f.pattern ?? ''} onChange={(e) => set({ pattern: (e.target.value || null) as MovementPattern | null })}>
              <option value="">{L.anyPattern}</option>
              {PATTERNS.map((p) => (
                <option key={p} value={p}>
                  {t.patterns[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="filters__set">
          <legend>{L.equipment}</legend>
          <div className="filters__chips">
            {EQUIPMENT.map((q) => (
              <button key={q} type="button" className="chip" aria-pressed={f.equipment.includes(q)} onClick={() => toggleEq(q)}>
                {t.equipment[q]}
              </button>
            ))}
          </div>
          <p className="filters__hint">{L.equipmentHint}</p>
        </fieldset>
        <fieldset className="filters__set">
          <legend>{L.status}</legend>
          <div className="filters__chips">
            {([null, 'consolidado', 'hipotese'] as const).map((s) => (
              <button key={s ?? 'all'} type="button" className="chip" aria-pressed={f.status === s} onClick={() => set({ status: s })}>
                {s ? t.status[s] : L.anyStatus}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="toggle">
          <input type="checkbox" checked={f.longOnly} onChange={(e) => set({ longOnly: e.target.checked })} />
          <span className="toggle__track" aria-hidden="true" />
          <span>{L.longOnly}</span>
        </label>
        <div className="filters__foot">
          <p className="filters__count" role="status">
            {list.length} {list.length === 1 ? L.result : L.results}
          </p>
          {dirty && (
            <button type="button" className="link-btn" onClick={() => setF(NO_FILTERS)}>
              {L.clear}
            </button>
          )}
        </div>
      </section>

      {list.length === 0 ? (
        <p className="ex-empty">{L.empty}</p>
      ) : (
        <ul className="ex-grid">
          {list.map((e) => (
            <ExerciseCard key={e.id} e={e} />
          ))}
        </ul>
      )}
    </main>
  );
}
