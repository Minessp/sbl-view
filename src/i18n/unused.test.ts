/**
 * Texto sem uso: toda chave do dicionário PT precisa de referência fora de src/i18n (findReferences do TypeScript).
 * Registro lido por índice (`t.groups[id]`) não tem referência por chave: entra em DYNAMIC com o caminho do pai.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = ['src/i18n/pt-BR.ts', 'src/i18n/pt-BR.app.ts', 'src/i18n/legal.pt-BR.ts'];

/** Pais cujos filhos são lidos por índice (id do dado, chave de união, tipo de erro). */
const DYNAMIC = [
  'home.lens', 'home.layers', 'groups', 'regions', 'patterns', 'equipment', 'emphasis', 'roles', 'status', 'evidence.describe',
  'atlas.view', 'atlas.structures', 'atlas.dive.levels', 'atlas.ex.layerName', 'atlas.ex.layerMode', 'atlas.ex.cutAxis',
  'atlas.ex.kind', 'atlas.ex.peelStop', 'library.regions', 'exercise.player.views', 'exercise.player.phase',
  'plan.focus', 'plan.splitNotes', 'plan.splits', 'plan.techniques', 'plan.techniqueHow', 'plan.profiles',
  'plan.statusLabel', 'plan.priority', 'heat.view', 'training.kinds', 'training.live.reason', 'training.live.techniqueSet',
  'training.measures.kinds', 'training.data.importErrors', 'labCompare.views', 'homeMore.live.joints',
  'settings.sizes', 'settings.levels', 'settings.themeNow', 'search.groups', 'pages',
];
/** Folhas lidas por índice direto no pai (`t.evidence[confidence]`). */
const DYNAMIC_LEAVES = ['evidence.estabelecido', 'evidence.provavel', 'evidence.especulativo'];

function unusedKeys(): string[] {
  const cfgPath = path.join(ROOT, 'tsconfig.app.json');
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, ROOT);
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => cfg.fileNames,
    getScriptVersion: () => '1',
    getScriptSnapshot: (f) => {
      const t = ts.sys.readFile(f);
      return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t);
    },
    getCurrentDirectory: () => ROOT,
    getCompilationSettings: () => cfg.options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const ls = ts.createLanguageService(host);
  const dead: string[] = [];
  for (const rel of FILES) {
    const file = path.join(ROOT, rel).replaceAll('\\', '/');
    const sf = ls.getProgram()?.getSourceFile(file);
    if (!sf) throw new Error(`sem ${rel}`);
    const visit = (node: ts.Node, trail: string[]): void => {
      if (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) {
        const here = [...trail, node.name.getText(sf).replace(/'/g, '')];
        const key = here.join('.');
        if (DYNAMIC.includes(trail.join('.')) || DYNAMIC_LEAVES.includes(key)) return;
        const refs = (ls.findReferences(file, node.name.getStart(sf)) ?? []).flatMap((r) => r.references);
        if (!refs.some((r) => !r.fileName.includes('/src/i18n/'))) dead.push(`${rel}: ${key}`);
        else if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) node.initializer.properties.forEach((p) => visit(p, here));
        return;
      }
      ts.forEachChild(node, (c) => visit(c, trail));
    };
    visit(sf, []);
  }
  return dead;
}

describe('dicionário', () => {
  it('toda chave tem uso fora de src/i18n', { timeout: 120_000 }, () => {
    expect(unusedKeys()).toEqual([]);
  });
});
