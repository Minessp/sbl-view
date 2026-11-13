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

const dark = block(':root {');
const light = block(":root[data-theme='light']");

/** [frente, fundo, mínimo, por quê] */
const PAIRS: [string, string, number, string][] = [
  ['c-ink', 'c-bg', 7, 'texto principal (AAA)'],
  ['c-ink', 'c-bg-2', 7, 'texto em painel'],
  ['c-ink', 'c-bg-3', 7, 'texto em superfície elevada'],
  ['c-ink-2', 'c-bg', 4.5, 'legendas'],
  ['c-ink-2', 'c-bg-2', 4.5, 'legendas em painel'],
  ['c-ink-2', 'c-bg-3', 4.5, 'legendas em superfície elevada'],
  ['c-accent', 'c-bg', 4.5, 'acento usado como texto'],
  ['c-accent', 'c-bg-2', 4.5, 'acento em painel'],
  ['c-on-accent', 'c-accent', 4.5, 'texto sobre acento (botão principal)'],
  ['c-cool', 'c-bg', 4.5, 'aço usado como texto'],
  ['c-ink-2', 'c-rule', 1.8, 'fio deve sumir perto da legenda, não competir'],
];

describe.each([
  ['estúdio (escuro, padrão)', dark],
  ['ciclorama (claro)', light],
])('contraste — %s', (_name, theme) => {
  it.each(PAIRS)('%s sobre %s ≥ %s (%s)', (fg, bg, min) => {
    const a = theme[fg], b = theme[bg];
    expect(a, fg).toBeDefined();
    expect(b, bg).toBeDefined();
    expect(contrast(a ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
  });
});

it('os dois temas definem as mesmas cores', () => {
  expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
});
