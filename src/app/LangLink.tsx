import { useLocation, useSearch } from 'wouter';
import { t } from '@/i18n';
import { OTHER, PREFIX } from '@/i18n/locale';
import { translatePath } from './routes';

const site = import.meta.env.BASE_URL.replace(/\/$/, '');

/** A mesma página no outro idioma. Link comum, com recarga: o idioma é do build (`t` é constante no pacote). */
export function LangLink({ className }: { className?: string }) {
  const [loc] = useLocation();
  const search = useSearch();
  const href = site + translatePath(PREFIX + loc + (search ? `?${search}` : ''), OTHER);
  return (
    <a href={href} hrefLang={OTHER} lang={OTHER} className={className} aria-label={t.lang.otherLabel}>
      {t.lang.other}
    </a>
  );
}
