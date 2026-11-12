import { at } from '../math/arr';
import type { Vec3 } from '../math/vec';
import { primitiveBounds, primitiveDistance, sceneDistance, smin, type Aabb, type SdfPrimitive } from './sdf';

export interface SurfaceMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  /** Índice da primitiva dominante por vértice (para amarrar ao segmento). */
  readonly nearest: Uint16Array;
}

export interface MeshOptions {
  /** Tamanho da célula (m). */
  readonly cell: number;
  /** Raio da união suave (m). */
  readonly blend: number;
}

const inside = (b: Aabb, p: Vec3) =>
  p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1] && p[2] >= b.min[2] && p[2] <= b.max[2];

/** 12 arestas do cubo como pares de cantos (bit0 = x, bit1 = y, bit2 = z). */
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Extrai a isosuperfície d = 0 da união suave das primitivas (naive surface nets).
 * O campo só é avaliado perto de cada primitiva: fora de todas, vale "longe".
 */
export function meshSdf(prims: readonly SdfPrimitive[], opts: MeshOptions): SurfaceMesh {
  const { cell: h, blend: k } = opts;
  const pad = k + 2 * h;
  const boxes = prims.map((p) => primitiveBounds(p, pad));
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (const a of [0, 1, 2] as const) {
      lo[a] = Math.min(lo[a], b.min[a]);
      hi[a] = Math.max(hi[a], b.max[a]);
    }
  }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1;
  const ny = Math.ceil((hi[1] - lo[1]) / h) + 1;
  const nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const field = new Float32Array(nx * ny * nz).fill(pad);
  const touched = new Uint8Array(nx * ny * nz);
  const at3 = (i: number, j: number, kk: number) => i + nx * (j + ny * kk);
  const F = (i: number, j: number, kk: number) => at(field, at3(i, j, kk));

  // Campo: varre só a caixa de cada primitiva.
  prims.forEach((prim, pi) => {
    const b = at(boxes, pi);
    const i0 = Math.max(0, Math.floor((b.min[0] - lo[0]) / h)), i1 = Math.min(nx - 1, Math.ceil((b.max[0] - lo[0]) / h));
    const j0 = Math.max(0, Math.floor((b.min[1] - lo[1]) / h)), j1 = Math.min(ny - 1, Math.ceil((b.max[1] - lo[1]) / h));
    const k0 = Math.max(0, Math.floor((b.min[2] - lo[2]) / h)), k1 = Math.min(nz - 1, Math.ceil((b.max[2] - lo[2]) / h));
    for (let kk = k0; kk <= k1; kk++) {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d = primitiveDistance(prim, [lo[0] + i * h, lo[1] + j * h, lo[2] + kk * h]);
          const id = at3(i, j, kk);
          field[id] = touched[id] ? smin(at(field, id), d, k) : d;
          touched[id] = 1;
        }
      }
    }
  });

  // Um vértice por célula cruzada pela superfície.
  const cx = nx - 1, cy = ny - 1;
  const cellVert = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const cAt = (i: number, j: number, kk: number) => i + cx * (j + cy * kk);
  const pos: number[] = [];
  const corner = new Float32Array(8);

  for (let kk = 0; kk < nz - 1; kk++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = F(i + (c & 1), j + ((c >> 1) & 1), kk + ((c >> 2) & 1));
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          const da = at(corner, a), db = at(corner, b);
          if (da < 0 === db < 0) continue;
          const t = da / (da - db);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cellVert[cAt(i, j, kk)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (kk + sz / n) * h);
      }
    }
  }

  // Um quadrilátero por aresta da grade que cruza a superfície.
  // Ordem dos cantos = anti-horária no plano vista do lado +eixo; inverte quando o lado de dentro é o +eixo.
  const idx: number[] = [];
  const V = (i: number, j: number, kk: number) => at(cellVert, cAt(i, j, kk));
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b);
    else idx.push(a, b, c, a, c, d);
  };
  for (let kk = 1; kk < nz - 1; kk++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = F(i, j, kk) < 0;
        if (v0 !== F(i + 1, j, kk) < 0) quad(V(i, j - 1, kk - 1), V(i, j, kk - 1), V(i, j, kk), V(i, j - 1, kk), !v0);
        if (v0 !== F(i, j + 1, kk) < 0) quad(V(i - 1, j, kk - 1), V(i - 1, j, kk), V(i, j, kk), V(i, j, kk - 1), !v0);
        if (v0 !== F(i, j, kk + 1) < 0) quad(V(i - 1, j - 1, kk), V(i, j - 1, kk), V(i, j, kk), V(i - 1, j, kk), !v0);
      }
    }
  }

  // Normais pelo gradiente do SDF (só primitivas próximas) + primitiva dominante.
  const vcount = pos.length / 3;
  const positions = new Float32Array(pos);
  const normals = new Float32Array(vcount * 3);
  const nearest = new Uint16Array(vcount);
  const e = h * 0.5;
  for (let v = 0; v < vcount; v++) {
    const p: Vec3 = [at(positions, v * 3), at(positions, v * 3 + 1), at(positions, v * 3 + 2)];
    const localIdx: number[] = [];
    boxes.forEach((b, pi) => {
      if (inside(b, p)) localIdx.push(pi);
    });
    const local = localIdx.map((pi) => at(prims, pi));
    const f = (q: Vec3) => sceneDistance(local, q, k).d;
    const gx = f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]);
    const gy = f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]);
    const gz = f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e]);
    const l = Math.hypot(gx, gy, gz) || 1;
    normals.set([gx / l, gy / l, gz / l], v * 3);
    const near = sceneDistance(local, p, k).nearest;
    nearest[v] = near >= 0 ? at(localIdx, near) : 0;
  }

  return { positions, normals, indices: new Uint32Array(idx), nearest };
}
