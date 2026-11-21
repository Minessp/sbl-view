import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { muscleDefs } from '@/data';
import { t } from '@/i18n/app';
import { musclesInGroup, REGIONS } from '@/features/library/catalog';
import { CameraBar, LayerControls, Search, SelectionCard, ToolControls } from './explorer/Panel';
import { Viewport } from './explorer/Viewport';
import { defaultView, useAtlas } from './store';
import './atlas.css';
import './explorer/explorer.css';
import { Title } from '@/ui/Title';
import { muscleHref } from '@/app/routes';

function Explorer() {
  return (
    <section className="explorer" aria-label={t.atlas.ex.region}>
      <div className="explorer__stage">
        <Viewport label={t.atlas.ex.viewer} className="explorer__view" />
        <CameraBar />
        <p className="explorer__hint" aria-hidden="true">
          {t.atlas.ex.gestures}
        </p>
        <p className="atlas-stage__credit">{t.body.credit}</p>
      </div>
      <div className="explorer__panel">
        <Search />
        <SelectionCard />
        <LayerControls />
        <ToolControls />
      </div>
    </section>
  );
}

export default function AtlasIndex() {
  const A = t.atlas;
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Vindo da página inicial com uma parte sem página (osso…): chega selecionada.
    useAtlas.getState().reset(useAtlas.getState().handoff?.selection ?? null, 'front');
  }, []);
  const showOnBody = (id: string) => {
    const m = muscleDefs.find((x) => x.id === id);
    useAtlas.getState().select({ kind: 'muscle', id, side: 'r' }, { fly: true, view: m ? defaultView(m.group) : null });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    top.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    top.current?.querySelector<HTMLElement>('.explorer-view')?.focus({ preventScroll: true });
  };
  return (
    <main id="conteudo" className="sheet atlas-explorer">
      <header className="sheet__head">
        <Title text={A.title} />
        <p className="sheet__lead prose">{A.lead2}</p>
        <p className="sheet__count">
          {muscleDefs.length} {A.count}
        </p>
      </header>
      <div ref={top} className="atlas-explorer__top">
        <Explorer />
      </div>
      <section className="atlas-list" aria-labelledby="atlas-list-title">
        <header className="section__head">
          <h2 id="atlas-list-title">{A.listTitle}</h2>
          <p>{A.listNote}</p>
        </header>
        <div className="atlas-index">
          {REGIONS.map((r) => (
            <section key={r.id} className="atlas-region" aria-labelledby={`reg-${r.id}`}>
              <h3 id={`reg-${r.id}`} className="atlas-region__title">
                {t.regions[r.id as keyof typeof t.regions]}
              </h3>
              {r.groups.map((g) => {
                const list = musclesInGroup(g);
                if (list.length === 0) return null;
                return (
                  <div key={g} className="atlas-group">
                    <h4 className="atlas-group__title">{t.groups[g]}</h4>
                    <ul className="atlas-group__list">
                      {list.map((m) => (
                        <li key={m.id} className="atlas-row">
                          <Link href={muscleHref(m.id)} className="atlas-entry">
                            <span className="atlas-entry__name">{m.name}</span>
                            <span className="atlas-entry__latin latin">{m.latin}</span>
                          </Link>
                          <button type="button" className="icon-btn atlas-row__show" aria-label={A.showOnBody(m.name)} title={A.showOnBody(m.name)} onClick={() => showOnBody(m.id)}>
                            <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
                              <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10zM10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
