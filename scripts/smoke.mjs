/**
 * Teste de fumaça no navegador real (Edge/Chrome do sistema):
 * abre cada rota, falha com erro de console; no Lab, reproduz e troca variação; no Atlas, desenha
 * o músculo e as curvas; na biblioteca, filtra; no Treino, registra uma série, recarrega e confere
 * que ela persistiu no IndexedDB, edita no histórico, vê recordes e anota medida, monta um plano, faz uma
 * série na sessão ao vivo, vê a análise,
 * troca o Atlas para a malha anatômica, exporta e reimporta o backup. Rodapé, páginas legais e Ajustes.
 * Inglês em /en/ (lang, menu, exercícios, troca de idioma) e o endereço antigo com sublinhado.
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

await step('página inicial carrega e palco fica pronto', async () => {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
});

await step('página inicial: lente escolhe profundidade, acende o músculo e o clique leva ao Atlas', async () => {
  await page.getByRole('button', { name: 'Osso' }).click();
  await page.getByRole('button', { name: 'Músculo', exact: true }).click();
  if ((await page.getByRole('button', { name: 'Músculo', exact: true }).getAttribute('aria-pressed')) !== 'true') throw new Error('profundidade não mudou');
  // Entrada da página (~3 s) antes de a lente valer.
  await page.waitForTimeout(3500);
  const box = await page.locator('.home-hero__view').boundingBox();
  if (!box) throw new Error('sem vista');
  // Pontos no peito, na coxa e no braço (o corpo fica na faixa de baixo no celular).
  for (const [fx, fy] of [[0.42, 0.56], [0.4, 0.78], [0.6, 0.78], [0.25, 0.62]]) {
    const x = box.x + box.width * fx, y = box.y + box.height * fy;
    await page.mouse.move(x - 4, y - 4);
    await page.mouse.move(x, y, { steps: 3 });
    await page.waitForTimeout(400);
    if (/abrir no Atlas/.test((await page.locator('.home-tip__label').textContent()) ?? '')) {
      await page.mouse.click(x, y);
      await page.waitForURL(/\/atlas\/[a-z-]+$/, { timeout: 8000 });
      await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
      return;
    }
  }
  throw new Error('nenhum músculo sob a lente');
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

await step('lab: comparar abre pela aba, troca alvo, duplica e muda a variação', async () => {
  await page.getByRole('link', { name: 'Comparar exercícios' }).click();
  await page.getByRole('heading', { level: 1, name: 'Comparar exercícios' }).waitFor();
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  if ((await page.locator('.compare-slot').count()) !== 3) throw new Error('rosca: esperava três vistas');
  await page.locator('.compare-target select').selectOption('pectoralis_major');
  await page.waitForFunction(() => new URLSearchParams(location.search).get('alvo') === 'pectoralis_major');
  // Variação contra variação: o crucifixo duplicado, com a polia alta numa das vistas.
  await page.goto(`${base}/lab/comparar?alvo=pectoralis_major&ex=cable_fly`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Duplicar Crucifixo na polia/ }).click();
  await page.locator('.compare-slot').nth(1).getByRole('button', { name: 'alta' }).click();
  await page.waitForFunction(() => /pulley%3Dhigh/.test(location.search));
  const lines = await page.locator('section:has(#cmp-load) .chart__line').count();
  if (lines < 2) throw new Error(`só ${lines} curvas de carga`);
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

await step('atlas: parte pela busca e pela URL; demonstração no plano frontal vai do alongado ao encurtado', async () => {
  await page.goto(`${base}/atlas`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  await page.getByRole('combobox', { name: 'Buscar estrutura' }).fill('trapezio ascendente');
  await page.getByRole('option', { name: /Trapézio, parte ascendente/ }).first().waitFor();
  await page.keyboard.press('Enter');
  await page.locator('.sel__name', { hasText: 'Trapézio, parte ascendente' }).waitFor();
  await page.goto(`${base}/atlas/deltoid?parte=deltoid_lat`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.stage[data-ready="true"]', { timeout: 20000 });
  await page.getByRole('heading', { level: 2, name: /Ações: parte acromial/ }).waitFor();
  await page.locator('.part-picker button[aria-pressed="true"]', { hasText: 'Parte acromial' }).waitFor();
  const demo = page.locator('.curve__play', { hasText: 'Abdução do ombro' });
  await demo.click();
  await page.locator('.demo__stage', { hasText: 'encurtando' }).waitFor();
  const a = await page.locator('.demo__value').textContent();
  await page.waitForTimeout(1500);
  const b = await page.locator('.demo__value').textContent();
  if (a === b) throw new Error(`demonstração parada em ${a}`);
});

// Página aberta direto, sem mover o ponteiro: nenhum chunk de outra rota pedido de antemão (o CSS da lista morava no da biblioteca).
await step('página de músculo: lista de exercícios nasce estilizada', async () => {
  await page.goto(`${base}/atlas/latissimus-dorsi`, { waitUntil: 'networkidle' });
  const li = page.locator('.target-list li').first();
  await li.waitFor();
  const display = await li.evaluate((el) => getComputedStyle(el).display);
  if (display !== 'grid') throw new Error(`.target-list li com display ${display}`);
});

await step('rodapé leva aos termos; Ajustes troca a qualidade e grava sbl-lod', async () => {
  await page.goto(`${base}/exercicios`, { waitUntil: 'networkidle' });
  const foot = page.getByRole('contentinfo');
  await foot.scrollIntoViewIfNeeded();
  await foot.getByRole('link', { name: 'Termos de uso' }).click();
  await page.waitForURL(/\/termos$/);
  await page.getByRole('heading', { level: 1, name: 'Termos de uso' }).waitFor();
  await page.waitForFunction(() => document.title.startsWith('Termos de uso'), null, { timeout: 8000 });
  await foot.getByRole('button', { name: 'Ajustes' }).click();
  const dlg = page.getByRole('dialog', { name: 'Ajustes' });
  await dlg.waitFor();
  await dlg.getByRole('radio', { name: /^Leve/ }).check();
  if ((await page.evaluate(() => localStorage.getItem('sbl-lod'))) !== 'lo') throw new Error('sbl-lod não gravado');
  await dlg.getByRole('button', { name: 'Recarregar agora' }).waitFor();
  await dlg.getByRole('radio', { name: /^Automático/ }).check();
  if ((await page.evaluate(() => localStorage.getItem('sbl-lod'))) !== null) throw new Error('automático não limpou sbl-lod');
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'hidden' });
});

await step('biblioteca: busca + comprimento longo + consolidado deixa um exercício', async () => {
  await page.goto(`${base}/exercicios`, { waitUntil: 'networkidle' });
  await page.getByText('Só carga no músculo alongado').click();
  await page.getByRole('button', { name: 'Consolidado' }).click();
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

await step('troca de rota: duas trocas em 300 ms não esvaziam o palco', async () => {
  await page.locator('main a.target-list__name').first().click();
  await page.waitForTimeout(300);
  await page.locator('.site-header a.wordmark').click();
  await page.waitForURL(`${base}/`, { timeout: 8000 });
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => ({ stage: document.documentElement.dataset.stage, scene: document.querySelector('.stage')?.getAttribute('data-scene') }));
  if (st.stage !== 'ready' || st.scene !== 'home') throw new Error(`palco ${st.stage}, cena ${st.scene}`);
});

await step('troca de rota: voltar do navegador devolve a página e o corpo', async () => {
  // A primeira das duas trocas pode ter sido descartada (a mais nova vence): volta ao músculo ou ao exercício.
  await page.goBack();
  await page.waitForURL(/\/(atlas|exercicios)\/[a-z-]+$/, { timeout: 8000 });
  await page.locator('main h1').waitFor();
  await page.waitForSelector('.stage[data-ready="true"]:is([data-scene="atlas"], [data-scene="motion"])', { timeout: 20000 });
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
  await page.goto(`${base}/atlas/vastus-lateralis`, { waitUntil: 'networkidle' });
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
  await page.waitForURL((u) => /\/atlas\/(?!vastus-lateralis)[a-z-]+$/.test(u.pathname), { timeout: 10000 });
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

// Com dados já registrados (sessão, plano, medida): nenhuma página rola na horizontal no celular estreito.
await step('celular 320 px: nenhuma rota transborda na horizontal', async () => {
  await page.setViewportSize({ width: 320, height: 700 });
  const wide = [];
  for (const r of ['/', '/atlas', '/atlas/biceps-brachii', '/exercicios', '/exercicios/bayesian-curl', '/lab', '/lab/comparar', '/treino', '/treino/plano', '/treino/historico', '/treino/progresso', '/treino/analise', '/treino/dados', '/sobre', '/termos', '/privacidade', '/licencas']) {
    await page.goto(base + r, { waitUntil: 'networkidle' });
    await page.locator('main h1').first().waitFor();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) wide.push(`${r} (+${over} px)`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (wide.length) throw new Error(`transborda: ${wide.join(', ')}`);
});

await step('endereço antigo com sublinhado troca para o slug com hífen e mantém a busca', async () => {
  await page.goto(`${base}/atlas/biceps_femoris?parte=biceps_femoris_long`, { waitUntil: 'networkidle' });
  await page.waitForURL((u) => u.pathname === '/atlas/biceps-femoris' && u.search === '?parte=biceps_femoris_long', { timeout: 8000 });
  await page.locator('main h1').first().waitFor();
});

await step('inglês: /en/ com lang, menu, exercícios e troca de idioma para a mesma página', async () => {
  await page.goto(`${base}/en/`, { waitUntil: 'networkidle' });
  if ((await page.getAttribute('html', 'lang')) !== 'en') throw new Error('html sem lang="en"');
  await page.getByRole('heading', { level: 1, name: 'Watch the muscle work' }).waitFor();
  await page.getByRole('button', { name: 'Open the menu' }).click();
  await page.getByRole('dialog').getByRole('link', { name: /^Exercises/ }).click();
  await page.waitForURL((u) => u.pathname === '/en/exercises');
  await page.getByRole('heading', { level: 1, name: 'Exercises' }).waitFor();
  await page.locator('.ex-card__link').first().click();
  await page.waitForURL(/\/en\/exercises\/[a-z-]+$/);
  const path = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Log a set' }).or(page.getByRole('link', { name: 'Log a set' })).first().waitFor();
  await page.getByRole('contentinfo').getByRole('link', { name: 'Ver esta página em português' }).click();
  await page.waitForURL((u) => u.pathname === path.replace('/en/exercises/', '/exercicios/'), { timeout: 10000 });
  if ((await page.getAttribute('html', 'lang')) !== 'pt-BR') throw new Error('volta sem lang="pt-BR"');
  await page.getByRole('link', { name: 'Registrar série' }).first().waitFor();
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
