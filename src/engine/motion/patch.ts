/**
 * Variação de um clipe como remendo do dado: troca ou soma números em caminhos do clipe (ou dos parâmetros do molde)
 * antes de compilar. Puro; o clipe original não muda.
 *
 * Caminho: chaves separadas por ponto. Em lista, um trecho pode ser índice (`0`), `*` (todos os itens) ou `chave=valor`
 * (itens cujo campo vale aquilo: `kind=cable`). Ex.: `params.implement.pulley.1`, `equipment.kind=cable.pulley.1`,
 * `reach.limb=leg.target.point.*.p.2`.
 */

export interface ClipPatch {
  readonly path: string;
  readonly op: 'set' | 'add';
  readonly value: number;
}

type Json = unknown;

const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Itens (ou a chave) que o trecho escolhe dentro de `node`. */
function select(node: Json, key: string): { holder: Record<string, Json> | Json[]; k: string | number }[] {
  if (Array.isArray(node)) {
    if (key === '*') return node.map((_, i) => ({ holder: node, k: i }));
    const eq = key.indexOf('=');
    if (eq > 0) {
      const f = key.slice(0, eq);
      const v = key.slice(eq + 1);
      return node.flatMap((item, i) => (isObj(item) && String(item[f]) === v ? [{ holder: node, k: i }] : []));
    }
    const i = Number(key);
    return Number.isInteger(i) && i >= 0 && i < node.length ? [{ holder: node, k: i }] : [];
  }
  if (isObj(node) && key in node) return [{ holder: node, k: key }];
  return [];
}

function get(h: Record<string, Json> | Json[], k: string | number): Json {
  return Array.isArray(h) ? h[k as number] : h[k as string];
}

function put(h: Record<string, Json> | Json[], k: string | number, v: Json) {
  if (Array.isArray(h)) h[k as number] = v;
  else h[k as string] = v;
}

/** Aplica um remendo no lugar; devolve quantos números mudaram (0 = caminho não achou nada). */
function applyOne(root: Json, p: ClipPatch): number {
  const keys = p.path.split('.');
  let level: Json[] = [root];
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i] ?? '';
    level = level.flatMap((n) => select(n, key).map((s) => get(s.holder, s.k)));
  }
  const last = keys[keys.length - 1] ?? '';
  let n = 0;
  for (const node of level)
    for (const s of select(node, last)) {
      const cur = get(s.holder, s.k);
      if (typeof cur !== 'number') continue;
      put(s.holder, s.k, p.op === 'set' ? p.value : cur + p.value);
      n++;
    }
  return n;
}

/** Cópia do dado com os remendos. Caminho que não acha número é erro (o teste dos dados pega na hora). */
export function applyPatches<T>(entry: T, patches: readonly ClipPatch[]): T {
  const copy = structuredClone(entry);
  for (const p of patches) if (applyOne(copy, p) === 0) throw new Error(`Remendo sem alvo: ${p.path}`);
  return copy;
}
