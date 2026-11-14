/**
 * Trilho de abas entre rotas irmãs (Treino, Lab). Uma linha só: no celular rola na horizontal e a aba atual vem para
 * o meio. A pílula acesa tem `view-transition-name`, então na troca de rota ela desliza de uma aba para a outra.
 */
import { useLayoutEffect, useRef } from 'react';
import { Link, useRoute } from 'wouter';
import './route-tabs.css';

export interface RouteTab {
  href: string;
  /** Outra rota que também acende esta aba (ex.: `/lab` para "Agachamento"). */
  also?: string;
  label: string;
}

function Tab({ href, also, label }: RouteTab) {
  const [a] = useRoute(href);
  const [b] = useRoute(also ?? href);
  return (
    <Link href={href} className="route-tabs__link" aria-current={a || b ? 'page' : undefined}>
      {label}
    </Link>
  );
}

export function RouteTabs({ label, tabs, className = '' }: { label: string; tabs: readonly RouteTab[]; className?: string }) {
  const nav = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = nav.current;
    const cur = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !cur || el.scrollWidth <= el.clientWidth) return;
    // scrollLeft direto: scrollIntoView também rolaria a página na vertical.
    el.scrollLeft = cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2;
  });
  return (
    <nav ref={nav} className={`route-tabs ${className}`} aria-label={label}>
      {tabs.map((tab) => (
        <Tab key={tab.href} {...tab} />
      ))}
    </nav>
  );
}
