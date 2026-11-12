import { t } from '@/i18n';
import { useTheme, type ThemeMode } from './theme';

const MODES: ThemeMode[] = ['system', 'light', 'dark'];

export function ThemeSwitch() {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  return (
    <div className="theme-switch" role="group" aria-label={t.theme.label}>
      {MODES.map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
          {t.theme[m]}
        </button>
      ))}
    </div>
  );
}
