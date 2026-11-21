import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { t } from '@/i18n';
import { StageHost } from '@/scene/StageHost';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import { UpdateNotice } from '@/pwa/UpdateNotice';
import { R } from './routes';
import './shell.css';

/** Painel do menu em tela cheia: chunk à parte, pedido quando o ponteiro chega no botão (ou no clique). */
const loadMenu = () => import('./MenuPanel');
const MenuPanel = lazy(loadMenu);
/** Ajustes (rodapé e pé do menu) e rodapé: chunks à parte, fora da primeira pintura. */
const loadSettings = () => import('./Settings');
const Settings = lazy(loadSettings);
const Footer = lazy(() => import('./Footer'));

const SECTIONS = [
  [R.atlas, t.nav.atlas],
  [R.library, t.nav.library],
  [R.lab, t.nav.lab],
  [R.training, t.nav.training],
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
  const [settings, setSettings] = useState(false);
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
          {/* Ícone `menu` do Lucide (ISC), em linha: a shell não importa lucide-react. */}
          <svg className="menu-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path className="menu-btn__line menu-btn__line--top" d="M4 5h16" />
            <path className="menu-btn__line menu-btn__line--mid" d="M4 12h16" />
            <path className="menu-btn__line menu-btn__line--low" d="M4 19h16" />
          </svg>
        </button>
      </header>
      {menu && (
        <Suspense fallback={null}>
          <MenuPanel onClosed={() => setMenu(false)} onSettings={() => setSettings(true)} />
        </Suspense>
      )}
      {settings && (
        <Suspense fallback={null}>
          <Settings onClosed={() => setSettings(false)} />
        </Suspense>
      )}
      <span className="vt-beam" aria-hidden="true" />
      <StageHost />
      {children}
      <Suspense fallback={null}>
        <Footer onSettings={() => setSettings(true)} />
      </Suspense>
      <UpdateNotice />
    </>
  );
}
