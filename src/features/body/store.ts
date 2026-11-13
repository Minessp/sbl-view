/**
 * Qual modelo de corpo desenhar: anatômico (malha BodyParts3D, padrão) ou esquemático (procedural,
 * sem download). Sem three.js. A escolha fica no aparelho (preferência, não dado).
 */
import { create } from 'zustand';
import bp3d from '@/data/bodyparts3d.json';

export type BodyKind = 'esquematico' | 'anatomico';
const KEY = 'sbl-view:corpo';

function read(): BodyKind {
  try {
    return localStorage.getItem(KEY) === 'esquematico' ? 'esquematico' : 'anatomico';
  } catch {
    return 'anatomico';
  }
}

interface BodyState {
  kind: BodyKind;
  /** Estado da malha anatômica (o palco atualiza). */
  status: 'idle' | 'loading' | 'ready' | 'error';
  setKind: (k: BodyKind) => void;
  setStatus: (s: BodyState['status']) => void;
}

export const useBody = create<BodyState>((set) => ({
  kind: read(),
  status: 'idle',
  setKind: (kind) => {
    try {
      localStorage.setItem(KEY, kind);
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
    set({ kind });
  },
  setStatus: (status) => set({ status }),
}));

const MISSING: Readonly<Record<string, string>> = bp3d.missing;
/** Músculo sem malha no BodyParts3D: o Atlas cai para o esquemático e avisa. */
export const missingInAnatomical = (muscleId: string): string | undefined => MISSING[muscleId];
