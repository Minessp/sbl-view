/**
 * Painel do explorador: tudo o que o 3D faz também está aqui, por botão e teclado
 * (câmera, camadas, ferramentas, busca, seleção e demonstração).
 */
import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { LineChart } from '@/charts/LineChart';
import { fmt, t } from '@/i18n/app';
import type { MuscleDef } from '@/data/schema/muscle';
import { actionCurves } from '../model';
import { defaultView as defaultViewOf, keyOf, LAYER_ORDER, useAtlas, type AtlasView, type CutAxis, type LayerMode, type Pick } from '../store';
import { DemoButton, DemoControls, useDemoMarker } from './ActionDemo';
import { describe, searchIndex, searchStructures } from './names';

const E = () => t.atlas.ex;
const VIEWS: AtlasView[] = ['front', 'back', 'side'];
const MODES: LayerMode[] = ['on', 'ghost', 'off'];
const AXES: CutAxis[] = ['none', 'transverse', 'frontal', 'sagittal'];

function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICON = {
  left: 'M15 10a5 5 0 1 1-1.5-3.6M15 4v3h-3',
  right: 'M5 10a5 5 0 1 0 1.5-3.6M5 4v3h3',
  up: 'M5 12l5-5 5 5',
  down: 'M5 8l5 5 5-5',
  plus: 'M10 4v12M4 10h12',
  minus: 'M4 10h12',
  center: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4M10 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3',
  reset: 'M4 10a6 6 0 1 0 2-4.5M4 3v3.5h3.5',
};

export function CameraBar({ compact = false }: { compact?: boolean }) {
  const st = useAtlas.getState;
  const yaw = useAtlas((s) => s.orbit.yaw);
  const near = (v: number) => Math.abs(Math.atan2(Math.sin(yaw - v), Math.cos(yaw - v))) < 0.2;
  const views: Record<AtlasView, number> = { front: 0, back: Math.PI, side: -Math.PI / 2 };
  const b = (label: string, icon: string, fn: () => void) => (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={fn}>
      <Icon d={icon} />
    </button>
  );
  return (
    <div className={`camera-bar${compact ? ' camera-bar--compact' : ''}`} role="group" aria-label={E().camera}>
      <span className="camera-bar__views" role="group" aria-label={t.atlas.views}>
        {VIEWS.map((v) => (
          <button key={v} type="button" className="chip chip--small" aria-pressed={near(views[v])} onClick={() => st().setView(v)}>
            {t.atlas.view[v]}
          </button>
        ))}
      </span>
      <span className="camera-bar__tools">
        {b(E().rotateLeft, ICON.left, () => st().orbitBy(Math.PI / 8, 0))}
        {b(E().rotateRight, ICON.right, () => st().orbitBy(-Math.PI / 8, 0))}
        {!compact && b(E().tiltUp, ICON.up, () => st().orbitBy(0, 0.2))}
        {!compact && b(E().tiltDown, ICON.down, () => st().orbitBy(0, -0.2))}
        {b(E().zoomIn, ICON.plus, () => st().zoomBy(0.8))}
        {b(E().zoomOut, ICON.minus, () => st().zoomBy(1.25))}
        {b(E().recenter, ICON.center, () => st().frame())}
        {!compact && b(E().reset, ICON.reset, () => st().resetCamera())}
      </span>
    </div>
  );
}

export function LayerControls() {
  const layers = useAtlas((s) => s.layers);
  const setLayer = useAtlas((s) => s.setLayer);
  return (
    <fieldset className="panel-block layer-ctl">
      <legend className="panel-block__title">{E().layers}</legend>
      <ol className="layer-ctl__list">
        {LAYER_ORDER.map((l, i) => (
          <li key={l} className="layer-ctl__row" data-mode={layers[l]}>
            <span className="layer-ctl__depth" aria-hidden="true">
              {i + 1}
            </span>
            <span className="layer-ctl__name" id={`layer-${l}`}>
              {E().layerName[l]}
            </span>
            <span className="seg" role="group" aria-labelledby={`layer-${l}`}>
              {MODES.map((m) => (
                <button key={m} type="button" className="seg__btn" aria-pressed={layers[l] === m} onClick={() => setLayer(l, m)}>
                  {E().layerMode[m]}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

export function ToolControls() {
  const exploded = useAtlas((s) => s.exploded);
  const cut = useAtlas((s) => s.cut);
  const setCut = useAtlas((s) => s.setCut);
  const id = useId();
  return (
    <fieldset className="panel-block tools-ctl">
      <legend className="panel-block__title">{E().tools}</legend>
      <label className="toggle">
        <input type="checkbox" checked={exploded} onChange={(e) => useAtlas.getState().setExploded(e.target.checked)} />
        <span className="toggle__track" aria-hidden="true" />
        {E().explode}
      </label>
      <div className="tools-ctl__cut">
        <span className="tools-ctl__label" id={`${id}-axis`}>
          {E().cut}
        </span>
        <span className="seg seg--wrap" role="group" aria-labelledby={`${id}-axis`}>
          {AXES.map((a) => (
            <button key={a} type="button" className="seg__btn" aria-pressed={cut.axis === a} onClick={() => setCut({ axis: a })}>
              {E().cutAxis[a]}
            </button>
          ))}
        </span>
        {cut.axis !== 'none' && (
          <>
            <label htmlFor={id} className="visually-hidden">
              {E().cutAt}
            </label>
            <input id={id} className="tools-ctl__range" type="range" min={0} max={100} value={Math.round(cut.at * 100)} onChange={(e) => setCut({ at: Number(e.target.value) / 100 })} />
            <p className="panel-note">{E().cutNote}</p>
          </>
        )}
      </div>
    </fieldset>
  );
}

/** Busca com lista de opções (combobox): setas percorrem, Enter seleciona e a câmera voa. */
export function Search({ onPick }: { onPick?: (p: Pick) => void }) {
  const structures = useAtlas((s) => s.structures);
  const index = useMemo(() => searchIndex(structures), [structures]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchStructures(index, q), [index, q]);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const choose = (p: Pick) => {
    const m = p.kind === 'muscle' ? describe(p, structures)?.muscle : undefined;
    if (onPick) onPick(p);
    else useAtlas.getState().select(p, { fly: true, view: m ? defaultViewOf(m.group) : null });
    setOpen(false);
    setQ('');
  };
  const show = open && q.trim().length > 0;
  return (
    <div className="search">
      <label htmlFor={id} className="panel-block__title">
        {E().search}
      </label>
      <input
        ref={input}
        id={id}
        className="search__input"
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={show && results[active] ? `${id}-${active}` : undefined}
        placeholder={E().searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            const r = results[active];
            if (r) {
              e.preventDefault();
              choose(r.pick);
            }
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      <p className="visually-hidden" role="status">
        {show ? (results.length ? E().searchCount(results.length) : E().searchEmpty) : ''}
      </p>
      {show && (
        <ul id={`${id}-list`} className="search__list" role="listbox" aria-label={E().search}>
          {results.length === 0 && <li className="search__empty">{E().searchEmpty}</li>}
          {results.map((r, i) => (
            <li
              key={keyOf(r.pick)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className="search__opt"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(r.pick)}
            >
              <span className="search__name">{r.name}</span>
              <span className="search__detail">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DemoChart({ c }: { c: ReturnType<typeof actionCurves>[number] }) {
  const marker = useDemoMarker(c);
  return (
    <LineChart
      title={t.atlas.length}
      unit={t.atlas.lengthUnit}
      x={c.x}
      series={c.series.map((s, i) => ({ id: s.partId, label: s.label, values: s.length.map((v) => v * 100), pattern: (['solid', 'dashed', 'dotted'] as const)[i] ?? 'solid' }))}
      marker={marker}
      xLabels={[`${c.range[0]}°`, `${c.range[1]}°`]}
      zeroLine
      reveal={false}
      yFormat={(v) => `${fmt.n0(Math.round(v) || 0)}%`}
      description={`${t.atlas.length}, ${c.axisLabel} de ${c.range[0]} a ${c.range[1]} graus.`}
    />
  );
}

/** Partes do músculo: escolher uma acende só ela (o resto do músculo fica de contexto) e filtra as ações. */
export function PartPicker({ muscle, selection, onPick }: { muscle: MuscleDef; selection: Pick; onPick?: (part: string | undefined) => void }) {
  const choose = (part: string | undefined) => (onPick ? onPick(part) : useAtlas.getState().select({ ...selection, part }, { fly: true }));
  return (
    <div className="part-picker" role="group" aria-label={E().partsOf(muscle.name)}>
      <button type="button" className="chip chip--small" aria-pressed={!selection.part} onClick={() => choose(undefined)}>
        {E().wholeMuscle}
      </button>
      {muscle.parts.map((p) => (
        <button key={p.id} type="button" className="chip chip--small" aria-pressed={selection.part === p.id} onClick={() => choose(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}

/** Ficha da estrutura selecionada: nome, ações (isolar, fantasma, ocultar), página e demonstração. */
export function SelectionCard() {
  const selection = useAtlas((s) => s.selection);
  const structures = useAtlas((s) => s.structures);
  const hidden = useAtlas((s) => s.hidden);
  const ghosted = useAtlas((s) => s.ghosted);
  const isolate = useAtlas((s) => s.isolate);
  const demoKey = useAtlas((s) => s.demo.spec?.key ?? null);
  const d = selection ? describe(selection, structures) : null;
  const curves = useMemo(() => (d?.muscle ? actionCurves(d.muscle, d.part?.id) : []), [d?.muscle, d?.part?.id]);
  const active = curves.find((c) => c.key === demoKey);
  const st = useAtlas.getState;
  const count = hidden.length + ghosted.length;

  return (
    <section className="panel-block sel" aria-labelledby="sel-title">
      <h2 id="sel-title" className="panel-block__title">
        {E().selection}
      </h2>
      <p className="visually-hidden" role="status">
        {d ? E().selected(d.name) : ''}
      </p>
      {!d || !selection ? (
        <p className="panel-note">{E().none}</p>
      ) : (
        <>
          <div className="sel__head">
            <p className="sel__kind">{d.muscle ? t.groups[d.muscle.group] : E().kind[d.kind]}</p>
            <p className="sel__name">{d.name}</p>
            <p className="sel__latin latin">{d.latin}</p>
            {!d.muscle && <p className="panel-note">{E().noPage}</p>}
          </div>
          {d.muscle && d.muscle.parts.length > 1 && <PartPicker muscle={d.muscle} selection={selection} />}
          <div className="sel__actions">
            {d.muscle && (
              <Link href={`/atlas/${d.muscle.id}`} className="chip chip--small chip--accent">
                {E().open}
              </Link>
            )}
            <button type="button" className="chip chip--small" aria-pressed={isolate} onClick={() => st().setIsolate(!isolate)}>
              {E().isolate}
            </button>
            <button type="button" className="chip chip--small" aria-pressed={ghosted.includes(keyOf(selection))} onClick={() => st().toggleGhost(keyOf(selection))}>
              {E().ghost}
            </button>
            <button type="button" className="chip chip--small" aria-pressed={hidden.includes(keyOf(selection))} onClick={() => st().toggleHidden(keyOf(selection))}>
              {E().hide}
            </button>
            <button type="button" className="chip chip--small" onClick={() => st().frame()}>
              {E().recenter}
            </button>
            <button type="button" className="chip chip--small" onClick={() => st().select(null)}>
              {E().clear}
            </button>
          </div>
          {d.muscle && (
            <div className="sel__demo">
              <h3 className="sel__demo-title">{E().demo}</h3>
              {curves.length === 0 ? (
                <p className="panel-note">{E().demoNone}</p>
              ) : (
                <>
                  <p className="panel-note">{E().demoNote}</p>
                  <div className="sel__demo-list">
                    {curves.map((c) => (
                      <DemoButton key={c.key} c={c} />
                    ))}
                  </div>
                  {active && (
                    <>
                      <DemoControls c={active} />
                      <DemoChart c={active} />
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
      {count > 0 && (
        <p className="sel__hidden">
          {E().hiddenCount(count)}
          <button type="button" className="link-btn" onClick={() => st().showAll()}>
            {E().showAll}
          </button>
        </p>
      )}
    </section>
  );
}
