import { at } from '../math/arr';
import { distance, type Vec3 } from '../math/vec';
import type { EngineSkeleton } from '../kinematics/types';
import type { MusclePathInput } from './paths';

type Tuple3 = readonly [number, number, number];
type Point = { readonly s: string; readonly p: Tuple3 };
/** Ponto explícito do dado: nunca sai pela folga de junta. */
type Fixed = Point & { readonly fixed?: true };
export type PathRefLike = string | Point | { readonly mesh: string; readonly only: readonly string[] };

/** Linha central de uma malha do pacote (`muscle-paths.json`), da origem à inserção. */
export interface Centerline {
  readonly ends: readonly [string, string];
  readonly layer: 'superficial' | 'deep';
  readonly line: readonly Tuple3[];
}

export interface PartRefs {
  readonly id: string;
  readonly mesh: readonly string[];
  readonly path?: readonly PathRefLike[] | undefined;
  readonly wrap?: { readonly segment: string; readonly center: Tuple3; readonly radius: number; readonly side: Tuple3 } | undefined;
}

export interface MuscleRefs {
  readonly id: string;
  readonly group: string;
  readonly parts: readonly PartRefs[];
}

/** Pontas mais perto que isto viram um ponto só ao encadear malhas (m). */
const JOIN = 0.015;
/**
 * Pontos internos a menos disto (ao longo do caminho) do corte de uma junta cruzada saem (m). Perto da junta a
 * linha central desliza sobre o osso e dobra; preso a um segmento só, o ponto daria braço com sinal trocado.
 */
export const JOINT_CLEARANCE = 0.05;

/** Segmentos de A até B pela árvore (sobe até o ancestral comum e desce). */
function chain(sk: EngineSkeleton, a: string, b: string): string[] {
  const up = (s: string) => {
    const out = [s];
    for (let p = sk.byId.get(s)?.parent; p; p = sk.byId.get(p)?.parent) out.push(p);
    return out;
  };
  const ua = up(a), ub = up(b);
  const lca = ua.find((s) => ub.includes(s));
  if (!lca) throw new Error(`Sem ancestral comum: ${a}, ${b}`);
  return [...ua.slice(0, ua.indexOf(lca) + 1), ...ub.slice(0, ub.indexOf(lca)).reverse()];
}

/** Centro da articulação entre dois segmentos vizinhos na pose neutra, ou null se não são vizinhos. */
function jointBetween(sk: EngineSkeleton, x: string, y: string): Vec3 | null {
  if (sk.byId.get(x)?.parent === y) return sk.neutralOrigin.get(x) ?? null;
  if (sk.byId.get(y)?.parent === x) return sk.neutralOrigin.get(y) ?? null;
  return null;
}

/** Parâmetro (comprimento de arco) do ponto da polilinha mais perto de c. */
function arcParam(line: readonly Vec3[], c: Vec3): number {
  let best = Infinity, out = 0, acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = at(line, i), b = at(line, i + 1);
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
    const u = Math.min(1, Math.max(0, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / L2));
    const d = distance(c, [a[0] + ab[0] * u, a[1] + ab[1] * u, a[2] + ab[2] * u]);
    const len = Math.sqrt(L2);
    if (d < best) {
        best = d;
        out = acc + u * len;
      }
    acc += len;
  }
  return out;
}

/** Reparte a linha central entre os segmentos da cadeia: corta na projeção de cada centro articular. */
export function splitLine(sk: EngineSkeleton, c: Centerline): Point[] {
  const segs = chain(sk, c.ends[0], c.ends[1]);
  const line = c.line as readonly Vec3[];
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(at(cum, i - 1) + distance(at(line, i - 1), at(line, i)));
  // Cortes monotônicos (uma junta depois da outra ao longo da linha).
  const cuts: number[] = [];
  for (let k = 0; k < segs.length - 1; k++) {
    const j = jointBetween(sk, at(segs, k), at(segs, k + 1));
    if (!j) throw new Error(`Segmentos não vizinhos: ${at(segs, k)}, ${at(segs, k + 1)}`);
    cuts.push(Math.max(cuts.length ? at(cuts, cuts.length - 1) : 0, arcParam(line, j)));
  }
  return line.map((p, i) => {
    let k = 0;
    while (k < cuts.length && at(cum, i) >= at(cuts, k)) k++;
    // Pontas presas a origem e inserção, mesmo que a projeção da junta caia além delas.
    if (i === 0) k = 0;
    if (i === line.length - 1) k = segs.length - 1;
    return { s: at(segs, k), p };
  });
}

/**
 * Tira pontos internos a menos de JOINT_CLEARANCE (ao longo do caminho) do corte de cada junta cruzada.
 * Cada trecho de segmento guarda ao menos um ponto (o mais longe do corte).
 */
export function clearJoints(sk: EngineSkeleton, path: readonly Fixed[]): Point[] {
  const n = path.length;
  const P = path.map((q) => q.p as Vec3);
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(at(cum, i - 1) + distance(at(P, i - 1), at(P, i)));
  const runs: { s: string; from: number; to: number }[] = [];
  for (let i = 0; i < n; i++) {
    const last = runs.at(-1);
    if (last && last.s === at(path, i).s) last.to = i;
    else runs.push({ s: at(path, i).s, from: i, to: i });
  }
  // Corte de cada fronteira: projeção do centro articular no trecho entre os dois segmentos.
  const cuts = runs.slice(0, -1).map((r, k) => {
    const next = at(runs, k + 1);
    const j = jointBetween(sk, r.s, next.s);
    if (!j) return null;
    return at(cum, r.from) + arcParam(P.slice(r.from, next.to + 1), j);
  });
  const keep = new Array<boolean>(n).fill(true);
  runs.forEach((r, k) => {
    const near = [k > 0 ? cuts[k - 1] : null, k < cuts.length ? cuts[k] : null].filter((c): c is number => c !== null && c !== undefined);
    if (near.length === 0) return;
    let far = r.from, farD = -1;
    for (let i = r.from; i <= r.to; i++) {
      const d = Math.min(...near.map((c) => Math.abs(at(cum, i) - c)));
      if (d > farD) {
        farD = d;
        far = i;
      }
      if (d < JOINT_CLEARANCE && i !== 0 && i !== n - 1 && !at(path, i).fixed) keep[i] = false;
    }
    if (!keep.slice(r.from, r.to + 1).some(Boolean)) keep[far] = true;
  });
  return path.filter((_, i) => keep[i]).map((q) => ({ s: q.s, p: q.p }));
}

/**
 * Caminho do motor a partir das linhas centrais: encadeia as malhas e os pontos explícitos da parte.
 * Ao emendar uma malha, começa do ponto dela mais perto do fim do caminho (sem voltar para trás).
 */
export function resolvePath(sk: EngineSkeleton, refs: readonly PathRefLike[], lines: Readonly<Record<string, Centerline>>, partId: string): Point[] {
  const out: Fixed[] = [];
  for (const ref of refs) {
    if (typeof ref !== 'string' && 'p' in ref) {
      out.push({ s: ref.s, p: ref.p, fixed: true });
      continue;
    }
    const id = typeof ref === 'string' ? ref : ref.mesh;
    const line = lines[id];
    if (!line) throw new Error(`Parte ${partId}: malha ${id} sem linha central`);
    const all = splitLine(sk, line);
    const pts = typeof ref === 'string' ? all : all.filter((q) => ref.only.includes(q.s));
    if (pts.length === 0) throw new Error(`Parte ${partId}: trecho vazio de ${id}`);
    let start = 0;
    if (out.length > 0) {
      const last = at(out, out.length - 1).p as Vec3;
      let best = Infinity;
      pts.forEach((q, i) => {
        const d = distance(q.p as Vec3, last);
        if (d < best) {
        best = d;
        start = i;
      }
      });
      if (best < JOIN) start++;
    }
    out.push(...pts.slice(start));
  }
  return clearJoints(sk, out);
}

/** Trecho em que o caminho troca de segmento na junta mais perto do centro do cilindro. */
function wrapSpan(sk: EngineSkeleton, path: readonly Point[], center: Tuple3, partId: string): number {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const j = jointBetween(sk, at(path, i).s, at(path, i + 1).s);
    if (!j) continue;
    const d = distance(j, center as Vec3);
    if (d < bestD) {
        bestD = d;
        best = i;
      }
  }
  if (best < 0) throw new Error(`Parte ${partId}: contorno sem troca de segmento`);
  return best;
}

/** `sk` = esqueleto de referência (1,75 m): as linhas centrais estão nessa escala. */
export function resolveMuscleParts(defs: readonly MuscleRefs[], lines: Readonly<Record<string, Centerline>>, sk: EngineSkeleton): MusclePathInput[] {
  return defs.map((m) => ({
    id: m.id,
    group: m.group,
    parts: m.parts.map((part) => {
      const path = resolvePath(sk, part.path ?? [at(part.mesh, 0)], lines, part.id);
      const layer = part.mesh.some((id) => lines[id]?.layer === 'superficial') ? ('superficial' as const) : ('deep' as const);
      return {
        id: part.id,
        layer,
        path,
        ...(part.wrap && { wrap: { ...part.wrap, span: wrapSpan(sk, path, part.wrap.center, part.id) } }),
      };
    }),
  }));
}
