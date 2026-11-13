import type { ReactNode } from 'react';
import { Link, useRoute } from 'wouter';
import { t } from '@/i18n';
import { StageHost } from '@/scene/StageHost';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import { UpdateNotice } from '@/pwa/UpdateNotice';
import './shell.css';

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
        </nav>
        <ThemeSwitch />
      </header>
      <StageHost />
      {children}
      <UpdateNotice />
    </>
  );
}
