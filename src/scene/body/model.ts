/**
 * Corpo anatômico único: o pacote SBL5 fundido em quatro geometrias (osso, profundo, superficial, pele).
 * Cada parte de cada lado vira uma "vaga" (slot) com índice próprio: o shader lê o estado dela numa textura
 * (destaque, opacidade, calor, ativação, oculto, volume) e o passe de seleção devolve o índice.
 * O lado esquerdo sai por espelho em X (juntas _r ↔ _l, triângulos com a ordem invertida).
 */
import { BufferAttribute, BufferGeometry } from 'three';
import type { MuscleDef } from '@/data/schema/muscle';
import type { Vec3 } from '@/engine/math/vec';
import type { AnatomyKind, AnatomyPack, AnatomyPart } from '../anatomy/pack';

export type BodyLayer = 'bone' | 'deep' | 'superficial' | 'skin';
export const LAYERS: readonly BodyLayer[] = ['bone', 'deep', 'superficial', 'skin'];

export interface Box {
  readonly center: Vec3;
  readonly size: Vec3;
}

export interface BodySlot {
  readonly index: number;
  /** Id da parte no pacote (`vastus_lateralis`, `bones_thigh_r`, `skin`). */
  readonly anatomyId: string;
  /** 'c' = parte da linha média, sem cópia. */
  readonly side: 'r' | 'l' | 'c';
  readonly kind: AnatomyKind;
  readonly layer: BodyLayer;
  /** Músculo e parte do Atlas (`muscles.json`), se a malha pertence a um. */
  readonly muscleId?: string;
  readonly musclePartId?: string;
  /** Caixa na pose de ligação. */
  readonly box: Box;
  /** Músculo/tendão: 16 pontos da linha central (ligação) com 4 juntas e pesos cada, para medir o comprimento. */
  readonly line?: { readonly points: Float32Array; readonly joints: Uint8Array; readonly weights: Float32Array; readonly rest: number };
}

export interface BodyModel {
  readonly pack: AnatomyPack;
  readonly jointIds: readonly string[];
  readonly slots: readonly BodySlot[];
  readonly geometry: Readonly<Record<BodyLayer, BufferGeometry>>;
  /** Vagas de cada músculo do Atlas (os dois lados). */
  readonly byMuscle: ReadonlyMap<string, readonly number[]>;
  readonly byPart: ReadonlyMap<string, readonly number[]>;
  dispose(): void;
}

export function layerOf(p: AnatomyPart): BodyLayer {
  if (p.kind === 'skin') return 'skin';
  if (p.kind === 'bone' || p.kind === 'cartilage') return 'bone';
  return p.layer === 'superficial' ? 'superficial' : 'deep';
}

/** Normais por área, no lugar. */
function vertexNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
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
    const l = Math.hypot(n[i] ?? 0, n[i + 1] ?? 0, n[i + 2] ?? 0);
    // Área quase nula (membrana da virilha, anatomy/modesty.ts): normal indefinida viraria NaN no shader. Frente.
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

function boxOf(pos: Float32Array, sx: number): Box {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    const v = [sx * (pos[i] ?? 0), pos[i + 1] ?? 0, pos[i + 2] ?? 0];
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, v[k] ?? 0);
      hi[k] = Math.max(hi[k] ?? 0, v[k] ?? 0);
    }
  }
  const c = (k: number) => ((lo[k] ?? 0) + (hi[k] ?? 0)) / 2;
  const s = (k: number) => (hi[k] ?? 0) - (lo[k] ?? 0);
  return { center: [c(0), c(1), c(2)], size: [s(0), s(1), s(2)] };
}

export function mergeBoxes(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, (b.center[k] ?? 0) - (b.size[k] ?? 0) / 2);
      hi[k] = Math.max(hi[k] ?? 0, (b.center[k] ?? 0) + (b.size[k] ?? 0) / 2);
    }
  const c = (k: number) => ((lo[k] ?? 0) + (hi[k] ?? 0)) / 2;
  const s = (k: number) => (hi[k] ?? 0) - (lo[k] ?? 0);
  return { center: [c(0), c(1), c(2)], size: [s(0), s(1), s(2)] };
}

/** Juntas e pesos médios dos vértices em cada fatia da linha central (o caminho anda junto com a malha). */
function lineSkin(p: AnatomyPart, mirror: Uint8Array | null): BodySlot['line'] {
  const cl = p.centerline;
  if (!cl || !p.along) return undefined;
  const S = cl.length;
  const J = 32;
  const acc = new Float64Array(S * J);
  const n = p.along.length;
  for (let v = 0; v < n; v++) {
    const k = Math.min(S - 1, Math.floor((p.along[v] ?? 0) * S));
    for (let i = 0; i < 4; i++) {
      const j = p.joints[v * 4 + i] ?? 0;
      acc[k * J + j] = (acc[k * J + j] ?? 0) + (p.weights[v * 4 + i] ?? 0);
    }
  }
  const points = new Float32Array(S * 3);
  const joints = new Uint8Array(S * 4);
  const weights = new Float32Array(S * 4);
  const sx = mirror ? -1 : 1;
  let rest = 0;
  for (let k = 0; k < S; k++) {
    const q = cl[k] ?? [0, 0, 0];
    points.set([sx * q[0], q[1], q[2]], k * 3);
    if (k > 0) rest += Math.hypot((points[k * 3] ?? 0) - (points[k * 3 - 3] ?? 0), (points[k * 3 + 1] ?? 0) - (points[k * 3 - 2] ?? 0), (points[k * 3 + 2] ?? 0) - (points[k * 3 - 1] ?? 0));
    const order = Array.from({ length: J }, (_, j) => j).sort((a, b) => (acc[k * J + b] ?? 0) - (acc[k * J + a] ?? 0));
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += acc[k * J + (order[i] ?? 0)] ?? 0;
    for (let i = 0; i < 4; i++) {
      const j = order[i] ?? 0;
      joints[k * 4 + i] = mirror ? (mirror[j] ?? j) : j;
      weights[k * 4 + i] = sum > 0 ? (acc[k * J + j] ?? 0) / sum : i === 0 ? 1 : 0;
    }
  }
  return { points, joints, weights, rest };
}

interface Acc {
  pos: number[];
  nor: number[];
  ji: number[];
  jw: number[];
  slot: number[];
  along: number[];
  radial: number[];
  idx: number[];
}
const emptyAcc = (): Acc => ({ pos: [], nor: [], ji: [], jw: [], slot: [], along: [], radial: [], idx: [] });

export function buildBodyModel(pack: AnatomyPack, muscles: readonly MuscleDef[]): BodyModel {
  const owner = new Map<string, { muscleId: string; partId: string }>();
  for (const m of muscles) for (const p of m.parts) for (const id of p.mesh) owner.set(id, { muscleId: m.id, partId: p.id });

  const acc: Record<BodyLayer, Acc> = { bone: emptyAcc(), deep: emptyAcc(), superficial: emptyAcc(), skin: emptyAcc() };
  const slots: BodySlot[] = [];
  const byMuscle = new Map<string, number[]>();
  const byPart = new Map<string, number[]>();

  for (const part of pack.parts) {
    const layer = layerOf(part);
    const normals = vertexNormals(part.positions, part.indices);
    const copies: (Uint8Array | null)[] = part.mirror ? [null, pack.jointMirror] : [null];
    for (const mirror of copies) {
      const index = slots.length;
      const side = !part.mirror ? 'c' : mirror ? 'l' : 'r';
      const sx = mirror ? -1 : 1;
      const own = owner.get(part.id);
      const line = lineSkin(part, mirror);
      slots.push({
        index,
        anatomyId: part.id,
        side,
        kind: part.kind,
        layer,
        ...(own && { muscleId: own.muscleId, musclePartId: own.partId }),
        box: boxOf(part.positions, sx),
        ...(line && { line }),
      });
      if (own) {
        byMuscle.set(own.muscleId, [...(byMuscle.get(own.muscleId) ?? []), index]);
        byPart.set(own.partId, [...(byPart.get(own.partId) ?? []), index]);
      }
      const a = acc[layer];
      const base = a.pos.length / 3;
      const n = part.positions.length / 3;
      for (let v = 0; v < n; v++) {
        a.pos.push(sx * (part.positions[v * 3] ?? 0), part.positions[v * 3 + 1] ?? 0, part.positions[v * 3 + 2] ?? 0);
        a.nor.push(sx * (normals[v * 3] ?? 0), normals[v * 3 + 1] ?? 0, normals[v * 3 + 2] ?? 0);
        for (let k = 0; k < 4; k++) {
          const j = part.joints[v * 4 + k] ?? 0;
          a.ji.push(mirror ? (mirror[j] ?? j) : j);
          a.jw.push(part.weights[v * 4 + k] ?? 0);
        }
        a.slot.push(index);
        a.along.push(part.along?.[v] ?? 0);
        const r = part.radial;
        a.radial.push(sx * (r?.[v * 3] ?? 0), r?.[v * 3 + 1] ?? 0, r?.[v * 3 + 2] ?? 0);
      }
      const I = part.indices;
      for (let t = 0; t < I.length; t += 3) {
        const i0 = base + (I[t] ?? 0), i1 = base + (I[t + 1] ?? 0), i2 = base + (I[t + 2] ?? 0);
        // Espelho inverte a orientação: troca dois vértices.
        if (mirror) a.idx.push(i0, i2, i1);
        else a.idx.push(i0, i1, i2);
      }
    }
  }

  const geometry = Object.fromEntries(
    LAYERS.map((l) => {
      const a = acc[l];
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(a.pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(a.nor), 3));
      g.setAttribute('skinIndex', new BufferAttribute(new Uint8Array(a.ji), 4));
      g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(a.jw), 4));
      g.setAttribute('aSlot', new BufferAttribute(new Float32Array(a.slot), 1));
      if (l === 'deep' || l === 'superficial') {
        g.setAttribute('aAlong', new BufferAttribute(new Float32Array(a.along), 1));
        g.setAttribute('aRadial', new BufferAttribute(new Float32Array(a.radial), 3));
      }
      g.setIndex(new BufferAttribute(new Uint32Array(a.idx), 1));
      return [l, g];
    }),
  ) as Record<BodyLayer, BufferGeometry>;

  return {
    pack,
    jointIds: pack.joints.map((j) => j.id),
    slots,
    geometry,
    byMuscle,
    byPart,
    dispose: () => LAYERS.forEach((l) => geometry[l].dispose()),
  };
}

/** Caixa de um conjunto de vagas na pose de ligação. */
export const boxOfSlots = (model: BodyModel, idx: readonly number[]): Box | null => mergeBoxes(idx.flatMap((i) => model.slots[i]?.box ?? []));
