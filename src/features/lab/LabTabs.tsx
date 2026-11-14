import { t } from '@/i18n/app';
import { RouteTabs } from '@/ui/RouteTabs';

/** Seções do Lab: o agachamento (solver estático) e a comparação entre exercícios. */
export function LabTabs() {
  return (
    <RouteTabs
      label={t.labTabs.label}
      tabs={[
        { href: '/lab/agachamento', also: '/lab', label: t.labTabs.squat },
        { href: '/lab/comparar', label: t.labTabs.compare },
      ]}
    />
  );
}
