/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, normalizePath } from 'vite';
import { localeHtml } from './scripts/vite-locale.ts';
import { fontPreload } from './scripts/vite-preload.ts';
import { pwa } from './scripts/vite-pwa.ts';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

type Info = { importedIds: readonly string[]; importers: readonly string[] } | null;
type Ctx = { getModuleInfo(id: string): Info };
const LOCALE_MODULE = /[\\/]src[\\/](i18n[\\/]|app[\\/]routes\.ts)/;

/** Fecho estático a partir de `roots`, andando por `importedIds` (para a frente) ou `importers` (para trás). */
function walk(ctx: Ctx, roots: string[], edge: 'importedIds' | 'importers'): Set<string> {
  const seen = new Set<string>();
  for (let id = roots.pop(); id !== undefined; id = roots.pop()) {
    if (seen.has(id)) continue;
    seen.add(id);
    roots.push(...(ctx.getModuleInfo(id)?.[edge] ?? []));
  }
  return seen;
}

/**
 * Chunk `shared`: módulos que a shell e o palco 3D importam em comum e que não dependem do idioma. Sem ele esses módulos
 * ficam no chunk de entrada, que muda com o idioma, e o nome com hash do palco (~1 MB) mudaria junto: dois downloads.
 * `scripts/build.mjs` falha se o palco ainda sair diferente nos dois idiomas.
 */
function stageShared() {
  let shared: Set<string> | undefined;
  return (id: string, ctx: Ctx): string | null => {
    if (!shared) {
      const entry = walk(ctx, [normalizePath(src('main.tsx'))], 'importedIds');
      const stage = walk(ctx, [normalizePath(src('scene/Stage.tsx'))], 'importedIds');
      const locale = walk(ctx, [...entry].filter((x) => LOCALE_MODULE.test(x)), 'importers');
      shared = new Set([...stage].filter((x) => entry.has(x) && !locale.has(x)));
    }
    return shared.has(id) ? 'shared' : null;
  };
}

// Idioma decidido no build: `vite --mode en` (ou `scripts/build.mjs`) gera o pacote inglês; qualquer outro modo é PT-BR.
export default defineConfig(({ command, mode }) => {
  const locale = mode === 'en' ? 'en' : 'pt-BR';
  return {
    // Cloudflare Pages: raiz. GitHub Pages: BASE_PATH=/sbl-view/ no build.
    // (Caminho relativo './' quebraria assets em rotas aninhadas.)
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), fontPreload(), pwa(), localeHtml(locale)],
    // Data do build (rodapé) e idioma do pacote.
    // MODE fica "production" no inglês: libs testam `MODE !== 'production'` e deixariam código de dev (e o chunk do palco diferiria).
    define: {
      __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)),
      __LOCALE__: JSON.stringify(locale),
      ...(mode === 'en' && command === 'build' ? { 'import.meta.env.MODE': JSON.stringify('production') } : {}),
    },
    resolve: {
      // Dicionários do idioma (o tsconfig aponta os mesmos nomes para o PT-BR, que dita o tipo).
      alias: [
        { find: '@/i18n/dict.app', replacement: src(`i18n/${locale}.app.ts`) },
        { find: '@/i18n/dict.legal', replacement: src(`i18n/legal.${locale}.ts`) },
        { find: '@/i18n/dict', replacement: src(`i18n/${locale}.ts`) },
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
    build: {
      target: 'es2022',
      // three.js entra no chunk lazy do palco (~250 KB gzip), nunca na shell.
      chunkSizeWarningLimit: 1100,
      rolldownOptions: { output: { codeSplitting: { groups: [{ name: stageShared() }] } } },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
