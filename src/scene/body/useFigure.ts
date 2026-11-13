import { useEffect, useState } from 'react';
import { useBody } from '@/features/body/store';
import { loadAnatomical } from './anatomical';
import { proceduralFigure, type FigureModel } from './figure';

/**
 * Modelo de corpo escolhido. Enquanto a malha anatômica baixa (ou se falhar), desenha o
 * esquemático; `force` obriga o esquemático (músculo que a malha não tem).
 */
export function useFigure(force?: 'esquematico'): FigureModel {
  const kind = useBody((s) => s.kind);
  const setStatus = useBody((s) => s.setStatus);
  const [anat, setAnat] = useState<FigureModel | null>(null);
  const want = force ?? kind;

  useEffect(() => {
    if (want !== 'anatomico' || anat) return;
    let alive = true;
    setStatus('loading');
    loadAnatomical()
      .then((m) => {
        if (!alive) return;
        setAnat(m);
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [want, anat, setStatus]);

  return want === 'anatomico' && anat ? anat : proceduralFigure();
}
