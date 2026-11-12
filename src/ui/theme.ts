import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'sbl-theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readSaved(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (mode: ThemeMode): ResolvedTheme => (mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode);

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

export const useTheme = create<ThemeState>((set) => {
  const mode = readSaved();
  media?.addEventListener('change', () => set((s) => ({ resolved: resolve(s.mode) })));
  return {
    mode,
    resolved: resolve(mode),
    setMode: (next) => {
      try {
        if (next === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch {
        /* armazenamento indisponível: tema vale só nesta sessão */
      }
      if (next === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = next;
      set({ mode: next, resolved: resolve(next) });
    },
  };
});
