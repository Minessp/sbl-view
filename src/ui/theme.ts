import { create } from 'zustand';

/** Escuro é o padrão (estúdio); claro (ciclorama) é escolha explícita e fica salva. */
export type ThemeMode = 'dark' | 'light';
export type ResolvedTheme = ThemeMode;

const KEY = 'sbl-theme';

function readSaved(): ThemeMode {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

interface ThemeState {
  mode: ThemeMode;
  /** Igual a `mode`; mantido para quem só quer saber qual paleta está valendo. */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

export const useTheme = create<ThemeState>((set) => {
  const mode = readSaved();
  return {
    mode,
    resolved: mode,
    setMode: (next) => {
      try {
        if (next === 'dark') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch {
        /* armazenamento indisponível: tema vale só nesta sessão */
      }
      if (next === 'dark') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim());
      set({ mode: next, resolved: next });
    },
  };
});
