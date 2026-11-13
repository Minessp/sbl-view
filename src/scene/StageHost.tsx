/**
 * Hospeda o palco na shell sem importar three.js.
 * Carrega o chunk 3D depois da primeira pintura (protege o LCP) e cai para SVG sem WebGL.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
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

export function StageHost() {
  const scene = useStage((s) => s.scene);
  const ready = useStage((s) => s.ready);
  const [gl] = useState(() => hasWebGL());
  const [load, setLoad] = useState(false);

  useEffect(() => {
    if (scene === 'none' || load) return;
    return whenIdle(() => setLoad(true));
  }, [scene, load]);

  return (
    <div className="stage" data-scene={scene} data-ready={ready} hidden={scene === 'none'}>
      {gl ? (
        <>
          {load && (
            <Suspense fallback={null}>
              <Stage />
            </Suspense>
          )}
          {!ready && (
            <p className="stage__loading" role="status">
              <span className="stage__loading-rule" aria-hidden="true" />
              {t.home.loading}
            </p>
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
