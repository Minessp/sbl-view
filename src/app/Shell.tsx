import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { t } from '@/i18n';
import { StageHost } from '@/scene/StageHost';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import { UpdateNotice } from '@/pwa/UpdateNotice';
import './shell.css';

/** Painel do menu em tela cheia: chunk à parte, pedido quando o ponteiro chega no botão (ou no clique). */
const loadMenu = () => import('./MenuPanel');
const MenuPanel = lazy(loadMenu);

const SECTIONS = [
  ['/atlas', t.nav.atlas],
  ['/exercicios', t.nav.library],
  ['/lab', t.nav.lab],
  ['/treino', t.nav.training],
] as const;

/**
 * Seção atual ao lado da marca (a navegação mora no menu). Na View Transition o nome troca pela penumbra
 * (motion.css → site-where). Leitor de tela já tem o h1; aqui é só orientação visual.
 */
function Where() {
  const [loc] = useLocation();
  const name = SECTIONS.find(([href]) => loc === href || loc.startsWith(`${href}/`))?.[1];
  return (
    <span className="site-where" aria-hidden="true" data-on={name !== undefined}>
      {name}
    </span>
  );
}

/** Cabeçalho transparente no topo; o véu entra quando o conteúdo começa a passar por baixo. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return scrolled;
}

/** No toque não há "ponteiro em cima": o painel é pedido quando o navegador fica ocioso depois da primeira carga. */
function usePreloadMenu() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(() => void loadMenu());
      else void loadMenu();
    }, 2500);
    return () => window.clearTimeout(id);
  }, []);
}

export function Shell({ children }: { children: ReactNode }) {
  const scrolled = useScrolled();
  const [menu, setMenu] = useState(false);
  usePreloadMenu();
  return (
    <>
      <a className="skip-link" href="#conteudo">
        {t.nav.skip}
      </a>
      <header className="site-header" data-scrolled={scrolled}>
        <Link href="/" className="wordmark" aria-label={t.meta.name}>
          <span className="wordmark__sbl">SBL</span>
          <span className="wordmark__view">View</span>
        </Link>
        <Where />
        <ThemeSwitch />
        <button
          type="button"
          className="menu-btn"
          aria-haspopup="dialog"
          aria-expanded={menu}
          aria-label={t.nav.menuOpen}
          onPointerEnter={() => void loadMenu()}
          onFocus={() => void loadMenu()}
          onClick={() => setMenu(true)}
        >
          <span className="menu-btn__label">{t.nav.menu}</span>
          <span className="menu-btn__icon" aria-hidden="true" />
        </button>
      </header>
      {menu && (
        <Suspense fallback={null}>
          <MenuPanel onClosed={() => setMenu(false)} />
        </Suspense>
      )}
      <span className="vt-beam" aria-hidden="true" />
      <StageHost />
      {children}
      <UpdateNotice />
    </>
  );
}
