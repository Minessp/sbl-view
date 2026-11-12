import { Link } from 'wouter';
import { muscleDefs } from '@/data';
import { t } from '@/i18n';
import { musclesInGroup, REGIONS } from '@/features/library/catalog';
import './atlas.css';

export default function AtlasIndex() {
  const A = t.atlas;
  return (
    <main id="conteudo" className="sheet">
      <header className="sheet__head">
        <p className="sheet__plate">{A.plate}</p>
        <h1 className="sheet__title">{A.title}</h1>
        <p className="sheet__lead prose">{A.lead}</p>
        <p className="sheet__count">
          {muscleDefs.length} {A.count}
        </p>
      </header>
      <div className="atlas-index">
        {REGIONS.map((r) => (
          <section key={r.id} className="atlas-region" aria-labelledby={`reg-${r.id}`}>
            <h2 id={`reg-${r.id}`} className="atlas-region__title">
              {t.regions[r.id as keyof typeof t.regions]}
            </h2>
            {r.groups.map((g) => {
              const list = musclesInGroup(g);
              if (list.length === 0) return null;
              return (
                <div key={g} className="atlas-group">
                  <h3 className="atlas-group__title">{t.groups[g]}</h3>
                  <ul className="atlas-group__list">
                    {list.map((m) => (
                      <li key={m.id}>
                        <Link href={`/atlas/${m.id}`} className="atlas-entry">
                          <span className="atlas-entry__name">{m.name}</span>
                          <span className="atlas-entry__latin latin">{m.latin}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
