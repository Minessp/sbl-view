/* global self, caches, fetch, Response, URL */
/**
 * Service worker do SBL View. Modelo, não roda como está: o plugin `scripts/vite-pwa.ts`
 * troca __VERSION__ e __PRECACHE__ no build e grava `sw.js` na raiz do dist.
 *
 * - Instala: guarda tudo que o build gerou (JS, CSS, fontes, ícones) e a página inicial.
 * - Navegação: rede primeiro (HTML sempre revalida); sem rede, a página guardada.
 * - Resto do mesmo site: cache primeiro (arquivos com hash não mudam). models/ entra no cache no primeiro uso.
 * - ignoreVary: o servidor pode mandar `Vary: Origin` e o script module manda Origin; o addAll não.
 * - Versão nova espera até a página pedir SKIP_WAITING (aviso "Atualizar").
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `sbl-view-${VERSION}`;
const scope = self.registration.scope;
const SHELL = scope; // "/" serve o index.html; evita redirecionamento de /index.html
const SHELL_EN = `${scope}en/`; // navegação em /en/ cai no index.html do inglês, nunca no do PT-BR

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new URL(u, scope).href))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('sbl-view-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scope)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // Não regrava o HTML da rede no cache: o guardado tem de casar com os assets desta versão.
        try {
          return await fetch(req);
        } catch {
          const shell = url.href === SHELL_EN.slice(0, -1) || url.href.startsWith(SHELL_EN) ? SHELL_EN : SHELL;
          const hit = await caches.match(shell, { cacheName: CACHE, ignoreVary: true });
          return hit ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { cacheName: CACHE, ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      // Malha anatômica: fora do precache; guardada na primeira vez que alguém a usa.
      if (res.ok && new URL(req.url).pathname.includes('/models/')) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
      }
      return res;
    })(),
  );
});
