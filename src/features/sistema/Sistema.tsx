import { useEffect, useState } from 'react';
import { t, fmt } from '@/i18n/app';
import { contrast } from '@/ui/color';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { useTheme } from '@/ui/theme';
import './sistema.css';

/** Largura de cada amostra ~ quanto da interface ela ocupa. */
const SWATCHES = [
  { key: 'bg', name: 'Papel', share: 34 },
  { key: 'bg-2', name: 'Papel rebaixado', share: 13 },
  { key: 'bone', name: 'Osso', share: 9 },
  { key: 'ink', name: 'Nanquim', share: 20 },
  { key: 'ink-2', name: 'Grafite', share: 11 },
  { key: 'rule', name: 'Fio', share: 7 },
  { key: 'accent', name: 'Eosina', share: 6 },
] as const;

function useTokens(): Record<string, string> {
  const resolved = useTheme((s) => s.resolved);
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setVals(Object.fromEntries(SWATCHES.map((s) => [s.key, cs.getPropertyValue(`--c-${s.key}`).trim()])));
  }, [resolved]);
  return vals;
}

const TYPE_ROWS = [
  { sample: '87°', cls: 'spec--numeral', token: '--fs-9', note: 'Archivo, largura 125, peso 250. Leitura de instrumento.' },
  { sample: 'Agachamento', cls: 'spec--display', token: '--fs-8', note: 'Archivo, largura 112, peso 780.' },
  { sample: 'Vasto lateral', cls: 'spec--title', token: '--fs-6', note: 'Archivo, largura 108, peso 700.' },
  { sample: 'O comprimento da fibra muda com o ângulo do joelho.', cls: 'spec--prose', token: '--fs-4', note: 'Newsreader, prosa do porquê.' },
  { sample: 'Vastus lateralis', cls: 'spec--latin', token: '--fs-4', note: 'Newsreader itálico, nomenclatura.' },
  { sample: 'Rótulo de eixo, legenda, unidade', cls: 'spec--label', token: '--fs-2', note: 'Archivo condensada, 82.' },
] as const;

const WIDTHS = [68, 82, 100, 118, 125];
const SPACES = [4, 8, 12, 16, 24, 32, 48, 72, 112];

function MotionDemo() {
  const [on, setOn] = useState(false);
  const rows = [
    { token: '--t-fast', ms: 90, use: 'Resposta ao toque' },
    { token: '--t-mid', ms: 220, use: 'Troca de estado' },
    { token: '--t-slow', ms: 480, use: 'Câmera e entrada do 3D' },
  ];
  return (
    <div className="motion-demo">
      <button type="button" className="btn" onClick={() => setOn((v) => !v)}>
        {on ? 'Voltar' : 'Reproduzir'}
      </button>
      {rows.map((r) => (
        <div key={r.token} className="motion-demo__row">
          <span className="motion-demo__track">
            <span className="motion-demo__dot" style={{ transitionDuration: `var(${r.token})`, transform: on ? 'translateX(calc(100cqw - 12px))' : 'none' }} />
          </span>
          <span className="motion-demo__meta">
            <span className="motion-demo__ms">{r.ms} ms</span> {r.use}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Sistema() {
  const tokens = useTokens();
  const bg = tokens.bg ?? '#ffffff';

  return (
    <main id="conteudo" className="page sys">
      <header className="sys__head">
        <h1 className="sys__title">{t.system.title}</h1>
        <p className="prose">{t.system.lead}</p>
      </header>

      <section className="sys__section" aria-labelledby="sys-color">
        <h2 id="sys-color" className="sys__h2">{t.system.color}</h2>
        <div className="sys__body">
          <p className="sys__note">{t.system.colorNote}</p>
          <ul className="swatches">
            {SWATCHES.map((s) => {
              const hex = tokens[s.key] ?? '';
              const c = hex ? contrast(hex, bg) : 0;
              return (
                <li key={s.key} className="swatch" style={{ flexGrow: s.share }}>
                  <span className="swatch__chip" style={{ background: `var(--c-${s.key})` }} />
                  <span className="swatch__name">{s.name}</span>
                  <span className="swatch__hex">{hex}</span>
                  {s.key !== 'bg' && (
                    <span className="swatch__ratio">
                      {fmt.n1(c)}:1 {t.system.contrast}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <h3 className="sys__h3">{t.system.stain}</h3>
          <div className="stain-ramp" role="img" aria-label="Cinco passos de eosina, do mais claro ao mais intenso">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} style={{ background: `var(--c-stain-${i})` }}>
                {i}
              </span>
            ))}
          </div>
          <p className="sys__note">{t.system.stainNote}</p>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-type">
        <h2 id="sys-type" className="sys__h2">{t.system.type}</h2>
        <div className="sys__body">
          <p className="sys__note">{t.system.typeNote}</p>
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
          <div className="widths" aria-label="Eixo de largura do Archivo">
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

      <section className="sys__section" aria-labelledby="sys-space">
        <h2 id="sys-space" className="sys__h2">{t.system.space}</h2>
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
        <h2 id="sys-line" className="sys__h2">{t.system.line}</h2>
        <div className="sys__body">
          <p className="sys__note">{t.system.lineNote}</p>
          <svg className="line-samples" viewBox="0 0 320 120" role="img" aria-label="Três padrões de linha: contínua para barra, tracejada para halter, pontilhada para cabo">
            <path d="M8 96 C 80 96, 120 20, 200 30 S 300 70, 312 60" className="ls ls--a" />
            <path d="M8 104 C 90 100, 140 50, 210 54 S 300 84, 312 82" className="ls ls--b" />
            <path d="M8 110 C 100 108, 160 80, 220 78 S 300 96, 312 98" className="ls ls--c" />
            <text x="316" y="62" className="ls__key">Barra</text>
            <text x="316" y="84" className="ls__key">Halter</text>
            <text x="316" y="102" className="ls__key">Cabo</text>
          </svg>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-seals">
        <h2 id="sys-seals" className="sys__h2">{t.system.seals}</h2>
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
              <span className="seal-list__desc">Exercício ou afirmação proposto pelo raciocínio, ainda sem estudo direto.</span>
            </li>
            <li>
              <EvidenceSeal confidence="provavel" unverified />
              <span className="seal-list__desc">Referência ainda não conferida na fonte primária.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="sys__section" aria-labelledby="sys-motion">
        <h2 id="sys-motion" className="sys__h2">{t.system.motion}</h2>
        <div className="sys__body">
          <p className="sys__note">{t.system.motionNote}</p>
          <MotionDemo />
        </div>
      </section>
    </main>
  );
}
