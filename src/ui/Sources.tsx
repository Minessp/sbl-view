import { getReference } from '@/data';
import { t } from '@/i18n';

/** Lista de referências por id. Não conferida = marca "[a verificar]". */
export function Sources({ ids }: { ids: readonly string[] }) {
  const uniq = [...new Set(ids)];
  return (
    <ul className="sources">
      {uniq.map((id) => {
        const r = getReference(id);
        if (!r) return null;
        return (
          <li key={id}>
            {r.citation}
            {r.doi && <> doi:{r.doi}</>}
            {!r.verified && <span className="sources__flag"> {t.evidence.unverified}</span>}
          </li>
        );
      })}
    </ul>
  );
}
