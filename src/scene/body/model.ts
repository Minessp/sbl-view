/**
 * Corpo anatômico único: o pacote SBL5 fundido em quatro geometrias (osso, profundo, superficial, pele).
 * Cada parte de cada lado vira uma "vaga" (slot) com índice próprio: o shader lê o estado dela numa textura
 * (destaque, opacidade, calor, ativação, oculto, volume) e o passe de seleção devolve o índice.
 * O lado esquerdo sai por espelho em X (juntas _r ↔ _l, triângulos com a ordem invertida).
 * Níveis de detalhe: o modelo nasce do pacote leve e troca só a geometria quando o nível escolhido chega
 * (`upgrade`); vagas, caixas e linhas centrais ficam as do primeiro pacote (comprimento e cor não saltam).
 */
import { BufferAttribute, BufferGeometry } from 'three';
import type { MuscleDef } from '@/data/schema/muscle';
import type { Vec3 } from '@/engine/math/vec';
import type { AnatomyKind, AnatomyLod, AnatomyPack, AnatomyPart } from '../anatomy/pack';
import { buildBodyGeometryData, LAYERS, layerOf, slotSignature, type BodyGeometryData, type BodyLayer } from './geometryData';

export { LAYERS, layerOf, type BodyGeometryData, type BodyLayer } from './geometryData';

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
  /** Primeiro pacote (metadados das partes, juntas, marcos). */
  readonly pack: AnatomyPack;
  readonly jointIds: readonly string[];
  readonly slots: readonly BodySlot[];
  /** Geometria do nível atual (troca em `upgrade`; as instâncias assinam com `subscribe`). */
  readonly geometry: Readonly<Record<BodyLayer, BufferGeometry>>;
  /** Nível da geometria atual. */
  readonly lod: AnatomyLod;
  /** Ordem e tipo das partes: outro nível só entra com a mesma assinatura. */
  readonly signature: string;
  /** Troca a malha por outro nível; avisa as instâncias e descarta a anterior. */
  upgrade(lod: AnatomyLod, data: BodyGeometryData): void;
  subscribe(f: () => void): () => void;
  /** Vagas de cada músculo do Atlas (os dois lados). */
  readonly byMuscle: ReadonlyMap<string, readonly number[]>;
  readonly byPart: ReadonlyMap<string, readonly number[]>;
  dispose(): void;
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

/** BufferGeometry das quatro camadas a partir dos arrays (sem cópia). */
export function bodyGeometry(data: BodyGeometryData): Record<BodyLayer, BufferGeometry> {
  return Object.fromEntries(
    LAYERS.map((l) => {
      const d = data[l];
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(d.position, 3));
      g.setAttribute('normal', new BufferAttribute(d.normal, 3));
      g.setAttribute('skinIndex', new BufferAttribute(d.skinIndex, 4));
      g.setAttribute('skinWeight', new BufferAttribute(d.skinWeight, 4, true));
      g.setAttribute('aSlot', new BufferAttribute(d.slot, 1));
      if (d.muscle && d.fiber && d.radial) {
        g.setAttribute('aMuscle', new BufferAttribute(d.muscle, 4, true));
        g.setAttribute('aFiber', new BufferAttribute(d.fiber, 4, true));
        g.setAttribute('aRadial', new BufferAttribute(d.radial, 3));
      }
      g.setIndex(new BufferAttribute(d.index, 1));
      return [l, g];
    }),
  ) as Record<BodyLayer, BufferGeometry>;
}

export function buildBodyModel(pack: AnatomyPack, muscles: readonly MuscleDef[]): BodyModel {
  const owner = new Map<string, { muscleId: string; partId: string }>();
  for (const m of muscles) for (const p of m.parts) for (const id of p.mesh) owner.set(id, { muscleId: m.id, partId: p.id });

  const slots: BodySlot[] = [];
  const byMuscle = new Map<string, number[]>();
  const byPart = new Map<string, number[]>();
  for (const part of pack.parts) {
    const layer = layerOf(part);
    const copies: (Uint8Array | null)[] = part.mirror ? [null, pack.jointMirror] : [null];
    for (const mirror of copies) {
      const index = slots.length;
      const side = !part.mirror ? 'c' : mirror ? 'l' : 'r';
      const own = owner.get(part.id);
      const line = lineSkin(part, mirror);
      slots.push({
        index,
        anatomyId: part.id,
        side,
        kind: part.kind,
        layer,
        ...(own && { muscleId: own.muscleId, musclePartId: own.partId }),
        box: boxOf(part.positions, mirror ? -1 : 1),
        ...(line && { line }),
      });
      if (own) {
        byMuscle.set(own.muscleId, [...(byMuscle.get(own.muscleId) ?? []), index]);
        byPart.set(own.partId, [...(byPart.get(own.partId) ?? []), index]);
      }
    }
  }

  let geometry = bodyGeometry(buildBodyGeometryData(pack));
  let lod = pack.lod;
  const listeners = new Set<() => void>();
  return {
    pack,
    jointIds: pack.joints.map((j) => j.id),
    slots,
    get geometry() {
      return geometry;
    },
    get lod() {
      return lod;
    },
    signature: slotSignature(pack),
    upgrade(next, data) {
      const old = geometry;
      geometry = bodyGeometry(data);
      lod = next;
      listeners.forEach((f) => f());
      LAYERS.forEach((l) => old[l].dispose());
    },
    subscribe(f) {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    byMuscle,
    byPart,
    dispose: () => LAYERS.forEach((l) => geometry[l].dispose()),
  };
}

/** Caixa de um conjunto de vagas na pose de ligação. */
export const boxOfSlots = (model: BodyModel, idx: readonly number[]): Box | null => mergeBoxes(idx.flatMap((i) => model.slots[i]?.box ?? []));
