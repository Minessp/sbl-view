import { Link } from 'wouter';
import { t } from '@/i18n';

const LINKS = [
  ['/atlas', t.nav.atlas],
  ['/exercicios', t.nav.library],
  ['/lab', t.nav.lab],
  ['/treino', t.nav.training],
] as const;

export function NotFound() {
  return (
    <main id="conteudo" className="page page--message">
      <p className="page__eyebrow">404</p>
      <h1 className="page-title">{t.page.notFound}</h1>
      <p className="page__lead">{t.page.notFoundLead}</p>
      <ul className="page__links">
        <li>
          <Link href="/">{t.page.notFoundHome}</Link>
        </li>
        {LINKS.map(([href, label]) => (
          <li key={href}>
            <Link href={href}>{label}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
