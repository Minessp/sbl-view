import type { ReactNode } from 'react';
import { Link, useRoute } from 'wouter';
import { t } from '@/i18n';
import { StageHost } from '@/scene/StageHost';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import './shell.css';

/** Ativo na rota e nas filhas (`/atlas` acende em `/atlas/soleus`). */
function NavLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const [exact] = useRoute(href);
  const [nested] = useRoute(`${href}/*`);
  return (
    <Link href={href} aria-current={exact || nested ? 'page' : undefined} className={className}>
      {children}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#conteudo">
        {t.nav.skip}
      </a>
      <header className="site-header">
        <Link href="/" className="wordmark" aria-label={t.meta.name}>
          <span className="wordmark__sbl">SBL</span>
          <span className="wordmark__view">View</span>
        </Link>
        <nav className="site-nav" aria-label={t.nav.label}>
          <NavLink href="/atlas">{t.nav.atlas}</NavLink>
          <NavLink href="/exercicios">{t.nav.library}</NavLink>
          <NavLink href="/lab">{t.nav.lab}</NavLink>
          <NavLink href="/treino">{t.nav.training}</NavLink>
          <NavLink href="/sistema" className="site-nav__extra">
            {t.nav.system}
          </NavLink>
        </nav>
        <ThemeSwitch />
      </header>
      <StageHost />
      {children}
    </>
  );
}
