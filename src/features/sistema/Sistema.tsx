import { useEffect, useState } from 'react';
import { t, fmt } from '@/i18n/app';
import { contrast } from '@/ui/color';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { useTheme } from '@/ui/theme';
import './sistema.css';

const S = () => t.system;

/** Largura de cada amostra ~ quanto da interface ela ocupa. */
const SURFACES = [
  { key: 'bg', share: 40 },
  { key: 'bg-2', share: 16 },
  { key: 'bg-3', share: 8 },
  { key: 'ink', share: 16 },
  { key: 'ink-2', share: 10 },
  { key: 'rule', share: 4 },
  { key: 'accent', share: 4 },
  { key: 'cool', share: 2 },
] as const;

const LIGHTS = ['light-key', 'light-rim', 'glow', 'floor'] as const;
const BODY = ['body-muscle', 'body-tendon', 'body-bone', 'body-skin'] as const;
type TokenKey = (typeof SURFACES)[number]['key'] | (typeof LIGHTS)[number] | (typeof BODY)[number];

function useTokens(): Record<string, string> {
  const resolved = useTheme((s) => s.resolved);
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const keys: TokenKey[] = [...SURFACES.map((s) => s.key), ...LIGHTS, ...BODY];
    setVals(Object.fromEntries(keys.map((k) => [k, cs.getPropertyValue(`--c-${k}`).trim()])));
  }, [resolved]);
  return vals;
}

const TYPE_ROWS = [
  { sample: '87°', cls: 'spec--numeral', token: '--fs-9', note: 'largura 125, peso 250. Leitura de instrumento.' },
  { sample: 'Agachamento', cls: 'spec--display', token: '--fs-8', note: 'largura 125, peso 330. Título de página, como cartela.' },
  { sample: 'Ações articulares', cls: 'spec--title', token: '--fs-5', note: 'largura 118, peso 520. Seção.' },
  { sample: 'O comprimento da fibra muda com o ângulo do joelho.', cls: 'spec--prose', token: '--fs-4', note: 'largura 100, peso 400, entrelinha 1,62.' },
  { sample: 'Vastus lateralis', cls: 'spec--latin', token: '--fs-4', note: 'itálico. Nomenclatura anatômica.' },
  { sample: 'Rótulo de eixo, legenda, unidade', cls: 'spec--label', token: '--fs-2', note: 'largura 82. Dado denso.' },
] as const;

const WIDTHS = [68, 82, 100, 118, 125];
const SPACES = [4, 8, 12, 16, 24, 32, 48, 72, 112];

function Swatch({ k, hex, bg, share }: { k: TokenKey; hex: string; bg: string; share?: number }) {
  const c = hex && bg ? contrast(hex, bg) : 0;
  return (
    <li className="swatch" style={share ? { flexGrow: share } : undefined}>
      <span className="swatch__chip" style={{ background: `var(--c-${k})` }} />
      <span className="swatch__name">{S().names[k]}</span>
      <span className="swatch__hex">{hex}</span>
      {k !== 'bg' && share !== undefined && (
        <span className="swatch__ratio">
          {fmt.n1(c)}:1 {S().contrast}
        </span>
      )}
    </li>
  );
}

function MotionDemo() {
  const [on, setOn] = useState(false);
  const rows = [
    { token: '--t-fast', ms: 120, use: S().motionFast },
    { token: '--t-mid', ms: 220, use: S().motionMid },
    { token: '--t-slow', ms: 520, use: S().motionSlow },
    { token: '--t-light', ms: 1600, use: S().motionLight },
  ];
  return (
    <div className="motion-demo">
      <button type="button" className="btn-secondary" aria-pressed={on} onClick={() => setOn((v) => !v)}>
        {on ? S().motionBack : S().motionPlay}
      </button>
      {rows.map((r) => (
        <div key={r.token} className="motion-demo__row">
          <span className="motion-demo__track">
            <span className="motion-demo__dot" data-on={on} style={{ transitionDuration: `var(${r.token})` }} />
          </span>
          <span className="motion-demo__meta">
            <code>{r.token}</code> <span className="motion-demo__ms">{r.ms} ms</span> {r.use}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Primitivos ao vivo: o mesmo CSS que as páginas usam. */
function Primitives() {
  const [chip, setChip] = useState(true);
  const [toggle, setToggle] = useState(true);
  return (
    <div className="prims">
      <div className="prims__row">
        <button type="button" className="btn-primary prims__btn">
          {S().primary}
        </button>
        <button type="button" className="btn-secondary">
          {S().secondary}
        </button>
      </div>
      <div className="prims__row">
        <button type="button" className="chip" aria-pressed={chip} onClick={() => setChip((v) => !v)}>
          {S().chipOn}
        </button>
        <button type="button" className="chip" aria-pressed={false}>
          {S().chipOff}
        </button>
        <label className="toggle">
          <input type="checkbox" checked={toggle} onChange={(e) => setToggle(e.target.checked)} />
          <span className="toggle__track" aria-hidden="true" />
          <span>{S().toggle}</span>
        </label>
      </div>
      <label className="field prims__field">
        <span>{S().field}</span>
        <input type="text" inputMode="decimal" defaultValue="102,5" />
      </label>
      <ul className="radii">
        {(['--r-1', '--r-2', '--r-pill'] as const).map((r) => (
          <li key={r}>
            <span className="radii__box" style={{ borderRadius: `var(${r})` }} />
            <code>{r}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Sistema() {
  const tokens = useTokens();
  const bg = tokens.bg ?? '';

  return (
    <main id="conteudo" className="page sys">
      <header className="sys__head">
        <h1 className="sys__title">{S().title}</h1>
        <p className="prose">{S().lead}</p>
      </header>

      <section className="sys__section" aria-labelledby="sys-light">
        <h2 id="sys-light" className="sys__h2">{S().light}</h2>
        <div className="sys__body">
          <p className="sys__note">{S().lightNote}</p>
          <div className="light-rig" aria-hidden="true">
            <span className="light-rig__key" />
            <span className="light-rig__rim" />
            <span className="light-rig__subject" />
            <span className="light-rig__floor" />
          </div>
          <ul className="swatches swatches--fixed">
            {LIGHTS.map((k) => (
              <Swatch key={k} k={k} hex={tokens[k] ?? ''} bg={bg} />
            ))}
          </ul>
          <h3 className="sys__h3">{S().heat}</h3>
          <div className="heat-ramp" role="img" aria-label={S().heatLabel}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ background: `var(--c-heat-${i})` }} data-level={i}>
                {i}
              </span>
            ))}
          </div>
          <p className="sys__note">{S().heatNote}</p>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-color">
        <h2 id="sys-color" className="sys__h2">{S().color}</h2>
        <div className="sys__body">
          <p className="sys__note">{S().colorNote}</p>
          <ul className="swatches">
            {SURFACES.map((s) => (
              <Swatch key={s.key} k={s.key} hex={tokens[s.key] ?? ''} bg={bg} share={s.share} />
            ))}
          </ul>
          <h3 className="sys__h3">{S().body}</h3>
          <ul className="swatches swatches--fixed">
            {BODY.map((k) => (
              <Swatch key={k} k={k} hex={tokens[k] ?? ''} bg={bg} />
            ))}
          </ul>
          <p className="sys__note">{S().bodyNote}</p>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-type">
        <h2 id="sys-type" className="sys__h2">{S().type}</h2>
        <div className="sys__body">
          <p className="sys__note">{S().typeNote}</p>
          <dl className="specimen">
            {TYPE_ROWS.map((r) => (
              <div key={r.cls} className="specimen__row">
                <dt className={`spec ${r.cls}`}>{r.sample}</dt>
                <dd className="specimen__meta">
                  <code>{r.token}</code> {r.note}
                </dd>
              </div>
            ))}
          </dl>
          <div className="widths" aria-label={S().widthsLabel}>
            {WIDTHS.map((w) => (
              <span key={w} className="widths__item">
                <span className="widths__word" style={{ fontStretch: `${w}%` }}>
                  Torque
                </span>
                <span className="widths__val">{w}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-form">
        <h2 id="sys-form" className="sys__h2">{S().form}</h2>
        <div className="sys__body">
          <p className="sys__note">{S().formNote}</p>
          <Primitives />
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-space">
        <h2 id="sys-space" className="sys__h2">{S().space}</h2>
        <div className="sys__body">
          <ol className="space-ruler">
            {SPACES.map((s, i) => (
              <li key={s}>
                <span className="space-ruler__bar" style={{ width: s }} />
                <span className="space-ruler__label">
                  <code>--s-{i + 1}</code> {s} px
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-line">
        <h2 id="sys-line" className="sys__h2">{S().line}</h2>
        <div className="sys__body">
          <p className="sys__note">{S().lineNote}</p>
          <svg className="line-samples" viewBox="0 0 360 120" role="img" aria-label={S().lineLabel}>
            <path d="M8 96 C 80 96, 120 20, 200 30 S 300 70, 312 60" className="ls ls--a" />
            <path d="M8 104 C 90 100, 140 50, 210 54 S 300 84, 312 82" className="ls ls--b" />
            <path d="M8 110 C 100 108, 160 80, 220 78 S 300 96, 312 98" className="ls ls--c" />
            <text x="318" y="64" className="ls__key">Barra</text>
            <text x="318" y="86" className="ls__key">Halter</text>
            <text x="318" y="104" className="ls__key">Cabo</text>
          </svg>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-seals">
        <h2 id="sys-seals" className="sys__h2">{S().seals}</h2>
        <div className="sys__body">
          <ul className="seal-list">
            {(['estabelecido', 'provavel', 'especulativo'] as const).map((c) => (
              <li key={c}>
                <EvidenceSeal confidence={c} />
                <span className="seal-list__desc">{t.evidence.describe[c]}</span>
              </li>
            ))}
            <li>
              <EvidenceSeal confidence="especulativo" hypothesis />
              <span className="seal-list__desc">{S().sealHypothesis}</span>
            </li>
            <li>
              <EvidenceSeal confidence="provavel" unverified />
              <span className="seal-list__desc">{S().sealUnverified}</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-motion">
        <h2 id="sys-motion" className="sys__h2">{S().motion}</h2>
        <div className="sys__body">
          <p className="sys__note">{S().motionNote}</p>
          <MotionDemo />
        </div>
      </section>
    </main>
  );
}
