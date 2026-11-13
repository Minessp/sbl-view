import { useId } from 'react';
import { fmt, t } from '@/i18n/app';
import { DEFAULT_SETTINGS, variantById, type LabSettings } from './model';
import { useLab } from './store';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  note?: string | undefined;
}

function Slider({ label, value, min, max, step, unit, format = fmt.n0, onChange, note }: SliderProps) {
  const id = useId();
  return (
    <div className="slider">
      <label htmlFor={id} className="slider__label">
        <span>{label}</span>
        <output htmlFor={id} className="slider__value">
          {format(value)}
          <span className="slider__unit">{unit}</span>
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
      {note && <p className="slider__note">{note}</p>}
    </div>
  );
}

export function LabSettingsPanel() {
  const s = useLab((x) => x.settings);
  const ids = useLab((x) => x.variantIds);
  const set = useLab((x) => x.setSettings);
  const primary = variantById(ids[0] ?? 'high_bar');
  const traj = primary.trajectory.kind === 'squat' ? primary.trajectory : null;
  const depth = s.depthDeg ?? traj?.depthDeg ?? 115;
  const ankle = (traj?.ankleMaxDeg ?? 30) + s.ankleDeltaDeg;
  const L = t.lab.settings;
  const patch = (p: Partial<LabSettings>) => set(p);

  return (
    <section className="section settings" aria-labelledby="sec-settings">
      <header className="section__head">
        <h2 id="sec-settings">{L.title}</h2>
      </header>
      <div className="settings__grid">
        <div>
          <Slider label={L.depth} value={depth} min={60} max={150} step={1} unit="°" onChange={(v) => patch({ depthDeg: v })} note={s.depthDeg === null ? L.depthDefault : undefined} />
          {s.depthDeg !== null && (
            <button type="button" className="link-btn" onClick={() => patch({ depthDeg: null })}>
              {L.reset}
            </button>
          )}
        </div>
        <Slider label={L.ankle} value={ankle} min={Math.max(0, ankle - s.ankleDeltaDeg - 15)} max={ankle - s.ankleDeltaDeg + 12} step={1} unit="°" onChange={(v) => patch({ ankleDeltaDeg: v - (traj?.ankleMaxDeg ?? 30) })} />
        <Slider label={L.stance} value={s.stanceDeg} min={0} max={40} step={1} unit="°" onChange={(v) => patch({ stanceDeg: v })} />
        <Slider label={L.thigh} value={s.thighScale * 100} min={88} max={112} step={1} unit="%" onChange={(v) => patch({ thighScale: v / 100 })} />
        <Slider label={L.bodyMass} value={s.bodyMass} min={45} max={140} step={1} unit=" kg" onChange={(v) => patch({ bodyMass: v })} />
        <Slider label={L.load} value={s.loadMass} min={0} max={250} step={2.5} unit=" kg" format={fmt.n1} onChange={(v) => patch({ loadMass: v })} />
      </div>
      {JSON.stringify(s) !== JSON.stringify(DEFAULT_SETTINGS) && (
        <button type="button" className="link-btn" onClick={() => set(DEFAULT_SETTINGS)}>
          {L.reset}
        </button>
      )}
    </section>
  );
}
