/**
 * Menu em tela cheia (chunk à parte). `<dialog>` modal: foco preso, Esc fecha, o resto da página fica inerte.
 * A cortina desce do cabeçalho, os nomes das seções entram letra a letra em cascata e o fio de cada linha se acende.
 * A barra de cima repete o cabeçalho no mesmo lugar (marca, tema, e "Fechar" onde estava "Menu").
 */
import { Dumbbell, FlaskConical, Layers, NotebookPen, X, type LucideIcon } from 'lucide-react';
import { domMax, LazyMotion, m } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'wouter';
import { t as tShell } from '@/i18n';
import { t } from '@/i18n/app';
import { SplitText } from '@/ui/Title';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import './menu.css';
import { LangLink } from './LangLink';
import { R } from './routes';

const D = tShell.home.doors;
const TR = t.training.tabs;
const SECTIONS: readonly { href: string; name: string; body: string; icon: LucideIcon; sub?: readonly (readonly [string, string])[] }[] = [
  { href: R.atlas, ...D.atlas, icon: Layers },
  { href: R.library, ...D.library, icon: Dumbbell },
  { href: R.lab, ...D.lab, icon: FlaskConical },
  {
    href: R.training,
    ...D.training,
    icon: NotebookPen,
    sub: [
      [R.training, TR.log],
      [R.plan, TR.plan],
      [R.history, TR.history],
      [R.progress, TR.progress],
      [R.analysis, TR.analysis],
      [R.data, TR.data],
    ],
  },
];

/** Duração da saída (motion.css: --t-exit); com redução de movimento, fecha na hora. */
const EXIT_MS = 220;

export default function MenuPanel({ onClosed, onSettings }: { onClosed: () => void; onSettings: () => void }) {
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
        <LazyMotion features={domMax}>
        <ol className="menu__list" onPointerLeave={() => setHover(null)}>
          {SECTIONS.map((s, k) => (
            <li key={s.href} className="menu__item" style={{ '--k': k, '--d': `${140 + k * 70}ms` } as CSSProperties}>
              <Link
                href={s.href}
                className="menu__link lamp"
                aria-current={here(s.href) ? 'page' : undefined}
                onClick={() => shut(false)}
                onPointerEnter={() => setHover(k)}
                onFocus={() => setHover(k)}
                onBlur={() => setHover(null)}
              >
                {lit === k && <m.span layoutId="menu-plate" className="menu__plate" aria-hidden="true" transition={{ type: 'spring', stiffness: 380, damping: 36 }} />}
                <span className="menu__num" aria-hidden="true">
                  <s.icon size={18} strokeWidth={1.4} className="menu__icon" />
                  {String(k + 1).padStart(2, '0')}
                </span>
                <span className="menu__name">
                  <SplitText text={s.name} />
                </span>
                <span className="menu__body">{s.body}</span>
              </Link>
              {s.sub && (
                <ul className="menu__sub" aria-label={t.menu.training}>
                  {s.sub.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href} className="chip chip--small" aria-current={loc === href ? 'page' : undefined} onClick={() => shut(false)}>
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        </LazyMotion>
      </nav>
      <div className="menu__foot">
        <p>{t.menu.foot}</p>
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
        <LangLink className="chip chip--small" />
      </div>
    </dialog>
  );
}
