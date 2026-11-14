/**
 * Auditoria de acessibilidade com axe-core (WCAG 2.2 A/AA) em todas as rotas, tema claro e escuro.
 *   node scripts/a11y.mjs [url-base]
 * Sai com código 1 se houver violação. Roda no CI contra o build (`vite preview`).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const ROUTES = [
  '/',
  '/atlas',
  '/atlas/vastus_lateralis',
  '/exercicios',
  '/exercicios/squat',
  '/exercicios/incline_dumbbell_curl',
  '/lab',
  '/lab/comparar',
  '/treino',
  '/treino/plano',
  '/treino/historico',
  '/treino/progresso',
  '/treino/analise',
  '/treino/dados',
  '/rota-que-nao-existe',
];

const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch(channel ? { channel } : {});
let failures = 0;

for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: scheme });
  for (const route of ROUTES) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    await page.waitForSelector('main', { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.addScriptTag({ content: axeSource });
    const res = await page.evaluate(async () => {
      // @ts-expect-error axe injetado
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n').slice(1, 2).join(' ')}`),
        count: v.nodes.length,
      }));
    });
    if (res.length) {
      failures += res.length;
      console.log(`\n[${scheme}] ${route}`);
      for (const v of res) {
        console.log(`  ${v.impact} ${v.id} (${v.count}): ${v.help}`);
        for (const n of v.nodes) console.log(`    ${n}`);
      }
    }
  }
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} violação(ões).` : 'a11y: sem violações.');
process.exit(failures ? 1 : 0);
