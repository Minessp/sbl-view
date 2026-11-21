/**
 * Build dos dois idiomas. PT-BR em `dist/`; inglês em `.dist-en/` (sem `public/`), depois junto: os assets vão para
 * `dist/assets/` (nome com hash: chunk igual nos dois vira o mesmo arquivo) e o `index.html` para `dist/en/`.
 * O PWA (sw.js e manifestos) só depois da junção, com o precache dos dois.
 *   node scripts/build.mjs
 */
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { build } from 'vite';
import { writePwa } from './vite-pwa.ts';

const DIST = 'dist';
const EN = '.dist-en';

await build({ mode: 'production' });
await build({ mode: 'en', publicDir: false, build: { outDir: EN, emptyOutDir: true } });

const ptAssets = new Set(readdirSync(`${DIST}/assets`));
const enAssets = readdirSync(`${EN}/assets`);
// O palco 3D (~1 MB) não tem texto de idioma: tem de sair o mesmo arquivo nos dois (vite.config.ts → stageShared).
const stage = enAssets.filter((f) => /^Stage-.+\.js$/.test(f));
if (stage.length !== 1 || !ptAssets.has(stage[0])) throw new Error(`chunk do palco difere entre os idiomas: ${stage.join(', ')}`);
cpSync(`${EN}/assets`, `${DIST}/assets`, { recursive: true });
mkdirSync(`${DIST}/en`, { recursive: true });
cpSync(`${EN}/index.html`, `${DIST}/en/index.html`);
rmSync(EN, { recursive: true, force: true });

writePwa(DIST);

const shared = enAssets.filter((f) => ptAssets.has(f)).length;
console.log(`idiomas juntos: ${enAssets.length} assets do inglês, ${shared} iguais ao PT-BR, ${enAssets.length - shared} próprios`);
