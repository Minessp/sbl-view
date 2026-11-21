import { useId } from 'react';
import { flushSync } from 'react-dom';
import { t } from '@/i18n';
import { useTheme, type ThemeMode } from './theme';

type VTDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

/**
 * Troca de tema como luz que se espalha: View Transition com a imagem nova recortada num círculo que cresce do botão
 * (motion.css → `html.theme-vt`). Sem suporte ou com redução de movimento, troca direto.
 */
function switchTheme(next: ThemeMode, from: HTMLElement, apply: (m: ThemeMode) => void) {
  const doc = document as VTDocument;
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply(next);
    return;
  }
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const root = document.documentElement;
  root.style.setProperty('--vt-x', `${x}px`);
  root.style.setProperty('--vt-y', `${y}px`);
  root.style.setProperty('--vt-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
  root.classList.add('theme-vt');
  const done = () => root.classList.remove('theme-vt');
  doc
    .startViewTransition(() => flushSync(() => apply(next)))
    .finished.then(done, done);
}

/** Um botão: liga e desliga a luz da sala (tema claro). O ícone troca a lua pelo sol. */
export function ThemeSwitch() {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  const light = mode === 'light';
  // A lua é o disco recortado por máscara: pintar a sombra na cor do fundo virava mancha sobre a cena 3D.
  const mask = `moon-${useId().replace(/:/g, '')}`;
  return (
    <button type="button" className="theme-toggle" aria-pressed={light} onClick={(e) => switchTheme(light ? 'dark' : 'light', e.currentTarget, setMode)}>
      <svg viewBox="0 0 20 20" aria-hidden="true" data-mode={mode}>
        <mask id={mask}>
          <rect x="-4" y="-4" width="28" height="28" fill="#fff" />
          <circle className="theme-toggle__shade" cx="13.4" cy="7.2" r="4.2" fill="#000" />
        </mask>
        <circle className="theme-toggle__core" cx="10" cy="10" r="4.2" mask={`url(#${mask})`} />
        <g className="theme-toggle__rays">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="10" y1="1.8" x2="10" y2="3.6" transform={`rotate(${a} 10 10)`} />
          ))}
        </g>
      </svg>
      <span className="visually-hidden">{t.theme.label}</span>
    </button>
  );
}
