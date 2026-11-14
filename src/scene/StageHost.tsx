/**
 * Hospeda o palco na shell sem importar three.js.
 * Carrega o chunk 3D depois da primeira pintura (protege o LCP) e cai para imagens sem WebGL.
 *
 * Estado do palco em `<html data-stage>`: `loading` (cada `.viewport` mostra o filamento de carga), `ready`, `failed`
 * (o corpo ou o chunk não baixou: aviso com nova tentativa) e `static` (sem WebGL). Sem cena 3D, o atributo sai.
 */
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { t } from '@/i18n';
import { hasWebGL, useStage } from './stageStore';

const Stage = lazy(() => import('./Stage'));
const StaticFallback = lazy(() => import('./StaticFallback').then((m) => ({ default: m.StaticFallback })));

function whenIdle(cb: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(cb, { timeout: 900 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 200);
  return () => clearTimeout(id);
}

/** Erro no palco (chunk sumido, contexto WebGL que não nasce) não derruba a página: vira o estado `failed`. */
class StageBoundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  override state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  override componentDidCatch() {
    useStage.getState().setFailed(true);
  }
  override render() {
    return this.state.broken ? null : this.props.children;
  }
}

export function StageHost() {
  const scene = useStage((s) => s.scene);
  const ready = useStage((s) => s.ready);
  const failed = useStage((s) => s.failed);
  const attempt = useStage((s) => s.attempt);
  const retry = useStage((s) => s.retry);
  const [gl] = useState(() => hasWebGL());
  const [load, setLoad] = useState(false);

  useEffect(() => {
    if (scene === 'none' || load) return;
    return whenIdle(() => setLoad(true));
  }, [scene, load]);

  const status = scene === 'none' ? null : !gl ? 'static' : failed ? 'failed' : ready ? 'ready' : 'loading';
  useEffect(() => {
    const root = document.documentElement;
    if (status) root.dataset.stage = status;
    else delete root.dataset.stage;
  }, [status]);

  return (
    <div className="stage" data-scene={scene} data-ready={ready} hidden={scene === 'none'}>
      {gl ? (
        <>
          {load && (
            <StageBoundary key={attempt}>
              <Suspense fallback={null}>
                <Stage />
              </Suspense>
            </StageBoundary>
          )}
          {!ready && !failed && (
            <p className="stage__loading" role="status">
              <span className="stage__loading-rule" aria-hidden="true" />
              {t.home.loading}
            </p>
          )}
          {failed && (
            <div className="update-notice stage-failed" role="alert">
              <span>{t.stage.failed}</span>
              <button type="button" className="update-notice__go" onClick={retry}>
                {t.stage.retry}
              </button>
            </div>
          )}
        </>
      ) : (
        <Suspense fallback={null}>
          <StaticFallback />
        </Suspense>
      )}
      <div id="stage-overlay" className="stage__overlay" />
    </div>
  );
}
