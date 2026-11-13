/**
 * Orçamento da shell: soma o gzip do JS que o index.html carrega antes de qualquer rota
 * (script de entrada + modulepreload). Falha acima do teto definido abaixo.
 *   node scripts/budget.mjs [dist]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] ?? 'dist';
const LIMIT_JS = 80 * 1024;
const LIMIT_CSS = 12 * 1024;

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const strip = (href) => href.replace(base, '').replace(/^\//, '');
const js = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+\.js)"/g)].map((m) => strip(m[1]));
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map((m) => strip(m[1]));

const gz = (f) => gzipSync(readFileSync(join(dist, f)), { level: 9 }).length;
const sum = (files) => files.reduce((acc, f) => acc + gz(f), 0);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const totalJs = sum(js);
const totalCss = sum(css);
for (const f of [...js, ...css]) console.log(`  ${kb(gz(f)).padStart(9)}  ${f}`);
console.log(`shell JS:  ${kb(totalJs)} gzip (teto ${kb(LIMIT_JS)})`);
console.log(`shell CSS: ${kb(totalCss)} gzip (teto ${kb(LIMIT_CSS)})`);

if (js.length === 0) {
  console.error('nenhum script encontrado no index.html');
  process.exit(1);
}
if (totalJs > LIMIT_JS || totalCss > LIMIT_CSS) {
  console.error('orçamento estourado');
  process.exit(1);
}
