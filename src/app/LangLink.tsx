import { useLocation, useSearch } from 'wouter';
import { t } from '@/i18n';
import { OTHER, PREFIX } from '@/i18n/locale';
import { translatePath } from './routes';

const site = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Bandeira do idioma de destino (no cabeçalho). Desenho simplificado: legível a 22 px. */
function Flag() {
  return OTHER === 'en' ? (
    <svg viewBox="0 0 19 10" aria-hidden="true">
      <rect width="19" height="10" fill="var(--flag-us-red)" />
      <path d="M0 1.15h19M0 2.7h19M0 4.23h19M0 5.77h19M0 7.3h19M0 8.85h19" stroke="var(--flag-white)" strokeWidth="0.77" />
      <rect width="7.6" height="5.38" fill="var(--flag-us-blue)" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 14" aria-hidden="true">
      <rect width="20" height="14" fill="var(--flag-br-green)" />
      <path d="M10 1.7 18.3 7 10 12.3 1.7 7z" fill="var(--flag-br-yellow)" />
      <circle cx="10" cy="7" r="3.5" fill="var(--flag-br-blue)" />
    </svg>
  );
}

/** A mesma página no outro idioma. Link comum, com recarga: o idioma é do build (`t` é constante no pacote). */
export function LangLink({ className, flag = false }: { className?: string; flag?: boolean }) {
  const [loc] = useLocation();
  const search = useSearch();
  const href = site + translatePath(PREFIX + loc + (search ? `?${search}` : ''), OTHER);
  return (
    <a href={href} hrefLang={OTHER} lang={OTHER} className={className} aria-label={t.lang.otherLabel}>
      {flag ? <Flag /> : t.lang.other}
    </a>
  );
}
