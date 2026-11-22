/**
 * Cartazes da biblioteca (public/posters/<slug>.webp, 640 × 800 com alfa, WebP 0,7): cada exercício fotografado no modo
 * de captura do player (`?cartaz=1`, só em desenvolvimento). Roda à mão; refazer quando mudar clipe, mão ou equipamento.
 *
 *   npm run dev   # noutro terminal
 *   node scripts/posters.mjs http://localhost:5173 [id ...]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [base = 'http://localhost:5173', ...only] = process.argv.slice(2);
const out = new URL('../public/posters/', import.meta.url);
mkdirSync(out, { recursive: true });
const library = JSON.parse(readFileSync(new URL('../src/data/exercises/library.json', import.meta.url), 'utf8'));
const ids = only.length ? only : library.map((e) => e.id);
const slug = (id) => id.replaceAll('_', '-');
// O canvas comprime o alfa sem perda: o corpo detalhado dá 15–30 KB; acima disso, aviso.
const MAX = 32 * 1024;

const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ ...(channel && { channel }), args: ['--enable-unsafe-swiftshader', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 640, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await page.addInitScript(() => {
  localStorage.setItem('sbl-lod', 'hi');
  localStorage.removeItem('sbl-theme');
});

let first = true;
for (const id of ids) {
  const url = `${base}/exercicios/${slug(id)}?cartaz=1`;
  if (first) await page.goto(url);
  // Depois da primeira, navegação no próprio app: o corpo e o nível alto já estão na GPU.
  else
    await page.evaluate((u) => {
      history.pushState(null, '', u);
      dispatchEvent(new PopStateEvent('popstate'));
    }, url);
  await page.waitForFunction(() => document.documentElement.dataset.stage === 'ready' && document.documentElement.classList.contains('poster-capture'), null, { timeout: 120000 });
  // Primeira: luz acende (1,6 s) e o nível alto troca depois de 3,4 s + ocioso. Demais: troca de clipe assenta.
  await page.waitForTimeout(first ? 7000 : 1500);
  first = false;
  const png = await page.screenshot({ omitBackground: true });
  const webp = await page.evaluate(
    async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')?.drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.7);
    },
    png.toString('base64'),
  );
  if (!webp.startsWith('data:image/webp')) throw new Error(`${id}: sem WebP`);
  const buf = Buffer.from(webp.split(',')[1] ?? '', 'base64');
  writeFileSync(new URL(`${slug(id)}.webp`, out), buf);
  console.log(`${slug(id)}.webp ${(buf.length / 1024).toFixed(1)} KB${buf.length > MAX ? ' (acima do teto)' : ''}`);
}
await browser.close();
