/**
 * Menu em tela cheia (chunk à parte). `<dialog>` modal: foco preso, Esc fecha, o resto da página fica inerte.
 * A cortina desce do cabeçalho, os nomes das seções entram letra a letra em cascata e o fio de cada linha se acende.
 * A barra de cima repete o cabeçalho no mesmo lugar (marca, tema, e "Fechar" onde estava "Menu").
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { Link, useLocation } from 'wouter';
import { t as tShell } from '@/i18n';
import { t } from '@/i18n/app';
import { SplitText } from '@/ui/Title';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import './menu.css';

const D = tShell.home.doors;
const TR = t.training.tabs;
const SECTIONS = [
  { href: '/atlas', ...D.atlas },
  { href: '/exercicios', ...D.library },
  { href: '/lab', ...D.lab },
  {
    href: '/treino',
    ...D.training,
    sub: [
      ['/treino', TR.log],
      ['/treino/plano', TR.plan],
      ['/treino/historico', TR.history],
      ['/treino/progresso', TR.progress],
      ['/treino/analise', TR.analysis],
      ['/treino/dados', TR.data],
    ] as const,
  },
] as const;

/** Duração da saída (motion.css: --t-exit); com redução de movimento, fecha na hora. */
const EXIT_MS = 220;

export default function MenuPanel({ onClosed }: { onClosed: () => void }) {
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
          <span className="menu-btn__icon" aria-hidden="true" />
        </button>
      </div>
      <nav className="menu__nav" aria-label={t.menu.sections}>
        <ol className="menu__list">
          {SECTIONS.map((s, k) => (
            <li key={s.href} className="menu__item" style={{ '--k': k, '--d': `${140 + k * 70}ms` } as CSSProperties}>
              <Link href={s.href} className="menu__link lamp" aria-current={here(s.href) ? 'page' : undefined} onClick={() => shut(false)}>
                <span className="menu__num" aria-hidden="true">
                  {String(k + 1).padStart(2, '0')}
                </span>
                <span className="menu__name">
                  <SplitText text={s.name} />
                </span>
                <span className="menu__body">{s.body}</span>
              </Link>
              {'sub' in s && (
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
      </nav>
      <p className="menu__foot">{t.menu.foot}</p>
    </dialog>
  );
}
