/**
 * Ajustes (chunk à parte): tema, qualidade do modelo 3D e atalho para as preferências do Treino. `<dialog>` modal como o
 * menu: foco no Fechar, Esc anima a saída, o resto da página fica inerte. A qualidade grava `localStorage['sbl-lod']`
 * (sem valor = automático) e vale na próxima carga: o modelo já baixado não troca no meio da página.
 */
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { chooseLod, isLod, LODS, type AnatomyLod } from '@/scene/anatomy/lod';
import { t } from '@/i18n/app';
import { useTheme } from '@/ui/theme';
import { ThemeSwitch } from '@/ui/ThemeSwitch';
import './settings.css';

const S = t.settings;
const KEY = 'sbl-lod';
const EXIT_MS = 200;

function readSaved(): AnatomyLod | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLod(v) ? v : null;
  } catch {
    return null;
  }
}

function writeSaved(v: AnatomyLod | null) {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    // Armazenamento recusado (modo privado): a escolha vale só até recarregar, como o automático.
  }
}

let autoCache: AnatomyLod | null = null;
/** Nível que o aparelho escolheria sem preferência salva: mesma conta do palco (useBody.ts), GPU lida num canvas à parte. */
function autoLod(): AnatomyLod {
  if (autoCache) return autoCache;
  let renderer: string | undefined;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const r: unknown = gl && (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    if (typeof r === 'string') renderer = r;
  } catch {
    renderer = undefined;
  }
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  autoCache = chooseLod({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    width: window.innerWidth,
    dpr: window.devicePixelRatio || 1,
    ...(mem !== undefined && { memory: mem }),
    ...(renderer !== undefined && { renderer }),
  });
  return autoCache;
}

export default function Settings({ onClosed }: { onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const mode = useTheme((s) => s.mode);
  const [initial] = useState(readSaved);
  const [lod, setLod] = useState<AnatomyLod | null>(initial);
  const [auto] = useState(autoLod);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    dlg.showModal();
    close.current?.focus();
    document.documentElement.classList.add('menu-open');
    return () => document.documentElement.classList.remove('menu-open');
  }, []);

  const shut = (animated: boolean) => {
    const dlg = ref.current;
    if (!dlg || dlg.dataset.state === 'closing') return;
    if (!animated || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dlg.close();
      onClosed();
      return;
    }
    dlg.dataset.state = 'closing';
    window.setTimeout(() => {
      dlg.close();
      onClosed();
    }, EXIT_MS);
  };

  const pick = (v: AnatomyLod | null) => {
    setLod(v);
    writeSaved(v);
  };

  return (
    <dialog
      ref={ref}
      className="site-settings"
      aria-labelledby="site-settings-title"
      data-lenis-prevent=""
      onCancel={(e) => {
        e.preventDefault();
        shut(true);
      }}
      onClick={(e) => {
        // Clique no fundo (fora do painel) fecha.
        if (e.target === e.currentTarget) shut(true);
      }}
    >
      <div className="site-settings__panel">
        <header className="site-settings__head">
          <h2 id="site-settings-title" className="site-settings__title">
            {S.title}
          </h2>
          <button ref={close} type="button" className="site-settings__close" aria-label={S.closeLabel} onClick={() => shut(true)}>
            <span>{S.close}</span>
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <section className="site-settings__row" aria-labelledby="site-settings-theme">
          <h3 id="site-settings-theme">{S.theme}</h3>
          <div className="site-settings__theme">
            <span className="site-settings__now">{S.themeNow[mode]}</span>
            <ThemeSwitch />
          </div>
        </section>

        <fieldset className="site-settings__row site-settings__quality">
          <legend>{S.quality}</legend>
          <p className="site-settings__note">{S.qualityNote}</p>
          <div className="site-settings__options">
            <label className="site-settings__opt">
              <input type="radio" name="sbl-lod" value="auto" checked={lod === null} onChange={() => pick(null)} />
              <span className="site-settings__opt-name">{S.auto}</span>
              <span className="site-settings__opt-meta">{S.autoNow(S.levels[auto])}</span>
            </label>
            {LODS.map((l) => (
              <label key={l} className="site-settings__opt">
                <input type="radio" name="sbl-lod" value={l} checked={lod === l} onChange={() => pick(l)} />
                <span className="site-settings__opt-name">{S.levels[l]}</span>
                <span className="site-settings__opt-meta">{S.sizes[l]}</span>
              </label>
            ))}
          </div>
          <div className="site-settings__pending" data-on={lod !== initial}>
            <p role="status">{lod !== initial ? S.pending : ''}</p>
            {lod !== initial && (
              <button type="button" className="site-settings__reload" onClick={() => window.location.reload()}>
                {S.reload}
              </button>
            )}
          </div>
        </fieldset>

        <section className="site-settings__row" aria-labelledby="site-settings-training">
          <h3 id="site-settings-training">{S.training}</h3>
          <Link href="/treino/dados" className="site-settings__link" onClick={() => shut(false)}>
            {S.units}
          </Link>
          <p className="site-settings__note">{S.unitsNote}</p>
        </section>
      </div>
    </dialog>
  );
}
