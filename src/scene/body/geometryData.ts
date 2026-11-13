/**
 * Geometria do corpo em arrays tipados, sem three.js: roda na página e no worker da troca de nível (lodWorker.ts).
 * Funde o pacote nas quatro camadas, lado esquerdo por espelho, com os atributos do shader (fibra, tendão, raio).
 */
import type { Vec3 } from '@/engine/math/vec';
import type { AnatomyPack, AnatomyPart } from '../anatomy/pack';

export type BodyLayer = 'bone' | 'deep' | 'superficial' | 'skin';
export const LAYERS: readonly BodyLayer[] = ['bone', 'deep', 'superficial', 'skin'];

/** Arrays de uma camada (sem three): vão para a GPU como estão; o worker da troca de nível os transfere. */
export interface LayerData {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly skinIndex: Uint8Array;
  /** Pesos em u8 (somam 255), lidos normalizados. */
  readonly skinWeight: Uint8Array;
  readonly slot: Uint16Array;
  readonly index: Uint32Array;
  /** Músculo e tendão: t ao longo da linha central e fração tendínea (u8 normalizado), mais 2 livres. */
  readonly muscle?: Uint8Array;
  /** Músculo e tendão: direção da fibra na ligação (tangente à superfície, i8 normalizado), mais 1 livre. */
  readonly fiber?: Int8Array;
  readonly radial?: Float32Array;
}
export type BodyGeometryData = Readonly<Record<BodyLayer, LayerData>>;

export function layerOf(p: AnatomyPart): BodyLayer {
  if (p.kind === 'skin') return 'skin';
  if (p.kind === 'bone' || p.kind === 'cartilage') return 'bone';
  return p.layer === 'superficial' ? 'superficial' : 'deep';
}

/** Assinatura das vagas: dois pacotes só trocam de malha se a ordem e o tipo das partes forem os mesmos. */
export const slotSignature = (pack: AnatomyPack) => pack.parts.map((p) => `${p.id}:${p.mirror ? 2 : 1}:${layerOf(p)}`).join(',');

/**
 * Normais por área. Parte espelhada: o vértice da linha média (x = 0) só vê as faces do lado direito, e a cópia
 * espelhada inverteria o x da normal, um vinco no meio do corpo. A normal dele é a média com o espelho (x = 0).
 */
function vertexNormals(pos: Float32Array, idx: Uint32Array, mirror: boolean): Float32Array {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = (idx[t] ?? 0) * 3, b = (idx[t + 1] ?? 0) * 3, c = (idx[t + 2] ?? 0) * 3;
    const ux = (pos[b] ?? 0) - (pos[a] ?? 0), uy = (pos[b + 1] ?? 0) - (pos[a + 1] ?? 0), uz = (pos[b + 2] ?? 0) - (pos[a + 2] ?? 0);
    const vx = (pos[c] ?? 0) - (pos[a] ?? 0), vy = (pos[c + 1] ?? 0) - (pos[a + 1] ?? 0), vz = (pos[c + 2] ?? 0) - (pos[a + 2] ?? 0);
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      n[v] = (n[v] ?? 0) + nx;
      n[v + 1] = (n[v + 1] ?? 0) + ny;
      n[v + 2] = (n[v + 2] ?? 0) + nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    if (mirror && pos[i] === 0) n[i] = 0;
    const l = Math.hypot(n[i] ?? 0, n[i + 1] ?? 0, n[i + 2] ?? 0);
    // Área nula: normal indefinida viraria NaN no shader. Frente.
    if (l < 1e-9) {
      n[i] = 0;
      n[i + 1] = -0.3;
      n[i + 2] = 0.954;
      continue;
    }
    n[i] = (n[i] ?? 0) / l;
    n[i + 1] = (n[i + 1] ?? 0) / l;
    n[i + 2] = (n[i + 2] ?? 0) / l;
  }
  return n;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Fração tendínea em t: as pontas da linha central (o shader recorta a borda com o desenho dos fascículos). Parte do
 * tipo tendão (tendão do calcâneo, trato iliotibial, aponeuroses) é toda tendínea. A seção média por fatia foi testada
 * como sinal e descartada: leque largo e fino na ponta (palmar longo, trapézio) virava tendão.
 */
export function tendonAt(p: Pick<AnatomyPart, 'kind'>, t: number): number {
  if (p.kind === 'tendon') return 1;
  return 1 - smooth(0.015, 0.1, t) * (1 - smooth(0.9, 0.985, t));
}

/** Direção da linha central em t (da origem à inserção), projetada no plano tangente da normal; unitária. */
function fiberAt(cl: readonly Vec3[], t: number, nx: number, ny: number, nz: number, out: number[]) {
  const S = cl.length;
  const k = Math.floor(Math.min(S - 1.001, Math.max(0, t * (S - 1))));
  const a = cl[Math.max(0, k - 1)] ?? [0, 0, 0], b = cl[Math.min(S - 1, k + 2)] ?? [0, 1, 0];
  let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
  const d = tx * nx + ty * ny + tz * nz;
  tx -= d * nx;
  ty -= d * ny;
  tz -= d * nz;
  if (Math.hypot(tx, ty, tz) < 1e-9) {
    // Fibra ao longo da normal (ponta do músculo): qualquer direção do plano tangente serve.
    tx = -nz;
    ty = 0;
    tz = nx;
  }
  const m = Math.hypot(tx, ty, tz) || 1;
  out[0] = tx / m;
  out[1] = ty / m;
  out[2] = tz / m;
}

/**
 * Funde o pacote nas quatro camadas (lado esquerdo por espelho). Puro: roda também no worker da troca de nível.
 * Arrays tipados pré-alocados (o nível ultra passa de 2 milhões de vértices com o espelho).
 */
export function buildBodyGeometryData(pack: AnatomyPack): BodyGeometryData {
  const count = () => Object.fromEntries(LAYERS.map((l) => [l, { v: 0, i: 0 }])) as Record<BodyLayer, { v: number; i: number }>;
  const size = count();
  for (const p of pack.parts) {
    const c = p.mirror ? 2 : 1;
    const s = size[layerOf(p)];
    s.v += c * (p.positions.length / 3);
    s.i += c * p.indices.length;
  }
  const out = Object.fromEntries(
    LAYERS.map((l) => {
      const { v, i } = size[l];
      const muscle = l === 'deep' || l === 'superficial';
      const d: LayerData = {
        position: new Float32Array(v * 3),
        normal: new Float32Array(v * 3),
        skinIndex: new Uint8Array(v * 4),
        skinWeight: new Uint8Array(v * 4),
        slot: new Uint16Array(v),
        index: new Uint32Array(i),
        ...(muscle && { muscle: new Uint8Array(v * 4), fiber: new Int8Array(v * 4), radial: new Float32Array(v * 3) }),
      };
      return [l, d];
    }),
  ) as Record<BodyLayer, LayerData>;
  const cursor = count();
  const T = [0, 0, 0];
  let slot = 0;
  for (const part of pack.parts) {
    const layer = layerOf(part);
    const normals = vertexNormals(part.positions, part.indices, part.mirror);
    const n = part.positions.length / 3;
    const P = part.positions;
    let fib: Float32Array | null = null;
    let ten: Float32Array | null = null;
    if (part.along && part.centerline) {
      fib = new Float32Array(n * 3);
      ten = new Float32Array(n);
      for (let v = 0; v < n; v++) {
        const t = part.along[v] ?? 0;
        fiberAt(part.centerline, t, normals[v * 3] ?? 0, normals[v * 3 + 1] ?? 0, normals[v * 3 + 2] ?? 1, T);
        fib[v * 3] = T[0] ?? 0;
        fib[v * 3 + 1] = T[1] ?? 0;
        fib[v * 3 + 2] = T[2] ?? 0;
        ten[v] = tendonAt(part, t);
      }
    }
    for (const mirror of part.mirror ? [null, pack.jointMirror] : [null]) {
      const o = out[layer];
      const c = cursor[layer];
      const base = c.v;
      const sx = mirror ? -1 : 1;
      for (let v = 0; v < n; v++) {
        const w = base + v;
        o.position[w * 3] = sx * (P[v * 3] ?? 0);
        o.position[w * 3 + 1] = P[v * 3 + 1] ?? 0;
        o.position[w * 3 + 2] = P[v * 3 + 2] ?? 0;
        o.normal[w * 3] = sx * (normals[v * 3] ?? 0);
        o.normal[w * 3 + 1] = normals[v * 3 + 1] ?? 0;
        o.normal[w * 3 + 2] = normals[v * 3 + 2] ?? 0;
        for (let k = 0; k < 4; k++) {
          const j = part.joints[v * 4 + k] ?? 0;
          o.skinIndex[w * 4 + k] = mirror ? (mirror[j] ?? j) : j;
          o.skinWeight[w * 4 + k] = Math.round((part.weights[v * 4 + k] ?? 0) * 255);
        }
        o.slot[w] = slot;
        if (o.muscle && o.fiber && o.radial) {
          o.muscle[w * 4] = Math.round((part.along?.[v] ?? 0) * 255);
          o.muscle[w * 4 + 1] = Math.round((ten?.[v] ?? 0) * 255);
          o.fiber[w * 4] = Math.round(sx * (fib?.[v * 3] ?? 0) * 127);
          o.fiber[w * 4 + 1] = Math.round((fib?.[v * 3 + 1] ?? 0) * 127);
          o.fiber[w * 4 + 2] = Math.round((fib?.[v * 3 + 2] ?? 0) * 127);
          const r = part.radial;
          o.radial[w * 3] = sx * (r?.[v * 3] ?? 0);
          o.radial[w * 3 + 1] = r?.[v * 3 + 1] ?? 0;
          o.radial[w * 3 + 2] = r?.[v * 3 + 2] ?? 0;
        }
      }
      const I = part.indices;
      const idx = o.index;
      for (let t = 0; t < I.length; t += 3) {
        const at = c.i + t;
        idx[at] = base + (I[t] ?? 0);
        // Espelho inverte a orientação: troca dois vértices.
        idx[at + 1] = base + (I[t + (mirror ? 2 : 1)] ?? 0);
        idx[at + 2] = base + (I[t + (mirror ? 1 : 2)] ?? 0);
      }
      c.v += n;
      c.i += I.length;
      slot++;
    }
  }
  return out;
}

/** Transferíveis dos arrays (postMessage sem cópia). */
export function geometryBuffers(data: BodyGeometryData): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const l of LAYERS) for (const a of Object.values(data[l]) as (ArrayBufferView | undefined)[]) if (a) out.push(a.buffer as ArrayBuffer);
  return out;
}

