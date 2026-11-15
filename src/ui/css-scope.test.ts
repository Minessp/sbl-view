/**
 * CSS acompanha a rota que usa a classe. O Vite só injeta o CSS dos módulos que a rota alcança: classe definida num CSS
 * de outra rota fica sem estilo até essa outra rota carregar (lista de exercícios crua na página de músculo, régua sem
 * cor). Para cada rota do mapa `load` do App.tsx (mais a página inicial), segue os `import` estáticos, junta os CSS
 * alcançados (com os da shell) e as classes usadas nos .tsx alcançados. Compara classe inteira, não só o bloco antes
 * de `__`/`--`: a regra de toque de primitives.css define `.target-list__name` na shell, e o bloco passaria.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Classe montada em runtime ou estilizada por CSS que chega por outro caminho (com o motivo). */
const EXCEPTIONS: Record<string, string> = {
  'view-slot__name': 'compare.css só a estiliza dentro de .compare-slot__cap; no Lab segue o texto de .view-slot',
};

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null; // pacote: fora do projeto
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const read = (p: string) => readFileSync(p, 'utf8');

/** Só import/export estático (`import(` dinâmico vira chunk à parte e fica de fora). */
function deps(file: string): string[] {
  const text = read(file);
  const re = file.endsWith('.css') ? /@import\s+(?:url\()?['"]([^'"]+)['"]/g : /(?:^|[\s;])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const p = resolveSpec(m[1] ?? '', file);
    if (p) out.push(p);
  }
  return out;
}

function closure(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (f === undefined || seen.has(f)) continue;
    seen.add(f);
    stack.push(...deps(f));
  }
  return seen;
}

/** Classes definidas num CSS: só o texto dos seletores (antes de `{`), sem comentários. */
function cssBlocks(file: string): Set<string> {
  const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set<string>();
  for (const sel of text.matchAll(/([^{};]+)\{/g)) for (const m of (sel[1] ?? '').matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) out.add(m[1] ?? '');
  return out;
}

/** Fecha o `{` de `className={` contando chaves (template com `${}` dentro). */
function braced(text: string, at: number): string {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(at + 1, i);
  }
  return '';
}

/** Classes usadas em `className="..."` e nas literais de `className={...}` (partes `${}` de template saem). */
function usedBlocks(file: string): Set<string> {
  const text = read(file);
  const out = new Set<string>();
  const add = (s: string) => {
    for (const tok of s.split(/\s+/)) if (/^[a-z][\w-]*$/.test(tok)) out.add(tok);
  };
  for (const m of text.matchAll(/className=(?:"([^"]*)"|\{)/g)) {
    if (m[1] !== undefined) {
      add(m[1]);
      continue;
    }
    const expr = braced(text, (m.index ?? 0) + m[0].length - 1).replace(/\$\{[^}]*\}/g, ' ');
    for (const lit of expr.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) add(lit[1] ?? lit[2] ?? lit[3] ?? '');
  }
  return out;
}

function allCss(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return allCss(p);
    return p.endsWith('.css') ? [p] : [];
  });
}

const definedAnywhere = new Map<string, string[]>();
for (const f of allCss(SRC))
  for (const b of cssBlocks(f)) definedAnywhere.set(b, [...(definedAnywhere.get(b) ?? []), relative(SRC, f).replaceAll('\\', '/')]);

const appFile = join(SRC, 'app/App.tsx');
const loadBlock = /const load = \{([\s\S]*?)\n\};/.exec(read(appFile))?.[1] ?? '';
const routes = [...loadBlock.matchAll(/import\('([^']+)'\)/g)].map((m) => m[1] ?? '');
const shell = closure([join(SRC, 'main.tsx')]);

describe('CSS no chunk da rota', () => {
  it('acha as rotas do App.tsx', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  for (const spec of ['@/features/home/Home', ...routes]) {
    it(spec, () => {
      const entry = resolveSpec(spec, appFile);
      expect(entry, `rota ${spec} não resolvida`).not.toBeNull();
      const files = new Set([...shell, ...closure(entry ? [entry] : [])]);
      const styled = new Set<string>();
      for (const f of files) if (f.endsWith('.css')) for (const b of cssBlocks(f)) styled.add(b);
      const leaks: string[] = [];
      for (const f of files) {
        if (!f.endsWith('.tsx')) continue;
        for (const b of usedBlocks(f)) {
          const where = definedAnywhere.get(b);
          if (where && !styled.has(b) && !(b in EXCEPTIONS)) leaks.push(`.${b} em ${relative(SRC, f).replaceAll('\\', '/')} (definida em ${where.join(', ')})`);
        }
      }
      expect([...new Set(leaks)]).toEqual([]);
    });
  }
});
