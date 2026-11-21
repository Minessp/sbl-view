import { t } from '@/i18n/app';
import { RouteTabs } from '@/ui/RouteTabs';
import { R } from '@/app/routes';

/** Seções do Lab: o agachamento (solver estático) e a comparação entre exercícios. */
export function LabTabs() {
  return (
    <RouteTabs
      label={t.labTabs.label}
      tabs={[
        { href: R.labSquat, also: R.lab, label: t.labTabs.squat },
        { href: R.labCompare, label: t.labTabs.compare },
      ]}
    />
  );
}
