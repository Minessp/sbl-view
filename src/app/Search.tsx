/**
 * Busca global (chunk à parte): vidro no centro da tela, folha cheia no celular. `<dialog>` modal com campo em
 * combobox: setas escolhem, Enter abre (com o corte da troca de rota), Esc fecha. Sem resultado, leva à biblioteca
 * filtrada pelo mesmo texto.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { posterSrc } from '@/features/library/catalog';
import { t } from '@/i18n/app';
import { OTHER, PREFIX } from '@/i18n/locale';
import { useTheme } from '@/ui/theme';
import { R, translatePath } from './routes';
import { buildIndex, search, type Hit } from './searchIndex';
import './search.css';

const S = t.search;

export default function Search({ onClosed, onSettings }: { onClosed: () => void; onSettings: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const list = useId();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const index = useMemo(buildIndex, []);
  const hits = useMemo(() => search(index, q), [index, q]);
  const [loc, navigate] = useLocation();
  const query = useSearch();

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    document.getElementById(`${list}-${sel}`)?.scrollIntoView({ block: 'nearest' });
  }, [list, sel]);

  /** Fecha antes de navegar: o diálogo não entra na foto da troca de rota. */
  const run = (h: Hit) => {
    ref.current?.close();
    if (h.action === 'theme') {
      const st = useTheme.getState();
      st.setMode(st.mode === 'light' ? 'dark' : 'light');
    } else if (h.action === 'settings') onSettings();
    else if (h.action === 'lang') window.location.assign(import.meta.env.BASE_URL.replace(/\/$/, '') + translatePath(PREFIX + loc + (query ? `?${query}` : ''), OTHER));
    else if (h.href) navigate(h.href);
  };

  const onKey = (e: React.KeyboardEvent) => {
    // Esc fecha direto (no campo de busca nativo o primeiro Esc só limparia o texto).
    if (e.key === 'Escape') {
      e.preventDefault();
      ref.current?.close();
      return;
    }
    if (!hits.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = hits[sel];
      if (h) run(h);
    }
  };

  const trimmed = q.trim();
  return (
    <dialog ref={ref} className="search" aria-label={S.label} data-lenis-prevent="" onClose={onClosed} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="search__panel">
        <div className="search__field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.9-3.9" />
          </svg>
          <input
            type="search"
            role="combobox"
            aria-label={S.label}
            aria-expanded={hits.length > 0}
            aria-controls={list}
            aria-activedescendant={hits.length ? `${list}-${sel}` : undefined}
            aria-autocomplete="list"
            aria-describedby={`${list}-keys`}
            placeholder={S.placeholder}
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          <button type="button" className="search__close" onClick={() => ref.current?.close()}>
            <span className="visually-hidden">{S.close}</span>
            <kbd aria-hidden="true">Esc</kbd>
          </button>
        </div>
        <p id={`${list}-keys`} className="visually-hidden">
          {S.keys}
        </p>
        <p className="visually-hidden" aria-live="polite">
          {trimmed ? (hits.length ? S.count(hits.length) : S.empty(trimmed)) : ''}
        </p>
        <ul id={list} role="listbox" aria-label={S.label} className="search__list">
          {hits.map((h, i) => {
            const head = i === 0 || hits[i - 1]?.kind !== h.kind;
            return (
              <li
                key={`${h.kind}:${h.id}`}
                id={`${list}-${i}`}
                role="option"
                aria-selected={i === sel}
                className="search__hit"
                data-kind={h.kind}
                data-head={head ? S.groups[h.kind] : undefined}
                onPointerMove={() => i !== sel && setSel(i)}
                onClick={() => run(h)}
              >
                {h.kind === 'exercise' ? <img className="search__thumb" src={posterSrc(h.id)} alt="" width={44} height={44} loading="lazy" /> : <span className="search__dot" aria-hidden="true" />}
                <span className="search__label">{h.label}</span>
                {h.sub && <span className="search__sub">{h.sub}</span>}
              </li>
            );
          })}
        </ul>
        {trimmed && !hits.length && (
          <div className="search__empty">
            <p>{S.empty(trimmed)}</p>
            <Link href={`${R.library}?q=${encodeURIComponent(trimmed)}`} className="chip" onClick={() => ref.current?.close()}>
              {S.library}
            </Link>
          </div>
        )}
      </div>
    </dialog>
  );
}
