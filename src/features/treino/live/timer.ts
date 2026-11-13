/**
 * Cronômetro de descanso: um só no site, guardado como instante final (sobrevive a recarregar e a
 * trocar de aba do Treino). Sem React aqui além do store.
 */
import { create } from 'zustand';

const KEY = 'sbl-rest';

interface Saved {
  endAt: number;
  total: number;
  label: string;
}

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    return typeof s.endAt === 'number' && s.endAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function write(s: Saved | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Modo privado ou armazenamento bloqueado: o cronômetro só não sobrevive a recarregar.
  }
}

interface TimerState {
  endAt: number | null;
  total: number;
  label: string;
  start: (sec: number, label: string, now?: number) => void;
  add: (sec: number, now?: number) => void;
  stop: () => void;
}

const saved = read();

export const useRestTimer = create<TimerState>((set, get) => ({
  endAt: saved?.endAt ?? null,
  total: saved?.total ?? 0,
  label: saved?.label ?? '',
  start(sec, label, now = Date.now()) {
    const s = { endAt: now + sec * 1000, total: sec, label };
    write(s);
    set(s);
  },
  add(sec, now = Date.now()) {
    const { endAt, total, label } = get();
    if (endAt === null) return;
    const next = Math.max(now, endAt + sec * 1000);
    const s = { endAt: next, total: Math.max(1, total + sec), label };
    write(s);
    set(s);
  },
  stop() {
    write(null);
    set({ endAt: null, total: 0, label: '' });
  },
}));
