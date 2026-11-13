/**
 * Teste de fumaça no navegador real (Edge/Chrome do sistema):
 * abre cada rota, falha com erro de console; no Lab, reproduz e troca variação; no Atlas, desenha
 * o músculo e as curvas; na biblioteca, filtra; no Treino, registra uma série, recarrega e confere
 * que ela persistiu no IndexedDB, edita no histórico, vê recordes e anota medida, monta um plano, faz uma
 * série na sessão ao vivo, vê a análise,
 * troca o Atlas para a malha anatômica, exporta e reimporta o backup.
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
  await page.waitForFunction(() => document.title === 'Sistema visual — SBL View', null, { timeout: 5000 });
});

await step('rota inexistente mostra 404 e navegação leva o foco ao h1', async () => {
  await page.goto(`${base}/nao-existe`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Página não encontrada' }).waitFor();
  await page.getByRole('main').getByRole('link', { name: 'Atlas' }).click();
  await page.waitForFunction(() => document.activeElement?.tagName === 'H1', null, { timeout: 8000 });
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

await step('atlas: índice lista músculos e a página desenha corpo e curvas', async () => {
  await page.goto(`${base}/atlas`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Semimembranáceo/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Semimembranáceo' }).waitFor();
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  await page.getByRole('button', { name: 'Perfil' }).click();
  const charts = await page.locator('.curve .chart').count();
  if (charts < 4) throw new Error(`só ${charts} gráficos`);
});

await step('atlas: explorador busca, isola, troca camada, abre e demonstra', async () => {
  await page.goto(`${base}/atlas`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  await page.getByRole('combobox', { name: 'Buscar estrutura' }).fill('gluteo max');
  await page.getByRole('option', { name: /Glúteo máximo/ }).waitFor();
  await page.keyboard.press('Enter');
  await page.locator('.sel__name', { hasText: 'Glúteo máximo' }).waitFor();
  await page.getByRole('button', { name: 'Isolar' }).click();
  await page.locator('.sel button[aria-pressed="true"]', { hasText: 'Isolar' }).waitFor();
  await page.getByRole('group', { name: 'Ossos' }).getByRole('button', { name: 'Oculta' }).click();
  await page.getByText('Vista explodida').click();
  await page.getByRole('button', { name: 'Sagital' }).click();
  const demo = page.locator('.sel__demo-list button').first();
  await demo.click();
  const a = await page.locator('.demo__value').textContent();
  await page.waitForTimeout(900);
  const b = await page.locator('.demo__value').textContent();
  if (a === b) throw new Error(`demonstração parada em ${a}`);
  // Arrastar gira a câmera sem selecionar nada.
  const view = page.locator('.explorer__view');
  const box = await view.boundingBox();
  if (!box) throw new Error('sem vista');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.locator('.sel__name', { hasText: 'Glúteo máximo' }).waitFor();
});

await step('biblioteca: busca + comprimento longo + hipótese deixa um exercício', async () => {
  await page.goto(`${base}/exercicios`, { waitUntil: 'networkidle' });
  await page.getByText('Só carga no músculo alongado').click();
  await page.getByRole('button', { name: 'Hipótese' }).click();
  await page.getByRole('status').filter({ hasText: /^\s*\d{2} exercícios/ }).waitFor();
  await page.getByLabel('Buscar').fill('extensora');
  await page.getByRole('status').filter({ hasText: '1 exercício' }).waitFor();
  await page.getByRole('link', { name: /Cadeira extensora reclinada/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Cadeira extensora reclinada' }).waitFor();
});

await step('exercício: o corpo executa o clipe; pausar, quadro a quadro e trocar câmera', async () => {
  await page.locator('.player__view[data-ready="true"]').waitFor({ timeout: 30000 });
  const time = page.locator('.player input[type=range]');
  const a = await time.inputValue();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Pausar' }).click();
  const b = await time.inputValue();
  if (a === b) throw new Error(`relógio parado em ${b}`);
  await page.getByRole('button', { name: 'Próximo quadro' }).click();
  if ((await time.inputValue()) === b) throw new Error('quadro a quadro não andou');
  await page.getByRole('button', { name: 'Frente' }).click();
  await page.getByRole('button', { name: 'Reto femoral' }).click();
  const pressed = await page.getByRole('button', { name: 'Reto femoral' }).getAttribute('aria-pressed');
  if (pressed !== 'true') throw new Error('isolar músculo não marcou');
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

await step('progresso: recordes, tabela da sessão e medida corporal', async () => {
  await page.goto(`${base}/treino/progresso`, { waitUntil: 'networkidle' });
  await page.getByLabel('Exercício').selectOption('seated_leg_curl');
  await page.locator('.data-table td', { hasText: '42,5 × 12' }).first().waitFor();
  await page.getByRole('heading', { name: 'Recorde por repetição' }).waitFor();
  await page.getByLabel('Valor (kg)').fill('80,5');
  await page.getByRole('button', { name: 'Anotar medida' }).click();
  await page.getByRole('status').filter({ hasText: 'Medida anotada.' }).waitFor();
  await page.locator('.measures__list li', { hasText: '80,5 kg' }).first().waitFor();
});

await step('plano: gerar, ver o mapa de calor, começar e ver o dia no registro', async () => {
  await page.goto(`${base}/treino/plano`, { waitUntil: 'networkidle' });
  const rebuild = page.getByRole('button', { name: 'Refazer o plano' });
  if (await rebuild.count()) await rebuild.first().click();
  await page.getByRole('group', { name: 'Prioridade: Quadríceps' }).getByRole('button', { name: 'Priorizar' }).click();
  await page.getByRole('button', { name: 'Gerar plano' }).click();
  await page.getByRole('heading', { level: 3, name: /Dia A/ }).waitFor();
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  const start = page.getByRole('button', { name: 'Começar mesociclo' });
  if (await start.count()) await start.click();
  await page.goto(`${base}/treino`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Sessão de hoje' }).waitFor();
  await page.locator('.live-card').first().waitFor();
});

await step('sessão ao vivo: marcar série feita começa o descanso', async () => {
  const card = page.locator('.live-card').first();
  const active = card.locator('.live-set--active');
  await active.locator('input').nth(0).fill('20');
  await active.locator('input').nth(1).fill('10');
  await active.getByRole('button', { name: /Marcar como feita/ }).click();
  await card.locator('.live-set--done').first().waitFor();
  await page.getByRole('region', { name: 'Cronômetro de descanso' }).waitFor();
  await page.getByRole('button', { name: 'Pular descanso' }).click();
  await page.getByRole('region', { name: 'Cronômetro de descanso' }).waitFor({ state: 'detached' });
  // 20 × 10 entra na faixa do 1RM estimado: vira recorde no Progresso.
  await page.goto(`${base}/treino/progresso`, { waitUntil: 'networkidle' });
  await page.locator('.records__table tbody tr').first().waitFor();
});

await step('análise: volume contra a faixa, aderência e contagem semanal', async () => {
  await page.goto(`${base}/treino/analise`, { waitUntil: 'networkidle' });
  await page.locator('.analysis__volume th', { hasText: 'Quadríceps' }).waitFor();
  await page.locator('.analysis__adherence tbody tr').first().waitFor();
  await page.locator('.data-table--weeks th', { hasText: 'Isquiotibiais' }).waitFor();
});

await step('atlas: corpo anatômico desenha; tocar em outro músculo abre a página dele', async () => {
  await page.goto(`${base}/atlas/vastus_lateralis`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  await page.getByText('Z-Anatomy', { exact: false }).first().waitFor({ timeout: 15000 });
  const slot = page.locator('.atlas-stage__slot');
  await slot.scrollIntoViewIfNeeded();
  const box = await slot.boundingBox();
  if (!box) throw new Error('sem slot');
  // Varre o slot até o palco devolver outro músculo sob o ponteiro.
  let hit = null;
  for (let fy = 0.25; fy < 0.9 && !hit; fy += 0.08) {
    for (let fx = 0.3; fx < 0.75 && !hit; fx += 0.06) {
      const x = box.x + box.width * fx, y = box.y + box.height * fy;
      await page.mouse.move(x, y);
      if (await slot.getAttribute('data-hover') === 'true') hit = { x, y };
    }
  }
  if (!hit) throw new Error('seleção não achou nenhum músculo');
  await page.mouse.click(hit.x, hit.y);
  await page.waitForURL((u) => /\/atlas\/(?!vastus_lateralis)[a-z_]+$/.test(u.pathname), { timeout: 10000 });
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
