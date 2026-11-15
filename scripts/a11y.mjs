/**
 * Auditoria de acessibilidade com axe-core (WCAG 2.2 A/AA) em todas as rotas e no painel de Ajustes aberto: desktop
 * vazio nos temas claro e escuro, celular com redução de movimento e dados registrados.
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
  '/sobre',
  '/termos',
  '/privacidade',
  '/licencas',
  '/rota-que-nao-existe',
];

const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch(channel ? { channel } : {});
let failures = 0;

/** Painel de Ajustes aberto pelo rodapé (rota `/termos`, que não tem palco). */
async function openSettings(page) {
  await page.getByRole('contentinfo').getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('dialog', { name: 'Ajustes' }).waitFor();
}

async function audit(page, label) {
  for (const route of [...ROUTES, '/termos#ajustes']) {
    await page.goto(base + route.replace('#ajustes', ''), { waitUntil: 'networkidle' });
    await page.waitForSelector('main', { timeout: 15000 });
    if (route.endsWith('#ajustes')) await openSettings(page);
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
      console.log(`\n[${label}] ${route}`);
      for (const v of res) {
        console.log(`  ${v.impact} ${v.id} (${v.count}): ${v.help}`);
        for (const n of v.nodes) console.log(`    ${n}`);
      }
    }
  }
}

/** Registra duas séries, uma medida e um plano ativo pela interface: as páginas do treino saem do estado vazio. */
async function seed(page) {
  for (const [load, reps] of [['40', '10'], ['42,5', '8']]) {
    await page.goto(`${base}/treino?exercicio=seated_leg_curl`, { waitUntil: 'networkidle' });
    await page.getByLabel('Carga (kg)').fill(load);
    await page.getByLabel('Repetições', { exact: true }).fill(reps);
    await page.getByRole('button', { name: 'Registrar série' }).click();
    await page.getByRole('status').filter({ hasText: 'Série registrada' }).waitFor();
  }
  await page.goto(`${base}/treino/progresso`, { waitUntil: 'networkidle' });
  await page.getByLabel('Valor (kg)').fill('80');
  await page.getByRole('button', { name: 'Anotar medida' }).click();
  await page.getByRole('status').filter({ hasText: 'Medida anotada.' }).waitFor();
  await page.goto(`${base}/treino/plano`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Gerar plano' }).click();
  await page.getByRole('button', { name: 'Começar mesociclo' }).click();
}

// Desktop vazio nos dois temas; celular com redução de movimento e dados registrados (estados preenchidos).
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: scheme });
  await audit(page, scheme);
  await page.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await seed(page);
  await audit(page, 'celular, com dados');
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} violação(ões).` : 'a11y: sem violações.');
process.exit(failures ? 1 : 0);
