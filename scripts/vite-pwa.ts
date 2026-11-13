/**
 * PWA sem dependência: no build, grava `sw.js` (de `src/pwa/sw.js`) com a lista de precache e
 * `manifest.webmanifest` com as cores lidas de `src/ui/tokens.css` (cor só mora lá).
 * Em dev não faz nada: o registro do SW só acontece no build de produção.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

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

export function manifest(): string {
  const css = read('src/ui/tokens.css');
  const bg = token(css, 'c-bg');
  return JSON.stringify(
    {
      name: 'SBL View',
      short_name: 'SBL View',
      description: 'Atlas 3D de biomecânica e registro de treino. Funciona sem internet; os dados ficam no aparelho.',
      lang: 'pt-BR',
      dir: 'ltr',
      start_url: './',
      scope: './',
      id: './',
      display: 'standalone',
      background_color: bg,
      theme_color: bg,
      icons: [
        { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        { name: 'Registrar série', url: './treino' },
        { name: 'Atlas', url: './atlas' },
      ],
    },
    null,
    2,
  );
}

export function pwa(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'sbl-pwa',
    configResolved(c) {
      config = c;
    },
    // Em dev só o manifesto (o SW não registra fora do build).
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(manifest());
      });
    },
    generateBundle() {
      if (config.command !== 'build') return;
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
    },
    writeBundle(options, bundle) {
      const outDir = options.dir ?? config.build.outDir;
      // Subconjuntos de fonte que o PT-BR não usa: o navegador só baixa se aparecer o caractere.
      // Malha anatômica (models/) é grande e opcional: entra no cache só quando alguém a pede.
      const skip = (f: string) =>
        f.endsWith('.map') ||
        f.startsWith('models/') || /-(vietnamese|latin-ext)-/.test(f) || ['sw.js', '_headers', '_redirects', 'index.html'].includes(f);
      const fromBundle = Object.keys(bundle);
      const fromPublic = config.publicDir ? listFiles(config.publicDir).map((p) => relative(config.publicDir, p).replace(/\\/g, '/')) : [];
      const files = [...new Set([...fromBundle, ...fromPublic])].filter((f) => !skip(f)).sort();
      // '' = a própria raiz do escopo, que serve o index.html.
      const precache = ['', ...files];
      const html = bundle['index.html'];
      const htmlSrc = html && html.type === 'asset' ? String(html.source) : '';
      const version = createHash('sha256').update(precache.join('\n')).update(htmlSrc).digest('hex').slice(0, 12);
      const sw = read('src/pwa/sw.js').replace("const VERSION = '__VERSION__';", `const VERSION = ${JSON.stringify(version)};`).replace('const PRECACHE = __PRECACHE__;', `const PRECACHE = ${JSON.stringify(precache)};`);
      if (sw.includes('__PRECACHE__;') || sw.includes("'__VERSION__'")) throw new Error('sw.js: marcadores não substituídos');
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}
