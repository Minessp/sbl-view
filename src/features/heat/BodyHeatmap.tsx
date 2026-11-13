/**
 * Corpo de frente e de costas com cada músculo tingido pelas séries diretas da semana.
 * A tabela ao lado (passada pela página) é a versão acessível e exata.
 */
import { useEffect, useRef } from 'react';
import { muscleDefs } from '@/data';
import { t } from '@/i18n/app';
import { useStage } from '@/scene/stageStore';
import { ModelSwitch } from '@/features/body/ModelSwitch';
import { useBody } from '@/features/body/store';
import { heatRange, type HeatLevel } from './levels';
import { useHeat, type HeatView } from './store';
import './heat.css';

const VIEWS: HeatView[] = ['front', 'back'];
const LEVELS: HeatLevel[] = [0, 1, 2, 3, 4, 5];

function describe(values: Readonly<Record<string, number>>): string {
  const on = muscleDefs.filter((m) => (values[m.id] ?? 0) > 0).map((m) => `${m.name} ${values[m.id] ?? 0}`);
  return on.length ? `${t.heat.figure}: ${on.join(', ')}.` : t.heat.empty;
}

export function BodyHeatmap({ values, caption }: { values: Readonly<Record<string, number>>; caption: string }) {
  const H = t.heat;
  const front = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const setValues = useHeat((s) => s.setValues);
  const setSlot = useHeat((s) => s.setSlot);
  const setScene = useStage((s) => s.setScene);
  const ready = useStage((s) => s.ready);
  const kind = useBody((s) => s.kind);

  useEffect(() => {
    setValues(values);
  }, [values, setValues]);
  useEffect(() => {
    setScene('heat');
    setSlot('front', front.current);
    setSlot('back', back.current);
    return () => {
      setSlot('front', null);
      setSlot('back', null);
      setScene('none');
    };
  }, [setScene, setSlot]);

  return (
    <figure className="heat">
      <figcaption className="heat__cap">{caption}</figcaption>
      <div className="heat__bodies" role="img" aria-label={describe(values)}>
        {VIEWS.map((v) => (
          <div key={v} className="heat__body">
            <div ref={v === 'front' ? front : back} className="heat__slot" data-ready={ready} />
            <span className="heat__view">{H.view[v]}</span>
          </div>
        ))}
      </div>
      <ol className="heat__legend" aria-label={H.legend}>
        {LEVELS.map((l) => {
          const [lo, hi] = heatRange(l);
          return (
            <li key={l}>
              <span className="heat__swatch" data-level={l} aria-hidden="true" />
              {l === 0 ? H.none : hi === null ? H.atLeast(lo) : H.between(lo, hi)}
            </li>
          );
        })}
      </ol>
      <ModelSwitch />
      {kind === 'anatomico' && <p className="heat__cap">{t.body.credit}</p>}
    </figure>
  );
}

