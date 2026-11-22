/**
 * Mergulho: Músculo (a página) → Fibras → Sarcômero, num diálogo de tela cheia por cima do palco. Entra pelo botão
 * "Mergulhar" ou aproximando além do mínimo; Voltar (ou Esc) sobe um nível. Cada nível entra com um corte que desce,
 * com a frente pontilhada acesa (700 ms; sem movimento reduzido, troca seca).
 */
import { useEffect, useMemo, useRef } from 'react';
import type { MuscleDef } from '@/data/schema/muscle';
import { t } from '@/i18n/app';
import { actionCurves } from '../model';
import { useAtlas, useLabelFeed } from '../store';
import { Fibers } from './Fibers';
import { Sarcomere } from './Sarcomere';
import './dive.css';

const LEVELS = ['muscle', 'fibers', 'sarcomere'] as const;

export function Dive({ m, part }: { m: MuscleDef; part: string | undefined }) {
  const D = t.atlas.dive;
  const level = useAtlas((s) => s.dive);
  const dlg = useRef<HTMLDialogElement>(null);
  const curves = useMemo(() => actionCurves(m, part), [m, part]);
  const open = level > 0;
  // Direção da fibra na tela ao entrar, da origem para a inserção (y da tela desce; no shader sobe).
  const angle = useMemo(() => {
    const e = open ? useLabelFeed.getState().ends : null;
    return e ? Math.atan2(-(e.insertion[1] - e.origin[1]), e.insertion[0] - e.origin[0]) : Math.PI / 2;
  }, [open]);
  const set = (l: 0 | 1 | 2) => useAtlas.getState().setDive(l);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (level > 0 && !d.open) d.showModal(); else if (level === 0 && d.open) d.close();
  }, [level]);
  useEffect(() => () => useAtlas.getState().setDive(0), []);

  return (
    <dialog
      ref={dlg}
      className="dive"
      aria-labelledby="dive-title"
      onCancel={(e) => {
        e.preventDefault();
        set(level === 2 ? 1 : 0);
      }}
      onClose={() => useAtlas.getState().dive !== 0 && set(0)}
    >
      <header className="dive__head">
        <h2 id="dive-title" className="visually-hidden">
          {`${D.open}: ${m.name}`}
        </h2>
        <nav aria-label={D.levelsLabel}>
          <ol className="dive__levels">
            {LEVELS.map((l, i) => (
              <li key={l}>
                <button type="button" className="dive__level-btn" aria-current={i === level ? 'step' : undefined} onClick={() => set(i as 0 | 1 | 2)}>
                  {D.levels[l]}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <button type="button" className="dive__back" onClick={() => set(level === 2 ? 1 : 0)}>
          {D.back}
        </button>
      </header>
      {level > 0 && (
        <div key={level} className="dive__stage">
          {level === 1 ? (
            <>
              <Fibers angle={angle} label={D.fibersFig(m.name)} />
              <div className="dive__card">
                <p className="dive__note">{D.fibersNote}</p>
                <button type="button" className="dive__deeper" onClick={() => set(2)}>
                  {D.deeper}
                </button>
              </div>
            </>
          ) : (
            <Sarcomere curve={curves[0]} />
          )}
        </div>
      )}
    </dialog>
  );
}
