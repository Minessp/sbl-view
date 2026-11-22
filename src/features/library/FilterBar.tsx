/**
 * Barra de filtros da biblioteca, presa ao rolar: busca, parte do corpo, músculo tocado no corpo e contador sempre à
 * vista; o resto (grupo, padrão, equipamento, status, comprimento longo) numa folha de vidro (`<dialog>` modal).
 */
import { useId, useMemo, useRef, type ReactNode } from 'react';
import type { Equipment, MovementPattern } from '@/data/schema/exercise';
import { t } from '@/i18n/app';
import { EXERCISE_REGIONS, library, muscleById, NO_FILTERS, targetGroups, toQuery, type ExerciseFilters } from './catalog';

const PATTERNS = Object.keys(t.patterns) as MovementPattern[];
const EQUIPMENT = (Object.keys(t.equipment) as Equipment[]).filter((q) => library.some((e) => e.equipment.includes(q)));

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

function Set({ legend, children, hint }: { legend: string; children: ReactNode; hint?: string }) {
  return (
    <fieldset className="filter-sheet__set">
      <legend>{legend}</legend>
      <div className="filter-sheet__chips">{children}</div>
      {hint && <p className="filter-sheet__hint">{hint}</p>}
    </fieldset>
  );
}

export function FilterBar({ f, set, count }: { f: ExerciseFilters; set: (patch: Partial<ExerciseFilters>) => void; count: number }) {
  const uid = useId();
  const dlg = useRef<HTMLDialogElement>(null);
  const groups = useMemo(() => targetGroups(), []);
  const L = t.library;
  const more = (f.group ? 1 : 0) + (f.pattern ? 1 : 0) + (f.status ? 1 : 0) + (f.longOnly ? 1 : 0) + f.equipment.length;
  const dirty = toQuery(f) !== '';
  const results = `${count} ${count === 1 ? L.result : L.results}`;
  const toggleEq = (q: Equipment) => set({ equipment: f.equipment.includes(q) ? f.equipment.filter((x) => x !== q) : [...f.equipment, q] });

  return (
    <div className="filter-bar">
      <div className="filter-bar__row">
        <label className="filter-bar__search">
          <span className="visually-hidden">{L.search}</span>
          <input type="search" value={f.query} placeholder={`${L.search}: ${L.searchHint.toLowerCase()}`} onChange={(e) => set({ query: e.target.value })} />
        </label>
        <div className="filter-bar__seg" role="group" aria-label={L.region}>
          {([null, ...EXERCISE_REGIONS] as const).map((r) => (
            <Chip key={r ?? 'all'} on={f.region === r} onClick={() => set({ region: r })}>
              {r ? L.regions[r] : L.anyRegion}
            </Chip>
          ))}
        </div>
        <button type="button" className="chip filter-bar__more" aria-haspopup="dialog" onClick={() => dlg.current?.showModal()}>
          {L.moreFilters}
          {more > 0 && <span className="filter-bar__badge">{more}</span>}
        </button>
      </div>
      <div className="filter-bar__row filter-bar__row--meta">
        <p className="filter-bar__count" role="status">
          {results}
        </p>
        {f.muscle && (
          <button type="button" className="chip chip--small filter-bar__muscle" aria-pressed="true" aria-label={`${L.removeMuscle}: ${muscleById(f.muscle)?.name ?? f.muscle}`} onClick={() => set({ muscle: null })}>
            {L.muscle}: {muscleById(f.muscle)?.name ?? f.muscle}
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
        {dirty && (
          <button type="button" className="link-btn" onClick={() => set(NO_FILTERS)}>
            {L.clear}
          </button>
        )}
      </div>

      <dialog
        ref={dlg}
        className="filter-sheet"
        aria-labelledby={`${uid}-t`}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="filter-sheet__panel">
          <header className="filter-sheet__head">
            <h2 id={`${uid}-t`}>{L.filters}</h2>
            <button type="button" className="filter-sheet__close" aria-label={L.closeFilters} onClick={() => dlg.current?.close()}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          </header>
          <Set legend={L.group}>
            <Chip on={!f.group} onClick={() => set({ group: null })}>
              {L.anyGroup}
            </Chip>
            {groups.map((g) => (
              <Chip key={g} on={f.group === g} onClick={() => set({ group: f.group === g ? null : g })}>
                {t.groups[g]}
              </Chip>
            ))}
          </Set>
          <Set legend={L.pattern}>
            <Chip on={!f.pattern} onClick={() => set({ pattern: null })}>
              {L.anyPattern}
            </Chip>
            {PATTERNS.map((p) => (
              <Chip key={p} on={f.pattern === p} onClick={() => set({ pattern: f.pattern === p ? null : p })}>
                {t.patterns[p]}
              </Chip>
            ))}
          </Set>
          <Set legend={L.equipment} hint={L.equipmentHint}>
            {EQUIPMENT.map((q) => (
              <Chip key={q} on={f.equipment.includes(q)} onClick={() => toggleEq(q)}>
                {t.equipment[q]}
              </Chip>
            ))}
          </Set>
          <Set legend={L.status}>
            {([null, 'consolidado', 'hipotese'] as const).map((s) => (
              <Chip key={s ?? 'all'} on={f.status === s} onClick={() => set({ status: s })}>
                {s ? t.status[s] : L.anyStatus}
              </Chip>
            ))}
          </Set>
          <label className="toggle">
            <input type="checkbox" checked={f.longOnly} onChange={(e) => set({ longOnly: e.target.checked })} />
            <span className="toggle__track" aria-hidden="true" />
            <span>{L.longOnly}</span>
          </label>
          <footer className="filter-sheet__foot">
            <button type="button" className="btn-primary" onClick={() => dlg.current?.close()}>
              {L.showResults} · {results}
            </button>
          </footer>
        </div>
      </dialog>
    </div>
  );
}
