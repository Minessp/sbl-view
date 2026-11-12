/**
 * Teste de fumaça no navegador real (Edge/Chrome do sistema):
 * abre cada rota, falha com erro de console; no Lab, reproduz e troca variação; no Atlas, desenha
 * o músculo e as curvas; na biblioteca, filtra; no Treino, registra uma série, recarrega e confere
 * que ela persistiu no IndexedDB.
 *   node scripts/smoke.mjs [base-url]
 */
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

await step('treino: registrar série persiste após recarregar', async () => {
  const marker = `fumaça ${Date.now()}`;
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

if (errors.length) {
  console.log(errors.join('\n'));
  process.exitCode = 1;
}
await browser.close();
