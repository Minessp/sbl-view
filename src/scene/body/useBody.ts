import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import type { WebGLRenderer } from 'three';
import { muscleDefs } from '@/data';
import { useTheme } from '@/ui/theme';
import { chooseLod, isLod, LODS, type AnatomyLod } from '../anatomy/lod';
import { anatomyUrl, loadAnatomyPack } from '../anatomy/pack';
import { buildBodyGeometryData, slotSignature, type BodyGeometryData } from './geometryData';
import { BodyInstance } from './instance';
import type { LodReply, LodRequest } from './lodWorker';
import { buildBodyModel, type BodyModel } from './model';
import { palette, refreshPalette } from './rig';

/** Nível salvo pelo usuário (sobrepõe a escolha automática); `localStorage['sbl-lod']`. */
export function savedLod(): AnatomyLod | undefined {
  try {
    const v = localStorage.getItem('sbl-lod');
    return isLod(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Renderizador da GPU, se o navegador contar (senão a escolha fica pela tela e memória). */
function gpuRenderer(gl: WebGLRenderer | undefined): string | undefined {
  try {
    const ctx = gl?.getContext();
    if (!ctx) return undefined;
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const r: unknown = ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER);
    return typeof r === 'string' ? r : undefined;
  } catch {
    return undefined;
  }
}

/** Nível pelo aparelho (ver anatomy/lod.ts): celular leve; desktop pela GPU, memória e tela. */
export function preferredLod(gl?: WebGLRenderer): AnatomyLod {
  if (typeof window === 'undefined') return 'lo';
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const renderer = gpuRenderer(gl);
  const override = savedLod();
  return chooseLod({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    width: window.innerWidth,
    dpr: window.devicePixelRatio || 1,
    ...(mem !== undefined && { memory: mem }),
    ...(renderer !== undefined && { renderer }),
    ...(override && { override }),
  });
}

let model: Promise<BodyModel> | null = null;
/** Modelo único da página: o nível leve primeiro (primeiro quadro rápido); o escolhido entra depois (`upgradeBody`). */
export function loadBodyModel(): Promise<BodyModel> {
  model ??= loadAnatomyPack('lo')
    .then((pack) => buildBodyModel(pack, muscleDefs))
    .catch((e: unknown) => {
      model = null;
      throw e;
    });
  return model;
}

/** Arrays de outro nível: no worker; sem worker, na própria página. */
function loadGeometry(lod: AnatomyLod): Promise<{ signature: string; data: BodyGeometryData }> {
  const url = new URL(anatomyUrl(lod), window.location.href).href;
  const local = () => loadAnatomyPack(lod).then((pack) => ({ signature: slotSignature(pack), data: buildBodyGeometryData(pack) }));
  if (typeof Worker === 'undefined') return local();
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./lodWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      local().then(resolve, reject);
      return;
    }
    w.onmessage = (e: MessageEvent<LodReply>) => {
      w.terminate();
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.error));
    };
    w.onerror = () => {
      w.terminate();
      local().then(resolve, reject);
    };
    w.postMessage({ url } satisfies LodRequest);
  });
}

/** A troca espera a entrada da página terminar (3,1 s na inicial) e um respiro da thread. */
const SWAP_AFTER_MS = 3400;
let upgrade: Promise<void> | null = null;
/**
 * Troca o modelo para o nível do aparelho, uma vez por página. Baixa e funde em segundo plano; a troca é só de
 * geometria (mesma pose, mesmas vagas e estado), então o corpo ganha detalhe sem mudar de lugar.
 */
export function upgradeBody(m: BodyModel, gl: WebGLRenderer): void {
  if (upgrade) return;
  const target = preferredLod(gl);
  if (LODS.indexOf(target) <= LODS.indexOf(m.lod)) return;
  const born = performance.now();
  upgrade = loadGeometry(target)
    .then(
      (r) =>
        new Promise<void>((done) => {
          const apply = () => {
            // Pacote de outra versão (cache antigo): vagas diferentes, não troca.
            if (r.signature === m.signature) m.upgrade(target, r.data);
            done();
          };
          const wait = Math.max(0, SWAP_AFTER_MS - (performance.now() - born));
          window.setTimeout(() => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(apply, { timeout: 1500 });
            else apply();
          }, wait);
        }),
    )
    .catch(() => {
      // Sem o nível alto, o leve continua. Outra página pode tentar de novo.
      upgrade = null;
    });
}

export function useBodyModel(): { model: BodyModel | null; error: boolean } {
  const gl = useThree((s) => s.gl);
  const [state, setState] = useState<{ model: BodyModel | null; error: boolean }>({ model: null, error: false });
  useEffect(() => {
    let alive = true;
    loadBodyModel().then(
      (m) => {
        if (!alive) return;
        setState({ model: m, error: false });
        upgradeBody(m, gl);
      },
      () => alive && setState({ model: null, error: true }),
    );
    return () => {
      alive = false;
    };
  }, [gl]);
  return state;
}

/** Instância própria (pose e estado) para uma vista; relê as cores quando o tema muda e troca de malha com o nível. */
export function useBodyInstance(m: BodyModel | null): BodyInstance | null {
  const invalidate = useThree((s) => s.invalidate);
  // Criada no efeito: no StrictMode a limpeza roda entre as duas montagens e precisa de uma instância nova.
  const [inst, setInst] = useState<BodyInstance | null>(null);
  useEffect(() => {
    if (!m) return;
    const b = new BodyInstance(m, palette);
    setInst(b);
    const off = m.subscribe(() => {
      b.syncGeometry();
      invalidate();
    });
    return () => {
      off();
      b.dispose();
      setInst((cur) => (cur === b ? null : cur));
    };
  }, [m, invalidate]);
  const resolved = useTheme((s) => s.resolved);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      refreshPalette();
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [resolved, invalidate]);
  return inst;
}
