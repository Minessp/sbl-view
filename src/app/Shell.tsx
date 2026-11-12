import type { ReactNode } from 'react';
import { Link, useRoute } from 'wouter';
import { t } from '@/i18n';
import { StageHost } from '@/scene/StageHost';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import './shell.css';

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const [active] = useRoute(href);
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}>
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
          <NavLink href="/">{t.nav.home}</NavLink>
          <NavLink href="/lab/agachamento">{t.nav.lab}</NavLink>
          <NavLink href="/sistema">{t.nav.system}</NavLink>
        </nav>
        <ThemeSwitch />
      </header>
      <StageHost />
      {children}
    </>
  );
}
