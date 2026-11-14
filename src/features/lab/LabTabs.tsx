import { Link, useRoute } from 'wouter';
import { t } from '@/i18n/app';

function Tab({ href, also, children }: { href: string; also?: string; children: string }) {
  const [a] = useRoute(href);
  const [b] = useRoute(also ?? href);
  return (
    <Link href={href} className="lab-tabs__link" aria-current={a || b ? 'page' : undefined}>
      {children}
    </Link>
  );
}

/** Seções do Lab: o agachamento (solver estático) e a comparação entre exercícios. */
export function LabTabs() {
  return (
    <nav className="lab-tabs" aria-label={t.labTabs.label}>
      <Tab href="/lab/agachamento" also="/lab">
        {t.labTabs.squat}
      </Tab>
      <Tab href="/lab/comparar">{t.labTabs.compare}</Tab>
    </nav>
  );
}
