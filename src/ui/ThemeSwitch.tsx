import { t } from '@/i18n';
import { useTheme, type ThemeMode } from './theme';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

/** Três estados lado a lado; em telas estreitas vira um botão que alterna (CSS decide qual aparece). */
export function ThemeSwitch() {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length] ?? 'system';
  return (
    <>
      <div className="theme-switch" role="group" aria-label={t.theme.label}>
        {MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t.theme[m]}
          </button>
        ))}
      </div>
      <button type="button" className="theme-cycle" onClick={() => setMode(next)} aria-label={`${t.theme.label}: ${t.theme[mode]}. Trocar para ${t.theme[next]}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" data-mode={mode} />
        </svg>
      </button>
    </>
  );
}
