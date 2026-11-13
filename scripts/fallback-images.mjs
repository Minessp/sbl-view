/**
 * Imagens do corpo anatômico para quem não tem WebGL (src/scene/StaticFallback.tsx).
 * Roda à mão contra o servidor de desenvolvimento (a rota /dev/corpo só existe nele) e grava em public/fallback/.
 *
 *   npm run dev   # noutro terminal
 *   node scripts/fallback-images.mjs http://localhost:5173
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = new URL('../public/fallback/', import.meta.url);
mkdirSync(out, { recursive: true });
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ ...(channel && { channel }), args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 600, height: 1564 }, deviceScaleFactor: 1 });
for (const [name, vista] of [['frente', 'frente'], ['costas', 'costas']]) {
  await page.goto(`${base}/dev/corpo?vista=${vista}&camadas=musculo,osso&fundo=nenhum&painel=nao&dist=1.32&alvo=0.89&lod=hi`);
  await page.waitForFunction(() => document.documentElement.dataset.devBody?.startsWith('pronto'), null, { timeout: 120000 });
  await page.waitForTimeout(500);
  const url = await page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/webp', 0.82) ?? '');
  if (!url.startsWith('data:image/webp')) throw new Error('sem WebP');
  const buf = Buffer.from(url.split(',')[1] ?? '', 'base64');
  writeFileSync(new URL(`corpo-${name}.webp`, out), buf);
  console.log(`corpo-${name}.webp: ${(buf.length / 1024).toFixed(0)} KB`);
}
await browser.close();
