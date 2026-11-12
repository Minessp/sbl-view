/** Contraste WCAG dos tokens, lido direto de tokens.css (fonte única). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrast } from './color';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`bloco ${selector} não encontrado`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--(c-[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1] ?? ''] = (m[2] ?? '').toLowerCase();
  return out;
}

const light = block(':root {');
const darkMedia = block(":root:not([data-theme='light'])");
const darkForced = block(":root[data-theme='dark']");

/** [frente, fundo, mínimo, por quê] */
const PAIRS: [string, string, number, string][] = [
  ['c-ink', 'c-bg', 7, 'texto principal (AAA)'],
  ['c-ink', 'c-bg-2', 7, 'texto em área rebaixada'],
  ['c-ink-2', 'c-bg', 4.5, 'legendas'],
  ['c-ink-2', 'c-bg-2', 4.5, 'legendas em área rebaixada'],
  ['c-accent', 'c-bg', 4.5, 'acento usado como texto'],
  ['c-accent', 'c-bg-2', 4.5, 'acento em área rebaixada'],
  ['c-on-accent', 'c-accent', 4.5, 'texto sobre acento'],
  ['c-ink', 'c-bone', 7, 'traço sobre osso'],
  ['c-ink-2', 'c-rule', 1.8, 'fio deve sumir perto da legenda, não competir'],
];

describe.each([
  ['papel (claro)', light],
  ['ardósia (escuro)', darkMedia],
])('contraste — %s', (_name, theme) => {
  it.each(PAIRS)('%s sobre %s ≥ %s (%s)', (fg, bg, min) => {
    const a = theme[fg], b = theme[bg];
    expect(a, fg).toBeDefined();
    expect(b, bg).toBeDefined();
    expect(contrast(a ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
  });
});

it('tema escuro forçado é idêntico ao do sistema', () => {
  expect(darkForced).toEqual(darkMedia);
});
