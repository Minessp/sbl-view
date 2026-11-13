/**
 * Gera os ícones PNG do PWA a partir do desenho do favicon (versão clara, cores fixas).
 * Roda uma vez quando o desenho mudar; os PNG ficam versionados em public/.
 *   node scripts/icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
  // Ícone de app não segue o tema do sistema: fica a versão papel.
  .replace(/^\s*@media.*\n/m, '');
writeFileSync(new URL('../public/icon.svg', import.meta.url), svg);

const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch(channel ? { channel } : {});
const bg = /\.p\{fill:(#[0-9A-Fa-f]+)\}/.exec(svg)?.[1] ?? '#ffffff';

async function render(size, file, inset) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const pad = Math.round(size * inset);
  await page.setContent(
    `<html><body style="margin:0;background:${bg}"><div style="padding:${pad}px;width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg.replace('<svg ', `<svg width="${size - 2 * pad}" height="${size - 2 * pad}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), omitBackground: false });
  await page.close();
}

await render(192, 'icon-192.png', 0);
await render(512, 'icon-512.png', 0);
// Máscara: o desenho cabe no círculo seguro (80% do lado).
await render(512, 'icon-maskable-512.png', 0.14);
await browser.close();
console.log('ícones gerados');
