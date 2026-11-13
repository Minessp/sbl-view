import { t } from '@/i18n';
import { useTheme } from './theme';

/** Um botão: liga e desliga a luz da sala (tema claro). O ícone troca a lua pelo sol. */
export function ThemeSwitch() {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  const light = mode === 'light';
  return (
    <button type="button" className="theme-toggle" aria-pressed={light} onClick={() => setMode(light ? 'dark' : 'light')}>
      <svg viewBox="0 0 20 20" aria-hidden="true" data-mode={mode}>
        <circle className="theme-toggle__core" cx="10" cy="10" r="4.2" />
        <g className="theme-toggle__rays">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="10" y1="1.8" x2="10" y2="3.6" transform={`rotate(${a} 10 10)`} />
          ))}
        </g>
        <circle className="theme-toggle__shade" cx="13.4" cy="7.2" r="4.2" />
      </svg>
      <span className="visually-hidden">{t.theme.label}</span>
    </button>
  );
}
