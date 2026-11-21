/**
 * PWA sem dependência. `writePwa(dist)` roda depois da junção dos dois idiomas (`scripts/build.mjs`): grava `sw.js`
 * (de `src/pwa/sw.js`) com a lista de precache dos dois e um `manifest.webmanifest` por idioma (`en/` para o inglês),
 * com as cores lidas de `src/ui/tokens.css` (cor só mora lá). Em dev só os manifestos: o SW só registra no build.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

const root = new URL('..', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

/** Primeira ocorrência de `--nome: #hex;` (o bloco `:root` claro vem primeiro). */
function token(css: string, name: string, nth = 0): string {
  const all = [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'g'))];
  const m = all[nth];
  if (!m?.[1]) throw new Error(`token --${name} não encontrado em tokens.css`);
  return m[1];
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

type Locale = 'pt-BR' | 'en';

const TEXT: Record<Locale, { description: string; shortcuts: [string, string][] }> = {
  'pt-BR': {
    description: 'Atlas 3D de biomecânica e registro de treino. Funciona sem internet; os dados ficam no aparelho.',
    shortcuts: [
      ['Registrar série', './treino'],
      ['Atlas', './atlas'],
    ],
  },
  en: {
    description: '3D biomechanics atlas and training log. Works offline; your data stays on the device.',
    shortcuts: [
      ['Log a set', './training'],
      ['Atlas', './atlas'],
    ],
  },
};

/** Manifesto do idioma. O inglês mora em `en/`: escopo e início relativos ficam em `/en/`, ícones sobem um nível. */
export function manifest(locale: Locale = 'pt-BR'): string {
  const css = read('src/ui/tokens.css');
  const bg = token(css, 'c-bg');
  const up = locale === 'en' ? '../' : '';
  const x = TEXT[locale];
  return JSON.stringify(
    {
      name: 'SBL View',
      short_name: 'SBL View',
      description: x.description,
      lang: locale,
      dir: 'ltr',
      start_url: './',
      scope: './',
      id: './',
      display: 'standalone',
      background_color: bg,
      theme_color: bg,
      icons: [
        { src: `${up}icon.svg`, sizes: 'any', type: 'image/svg+xml' },
        { src: `${up}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${up}icon-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${up}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: x.shortcuts.map(([name, url]) => ({ name, url })),
    },
    null,
    2,
  );
}

/** Dev: serve os dois manifestos (o SW não registra fora do build). */
export function pwa(): Plugin {
  return {
    name: 'sbl-pwa',
    configureServer(server) {
      for (const [path, locale] of [
        ['/en/manifest.webmanifest', 'en'],
        ['/manifest.webmanifest', 'pt-BR'],
      ] as const) {
        server.middlewares.use(path, (_req, res) => {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(manifest(locale));
        });
      }
    },
  };
}

/** Grava manifestos e `sw.js` no `dist` já com os dois idiomas. Precache = tudo que o build gerou, menos o opcional. */
export function writePwa(dist: string): void {
  writeFileSync(join(dist, 'manifest.webmanifest'), manifest('pt-BR'));
  writeFileSync(join(dist, 'en', 'manifest.webmanifest'), manifest('en'));
  // Subconjuntos de fonte que o latim não usa: o navegador só baixa se aparecer o caractere.
  // Malha anatômica (models/) é grande e opcional: entra no cache só quando alguém a pede.
  // Imagens sem WebGL (fallback/) só servem a quem não tem 3D. Os index.html entram pela raiz de cada idioma.
  const skip = (f: string) =>
    f.endsWith('.map') ||
    f.startsWith('models/') ||
    f.startsWith('fallback/') ||
    /-(vietnamese|latin-ext)-/.test(f) ||
    ['sw.js', '_headers', '_redirects', 'index.html', 'en/index.html'].includes(f);
  const files = listFiles(dist)
    .map((p) => relative(dist, p).replace(/\\/g, '/'))
    .filter((f) => !skip(f))
    .sort();
  // '' e 'en/' = a raiz de cada idioma, que serve o index.html dele.
  const precache = ['', 'en/', ...files];
  const version = createHash('sha256')
    .update(precache.join('\n'))
    .update(readFileSync(join(dist, 'index.html')))
    .update(readFileSync(join(dist, 'en', 'index.html')))
    .digest('hex')
    .slice(0, 12);
  const sw = read('src/pwa/sw.js')
    .replace("const VERSION = '__VERSION__';", `const VERSION = ${JSON.stringify(version)};`)
    .replace('const PRECACHE = __PRECACHE__;', `const PRECACHE = ${JSON.stringify(precache)};`);
  if (sw.includes('__PRECACHE__;') || sw.includes("'__VERSION__'")) throw new Error('sw.js: marcadores não substituídos');
  writeFileSync(join(dist, 'sw.js'), sw);
}
