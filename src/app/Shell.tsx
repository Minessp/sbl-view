import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, useRoute } from 'wouter';
import { t } from '@/i18n';
import { StageHost } from '@/scene/StageHost';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import { UpdateNotice } from '@/pwa/UpdateNotice';
import './shell.css';

/** Painel do menu em tela cheia: chunk à parte, pedido quando o ponteiro chega no botão (ou no clique). */
const loadMenu = () => import('./MenuPanel');
const MenuPanel = lazy(loadMenu);

/**
 * Ativo na rota e nas filhas (`/atlas` acende em `/atlas/soleus`). O filamento aceso mora só no link ativo;
 * com View Transition ele desliza do link antigo ao novo (motion.css).
 */
function NavLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const [exact] = useRoute(href);
  const [nested] = useRoute(`${href}/*`);
  const active = exact || nested;
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={className}>
      {children}
      {active && <span className="site-nav__indicator" aria-hidden="true" />}
    </Link>
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
        <nav className="site-nav" aria-label={t.nav.label}>
          <NavLink href="/atlas">{t.nav.atlas}</NavLink>
          <NavLink href="/exercicios">{t.nav.library}</NavLink>
          <NavLink href="/lab">{t.nav.lab}</NavLink>
          <NavLink href="/treino">{t.nav.training}</NavLink>
        </nav>
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
      <StageHost />
      {children}
      <UpdateNotice />
    </>
  );
}
