/**
 * Orçamento da shell: soma o gzip do JS que cada index.html (PT-BR na raiz, inglês em en/) carrega antes de qualquer rota
 * (script de entrada + modulepreload). Falha acima do teto definido abaixo.
 *   node scripts/budget.mjs [dist]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] ?? 'dist';
// 84 KB desde a Fase 31 (rotas por idioma e link de troca): a shell PT mediu 80,3 KB; o aviso de versão lazy piorava.
const LIMIT_JS = 84 * 1024;
const LIMIT_CSS = 12 * 1024;

const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const strip = (href) => href.replace(base, '').replace(/^\//, '');
const gz = (f) => gzipSync(readFileSync(join(dist, f)), { level: 9 }).length;
const sum = (files) => files.reduce((acc, f) => acc + gz(f), 0);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let failed = false;
for (const page of ['index.html', 'en/index.html']) {
  if (!existsSync(join(dist, page))) {
    console.error(`${page} não existe (o build gera os dois idiomas: npm run build)`);
    failed = true;
    continue;
  }
  const html = readFileSync(join(dist, page), 'utf8');
  const js = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+\.js)"/g)].map((m) => strip(m[1]));
  const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map((m) => strip(m[1]));
  const totalJs = sum(js);
  const totalCss = sum(css);
  console.log(page);
  for (const f of [...js, ...css]) console.log(`  ${kb(gz(f)).padStart(9)}  ${f}`);
  console.log(`shell JS:  ${kb(totalJs)} gzip (teto ${kb(LIMIT_JS)})`);
  console.log(`shell CSS: ${kb(totalCss)} gzip (teto ${kb(LIMIT_CSS)})`);
  if (js.length === 0) {
    console.error('nenhum script encontrado no index.html');
    failed = true;
  }
  if (totalJs > LIMIT_JS || totalCss > LIMIT_CSS) {
    console.error('orçamento estourado');
    failed = true;
  }
}
if (failed) process.exit(1);
