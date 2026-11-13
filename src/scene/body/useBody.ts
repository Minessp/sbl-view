import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { muscleDefs } from '@/data';
import { useTheme } from '@/ui/theme';
import { loadAnatomyPack, type AnatomyLod } from '../anatomy/pack';
import { BodyInstance } from './instance';
import { buildBodyModel, type BodyModel } from './model';
import { palette, refreshPalette } from './rig';

/** Celular ou tela pequena: nível baixo (≤ 1,2 MB). */
export function preferredLod(): AnatomyLod {
  if (typeof window === 'undefined') return 'lo';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return coarse || window.innerWidth < 900 || (mem !== undefined && mem < 4) ? 'lo' : 'hi';
}

let model: Promise<BodyModel> | null = null;
/** Modelo único da página: baixa e funde uma vez. */
export function loadBodyModel(): Promise<BodyModel> {
  model ??= loadAnatomyPack(preferredLod())
    .then((pack) => buildBodyModel(pack, muscleDefs))
    .catch((e: unknown) => {
      model = null;
      throw e;
    });
  return model;
}

export function useBodyModel(): { model: BodyModel | null; error: boolean } {
  const [state, setState] = useState<{ model: BodyModel | null; error: boolean }>({ model: null, error: false });
  useEffect(() => {
    let alive = true;
    loadBodyModel().then(
      (m) => alive && setState({ model: m, error: false }),
      () => alive && setState({ model: null, error: true }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Instância própria (pose e estado) para uma vista; relê as cores quando o tema muda. */
export function useBodyInstance(m: BodyModel | null): BodyInstance | null {
  const invalidate = useThree((s) => s.invalidate);
  // Criada no efeito: no StrictMode a limpeza roda entre as duas montagens e precisa de uma instância nova.
  const [inst, setInst] = useState<BodyInstance | null>(null);
  useEffect(() => {
    if (!m) return;
    const b = new BodyInstance(m, palette);
    setInst(b);
    return () => {
      b.dispose();
      setInst((cur) => (cur === b ? null : cur));
    };
  }, [m]);
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
