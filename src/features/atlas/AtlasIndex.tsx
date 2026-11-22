import { Crosshair, List, Scissors, UnfoldHorizontal, Video, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { muscleDefs } from '@/data';
import { t } from '@/i18n/app';
import { musclesInGroup, REGIONS } from '@/features/library/catalog';
import { CameraBar, LayerControls, Search, SelectionCard, ToolControls } from './explorer/Panel';
import { LayerPeel } from './explorer/LayerPeel';
import { LiveLabels } from './explorer/LiveLabels';
import { RegionRail } from './explorer/RegionRail';
import { Viewport } from './explorer/Viewport';
import { defaultView, useAtlas, type Pick } from './store';
import './atlas.css';
import './explorer/explorer.css';
import { Title } from '@/ui/Title';
import { muscleHref } from '@/app/routes';

const E = () => t.atlas.ex;

/** Ferramentas no topo direito: isolar e explodir alternam; corte e câmera abrem um painel de vidro (popover). */
function Tools() {
  const isolate = useAtlas((s) => s.isolate);
  const exploded = useAtlas((s) => s.exploded);
  const cut = useAtlas((s) => s.cut.axis);
  const hasSel = useAtlas((s) => s.selection !== null);
  const st = useAtlas.getState;
  return (
    <div className="atlas-tools" role="toolbar" aria-label={E().tools}>
      <button type="button" className="atlas-tool" aria-pressed={isolate} disabled={!hasSel} title={E().isolate} onClick={() => st().setIsolate(!isolate)}>
        <Crosshair aria-hidden="true" />
        <span className="visually-hidden">{E().isolate}</span>
      </button>
      <button type="button" className="atlas-tool" aria-pressed={exploded} title={E().explode} onClick={() => st().setExploded(!exploded)}>
        <UnfoldHorizontal aria-hidden="true" />
        <span className="visually-hidden">{E().explode}</span>
      </button>
      <button type="button" className="atlas-tool" data-on={cut !== 'none'} title={E().cut} popoverTarget="atlas-cut">
        <Scissors aria-hidden="true" />
        <span className="visually-hidden">{E().cut}</span>
      </button>
      <button type="button" className="atlas-tool" title={E().camera} popoverTarget="atlas-camera">
        <Video aria-hidden="true" />
        <span className="visually-hidden">{E().camera}</span>
      </button>
      <div id="atlas-cut" className="atlas-pop" popover="auto">
        <ToolControls cutOnly />
      </div>
      <div id="atlas-camera" className="atlas-pop" popover="auto">
        <CameraBar />
      </div>
    </div>
  );
}

/** Gaveta com a lista completa: busca e regiões, para teclado e leitor de tela. */
function Drawer({ dlg }: { dlg: React.RefObject<HTMLDialogElement | null> }) {
  const A = t.atlas;
  const pick = (p: Pick, group?: Parameters<typeof defaultView>[0]) => {
    dlg.current?.close();
    useAtlas.getState().select(p, { fly: true, view: group ? defaultView(group) : null });
    document.querySelector<HTMLElement>('.explorer-view')?.focus({ preventScroll: true });
  };
  return (
    <dialog ref={dlg} className="atlas-drawer" aria-labelledby="atlas-drawer-title" onClick={(e) => e.target === e.currentTarget && dlg.current?.close()}>
      <div className="atlas-drawer__panel">
        <header className="atlas-drawer__head">
          <h2 id="atlas-drawer-title">{A.listTitle}</h2>
          <button type="button" className="atlas-drawer__close" aria-label={E().close} onClick={() => dlg.current?.close()}>
            <X aria-hidden="true" />
          </button>
        </header>
        <Search onPick={(p) => pick(p)} />
        <p className="panel-note">{A.listNote}</p>
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
                          <button type="button" className="icon-btn atlas-row__show" aria-label={A.showOnBody(m.name)} title={A.showOnBody(m.name)} onClick={() => pick({ kind: 'muscle', id: m.id, side: 'r' }, m.group)}>
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
      </div>
    </dialog>
  );
}

export default function AtlasIndex() {
  const A = t.atlas;
  const dlg = useRef<HTMLDialogElement>(null);
  const hasSel = useAtlas((s) => s.selection !== null);
  useEffect(() => {
    // Vindo da página inicial com uma parte sem página (osso…): chega selecionada.
    useAtlas.getState().reset(useAtlas.getState().handoff?.selection ?? null, 'front');
  }, []);
  return (
    <main id="conteudo" className="atlas-full">
      <section className="atlas-full__stage" aria-label={E().region}>
        <Viewport label={E().viewer} className="atlas-full__view" />
        <header className="atlas-full__head">
          <Title text={A.title} />
          <p className="atlas-full__lead">{A.lead2}</p>
        </header>
        <div className="atlas-full__peel">
          <LayerPeel />
          <button type="button" className="atlas-full__advanced" popoverTarget="atlas-layers">
            {E().advanced}
          </button>
          <div id="atlas-layers" className="atlas-pop atlas-pop--left" popover="auto">
            <LayerControls />
          </div>
        </div>
        <Tools />
        {hasSel && (
          <aside className="atlas-card">
            <SelectionCard />
          </aside>
        )}
        <RegionRail />
        <button type="button" className="atlas-all" aria-haspopup="dialog" onClick={() => dlg.current?.showModal()}>
          <List aria-hidden="true" />
          {E().all(muscleDefs.length)}
        </button>
        <p className="atlas-full__credit">
          <span aria-hidden="true">{E().gestures}</span> {t.body.credit}
        </p>
        <LiveLabels />
      </section>
      <Drawer dlg={dlg} />
    </main>
  );
}
