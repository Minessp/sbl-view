/**
 * Teste de fumaça no navegador real (Edge/Chrome do sistema):
 * abre cada rota, falha com erro de console; no Lab, reproduz e troca variação; no Atlas, desenha
 * o músculo e as curvas; na biblioteca, filtra; no Treino, registra uma série, recarrega e confere
 * que ela persistiu no IndexedDB, edita no histórico, vê o progresso, exporta e reimporta o backup.
 * No build (com sw.js), confere que o site abre sem rede.
 *   node scripts/smoke.mjs [base-url]
 */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch(channel ? { channel } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
};

await step('abertura carrega e palco fica pronto', async () => {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
});

await step('sistema carrega', async () => {
  await page.goto(`${base}/sistema`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Sistema visual' }).waitFor();
});

await step('lab carrega com duas vistas e anotações preenchidas', async () => {
  await page.goto(`${base}/lab/agachamento`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-k="knee-angle"]').length === 2 && [...document.querySelectorAll('[data-k="knee-angle"]')].every((e) => /°/.test(e.textContent ?? '')));
});

await step('reproduzir move a repetição', async () => {
  const before = await page.locator('.scrubber input[type=range]').inputValue();
  await page.getByRole('button', { name: 'Reproduzir' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Pausar' }).click();
  const after = await page.locator('.scrubber input[type=range]').inputValue();
  if (before === after) throw new Error(`cursor parado em ${after}`);
});

await step('alternar variação troca a vista', async () => {
  await page.getByRole('button', { name: 'Frontal' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.view-slot').length === 3);
});

await step('atlas: índice lista músculos e a prancha desenha corpo e curvas', async () => {
  await page.goto(`${base}/atlas`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Semimembranáceo/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Semimembranáceo' }).waitFor();
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  await page.getByRole('button', { name: 'Perfil' }).click();
  const charts = await page.locator('.curve .chart').count();
  if (charts < 4) throw new Error(`só ${charts} gráficos`);
});

await step('biblioteca: filtro de comprimento longo + hipótese deixa um exercício', async () => {
  await page.goto(`${base}/exercicios`, { waitUntil: 'networkidle' });
  await page.getByText('Só carga no músculo alongado').click();
  await page.getByRole('button', { name: 'Hipótese' }).click();
  await page.getByRole('status').filter({ hasText: '1 exercício' }).waitFor();
  await page.getByRole('link', { name: /Cadeira extensora reclinada/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Cadeira extensora reclinada' }).waitFor();
});

const marker = `fumaça ${Date.now()}`;
await step('treino: registrar série persiste após recarregar', async () => {
  await page.goto(`${base}/treino?exercicio=seated_leg_curl`, { waitUntil: 'networkidle' });
  await page.getByLabel('Carga (kg)').fill('42,5');
  await page.getByLabel('Repetições', { exact: true }).fill('11');
  await page.getByLabel('Nota', { exact: true }).fill(marker);
  await page.getByRole('button', { name: 'Registrar série' }).click();
  await page.getByRole('status').filter({ hasText: 'Série registrada' }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(marker).waitFor({ timeout: 5000 });
  await page.getByText('42,5 kg × 11').first().waitFor();
  await page.locator('.logger__ex', { hasText: 'Mesa flexora sentada' }).first().waitFor();
});

await step('histórico: editar a série muda as repetições', async () => {
  await page.goto(`${base}/treino/historico`, { waitUntil: 'networkidle' });
  const row = page.locator('.set-row', { hasText: marker }).first();
  await row.getByRole('button', { name: /Editar série/ }).click();
  const form = page.getByRole('form', { name: /Editar série/ });
  await form.getByLabel('Repetições', { exact: true }).fill('12');
  await form.getByRole('button', { name: 'Salvar' }).click();
  await page.locator('.set-row', { hasText: marker }).getByText('42,5 kg × 12').waitFor();
});

await step('progresso: tabela da sessão e contagem semanal', async () => {
  await page.goto(`${base}/treino/progresso`, { waitUntil: 'networkidle' });
  await page.getByLabel('Exercício').selectOption('seated_leg_curl');
  await page.locator('.data-table td', { hasText: '42,5 × 12' }).first().waitFor();
  await page.locator('.data-table--weeks th', { hasText: 'Isquiotibiais' }).waitFor();
});

await step('dados: exportar e reimportar o backup não duplica', async () => {
  await page.goto(`${base}/treino/dados`, { waitUntil: 'networkidle' });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar backup' }).click()]);
  const file = await download.path();
  const json = JSON.parse(await readFile(file, 'utf8'));
  if (json.app !== 'sbl-view' || !json.sets.some((s) => s.note === marker)) throw new Error('backup sem a série registrada');
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('status').filter({ hasText: /Importado: 0 séries novas, 0 atualizadas, \d+ já estavam aqui/ }).waitFor();
});

const hasSw = await page.request
  .get(`${base}/sw.js`)
  // Em dev, /sw.js cai no fallback SPA (HTML): sem service worker.
  .then((r) => r.ok() && /javascript/.test(r.headers()['content-type'] ?? ''))
  .catch(() => false);
if (hasSw) {
  await step('pwa: manifesto válido e site abre sem rede', async () => {
    const m = await (await page.request.get(`${base}/manifest.webmanifest`)).json();
    if (m.display !== 'standalone' || !m.icons?.some((i) => i.sizes === '512x512')) throw new Error('manifesto incompleto');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.context().setOffline(true);
    try {
      await page.goto(`${base}/treino/historico`, { waitUntil: 'load' });
      await page.getByText(marker).first().waitFor({ timeout: 8000 });
    } finally {
      await page.context().setOffline(false);
    }
  });
} else console.log('—    pwa: sem sw.js (servidor de dev), pulado');

if (errors.length) {
  console.log(errors.join('\n'));
  process.exitCode = 1;
}
await browser.close();
