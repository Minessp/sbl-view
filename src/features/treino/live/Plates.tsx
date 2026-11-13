/** Anilhas por lado para a carga digitada, desenhadas na barra (altura ∝ peso da anilha). */
import trainingJson from '@/data/training.json';
import type { TrainingFile } from '@/data/schema/planning';
import { platesPerSide } from '@/engine/training/plates';
import { fmt, t } from '@/i18n/app';
import type { Unit } from '@/storage/types';

const training = trainingJson as unknown as TrainingFile;

export const barFor = (unit: Unit): number => training.plates.value[unit].bar;

export function Plates({ load, unit }: { load: number; unit: Unit }) {
  const L = t.training.live;
  const { bar, plates } = training.plates.value[unit];
  const r = Number.isFinite(load) ? platesPerSide(load, bar, plates) : undefined;
  const biggest = Math.max(...plates);
  return (
    <div className="plates">
      {!r ? (
        <p className="section__note">{L.platesBelow}</p>
      ) : (
        <>
          <div className="plates__bar" aria-hidden="true">
            <span className="plates__sleeve" />
            {r.perSide.map((p, i) => (
              <span key={i} className="plates__plate" style={{ '--h': `${30 + 70 * (p / biggest)}%`, '--i': i } as React.CSSProperties}>
                {fmt.n1(p)}
              </span>
            ))}
            <span className="plates__collar" />
          </div>
          <p className="plates__text">
            {r.perSide.length ? L.platesPerSide(r.perSide.map((p) => fmt.n1(p)).join(' + ')) : L.platesEmpty} {L.platesBar(`${fmt.n1(bar)} ${unit}`)}
            {r.remainder > 0 && <> {L.platesMiss(`${fmt.n1(r.remainder)} ${unit}`)}</>}
          </p>
        </>
      )}
    </div>
  );
}
