/**
 * Menu em tela cheia (chunk à parte). `<dialog>` modal: foco preso, Esc fecha, o resto da página fica inerte.
 * Vidro sobre o palco: o corpo da página continua lá, escurecido. Os nomes entram letra a letra; o da linha sob o
 * ponteiro ou o foco alonga (largura da fonte) e os outros encurtam. Linha de baixo: abas do Treino, Buscar, idioma,
 * Ajustes. A barra de cima repete o cabeçalho no mesmo lugar (marca, tema, e "Fechar" onde estava "Menu").
 */
import { Dumbbell, FlaskConical, Layers, NotebookPen, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'wouter';
import { t as tShell } from '@/i18n';
import { t } from '@/i18n/app';
import { SplitText } from '@/ui/Title';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import { LangLink } from './LangLink';
import './menu.css';
import { R } from './routes';

const D = tShell.home.doors;
const TR = t.training.tabs;
const SECTIONS: readonly { href: string; name: string; body: string; icon: LucideIcon }[] = [
  { href: R.atlas, ...D.atlas, icon: Layers },
  { href: R.library, ...D.library, icon: Dumbbell },
  { href: R.lab, ...D.lab, icon: FlaskConical },
  { href: R.training, ...D.training, icon: NotebookPen },
];
const TRAINING = [
  [R.training, TR.log],
  [R.plan, TR.plan],
  [R.history, TR.history],
  [R.progress, TR.progress],
  [R.analysis, TR.analysis],
  [R.data, TR.data],
] as const;

/** Duração da saída (motion.css: --t-exit); com redução de movimento, fecha na hora. */
const EXIT_MS = 220;

export default function MenuPanel({ onClosed, onSettings, onSearch }: { onClosed: () => void; onSettings: () => void; onSearch: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [loc] = useLocation();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    dlg.showModal();
    close.current?.focus();
    document.documentElement.classList.add('menu-open');
    return () => document.documentElement.classList.remove('menu-open');
  }, []);

  /** Fecha com a cortina subindo; ao navegar, fecha na hora (a troca de rota já é a animação). */
  const shut = (animated: boolean) => {
    const dlg = ref.current;
    if (!dlg || dlg.dataset.state === 'closing') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animated || reduce) {
      dlg.close();
      onClosed();
      return;
    }
    dlg.dataset.state = 'closing';
    window.setTimeout(() => {
      dlg.close();
      onClosed();
    }, EXIT_MS);
  };

  const here = (href: string) => loc === href || loc.startsWith(`${href}/`);
  const current = SECTIONS.findIndex((s) => here(s.href));
  /** Linha sob o ponteiro ou o foco; sem nenhuma, a placa repousa na seção atual. */
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? (current >= 0 ? current : null);

  return (
    <dialog
      ref={ref}
      className="menu"
      aria-label={t.menu.label}
      data-lenis-prevent=""
      onCancel={(e) => {
        e.preventDefault();
        shut(true);
      }}
    >
      <div className="menu__bar">
        <Link href="/" className="wordmark" aria-label={tShell.meta.name} onClick={() => shut(false)}>
          <span className="wordmark__sbl">SBL</span>
          <span className="wordmark__view">View</span>
        </Link>
        <ThemeSwitch />
        <button ref={close} type="button" className="menu-btn menu-btn--close" aria-label={t.menu.closeLabel} onClick={() => shut(true)}>
          <span className="menu-btn__label">{t.menu.close}</span>
          <X className="menu-btn__icon" size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <nav className="menu__nav" aria-label={t.menu.sections}>
        <ol className="menu__list" data-lit={lit !== null} onPointerLeave={() => setHover(null)}>
          {SECTIONS.map((s, k) => (
            <li key={s.href} className="menu__item" data-lit={lit === k} style={{ '--k': k, '--d': `${140 + k * 70}ms` } as CSSProperties}>
              <Link
                href={s.href}
                className="menu__link"
                aria-current={here(s.href) ? 'page' : undefined}
                onClick={() => shut(false)}
                onPointerEnter={() => setHover(k)}
                onFocus={() => setHover(k)}
                onBlur={() => setHover(null)}
              >
                <span className="menu__num" aria-hidden="true">
                  <s.icon size={18} strokeWidth={1.4} className="menu__icon" />
                  {String(k + 1).padStart(2, '0')}
                </span>
                <span className="menu__name">
                  <SplitText text={s.name} />
                </span>
                <span className="menu__body">{s.body}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <div className="menu__foot">
        <ul className="menu__sub" aria-label={t.menu.training}>
          {TRAINING.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="chip chip--small" aria-current={loc === href ? 'page' : undefined} onClick={() => shut(false)}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="menu__tools">
          <button type="button" className="chip chip--small" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K /" onClick={onSearch}>
            {t.menu.search}
          </button>
          <LangLink className="chip chip--small" />
          <button
            type="button"
            className="chip chip--small"
            aria-haspopup="dialog"
            onClick={() => {
              shut(false);
              onSettings();
            }}
          >
            {t.footer.settings}
          </button>
        </div>
      </div>
    </dialog>
  );
}
