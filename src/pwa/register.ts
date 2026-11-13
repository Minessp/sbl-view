/**
 * Registro do service worker (só no build) e estado "há versão nova esperando".
 * Pequeno de propósito: entra na shell.
 */
type Listener = () => void;

let waiting: ServiceWorker | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const updateStore = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  ready: () => waiting !== null,
};

let applying = false;

/** Troca para a versão nova e recarrega quando ela assumir. */
export function applyUpdate(): void {
  if (!waiting) return;
  applying = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function dismissUpdate(): void {
  waiting = null;
  emit();
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;

  const track = (w: ServiceWorker | null) => {
    if (!w) return;
    const check = () => {
      // Só avisa se já havia versão no controle: na primeira visita não há o que atualizar.
      if (w.state === 'installed' && navigator.serviceWorker.controller) {
        waiting = w;
        emit();
      }
    };
    check();
    w.addEventListener('statechange', check);
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((reg) => {
        track(reg.waiting);
        reg.addEventListener('updatefound', () => track(reg.installing));
        // Aba aberta por muito tempo: procura versão nova quando volta ao foco.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined); // sem SW o site segue funcionando online
  });
}
