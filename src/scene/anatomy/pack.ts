/**
 * Leitor do pacote anatômico SBL5 (ver scripts/sbl5.mjs e scripts/anatomy-pack.mjs).
 * Sem three.js: devolve arrays prontos para virar geometria (runtime) ou para teste.
 */
import type { Vec3 } from '@/engine/math/vec';

export type AnatomyKind = 'bone' | 'cartilage' | 'muscle' | 'tendon' | 'skin';
export type AnatomyLod = 'hi' | 'lo';

export interface PackJoint {
  readonly id: string;
  readonly parent: string | null;
  /** Posição neutra (mundo) da articulação proximal: a pose de ligação da malha. */
  readonly origin: Vec3;
}

interface HeaderPart {
  id: string;
  kind: AnatomyKind;
  mirror: boolean;
  objects: string[];
  segment?: string;
  layer?: 'superficial' | 'deep';
  skinDepth?: number;
  ends?: [string, string];
  centerline?: Vec3[];
  section?: number[];
  rmax?: number;
  vertexCount: number;
  indexCount: number;
  positions: number;
  positionsBytes: number;
  indices: number;
  indicesBytes: number;
  skin: number;
  skinBytes: number;
  attr?: number;
  attrBytes?: number;
}

interface Header {
  format: 'SBL5';
  version: number;
  lod: AnatomyLod;
  stature: number;
  source: { refId: string; commit: string; file: string; note: string };
  joints: PackJoint[];
  landmarks: Record<string, Vec3>;
  offset: Vec3;
  scale: Vec3;
  parts: HeaderPart[];
}

export interface AnatomyPart {
  readonly id: string;
  readonly kind: AnatomyKind;
  /** Lado direito (ou linha média) armazenado; `mirror` = gerar o esquerdo por espelho em X. */
  readonly mirror: boolean;
  /** Nomes dos objetos do Z-Anatomy de onde a parte saiu. */
  readonly objects: readonly string[];
  /** Osso: segmento do esqueleto em que é rígido. */
  readonly segment?: string;
  /** Músculo e tendão: superficial se é a primeira camada mole sob a pele em algum trecho. */
  readonly layer?: 'superficial' | 'deep';
  /** Mediana da distância dos vértices à pele, mm. */
  readonly skinDepth?: number;
  /** Segmento da origem e da inserção (músculo, tendão). */
  readonly ends?: readonly [string, string];
  /** Linha central na pose neutra, da origem à inserção (m). */
  readonly centerline?: readonly Vec3[];
  /** Raio médio por fatia da linha central (m): ventre largo, tendão fino. */
  readonly section?: readonly number[];
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  /** 4 juntas por vértice (índices em `AnatomyPack.joints`). */
  readonly joints: Uint8Array;
  /** 4 pesos por vértice, somam 1. */
  readonly weights: Float32Array;
  /** Músculo e tendão: posição ao longo da linha central (0 = origem, 1 = inserção). */
  readonly along?: Float32Array;
  /** Músculo e tendão: vetor da linha central ao vértice (m), 3 por vértice. */
  readonly radial?: Float32Array;
}

export interface AnatomyPack {
  readonly lod: AnatomyLod;
  readonly stature: number;
  readonly source: Header['source'];
  readonly joints: readonly PackJoint[];
  /** Índice da junta espelhada (_r ↔ _l; central aponta para si). */
  readonly jointMirror: Uint8Array;
  /** Marcos articulares medidos na malha (lado direito). */
  readonly landmarks: Readonly<Record<string, Vec3>>;
  readonly parts: readonly AnatomyPart[];
}

export const anatomyUrl = (lod: AnatomyLod) => `${import.meta.env.BASE_URL}models/anatomy-${lod}.bin`;

const mirrorJointId = (id: string) => (id.endsWith('_r') ? id.replace(/_r$/, '_l') : id.endsWith('_l') ? id.replace(/_l$/, '_r') : id);

export async function parseAnatomyPack(buf: ArrayBuffer): Promise<AnatomyPack> {
  const { MeshoptDecoder } = await import('meshoptimizer/decoder');
  await MeshoptDecoder.ready;
  const dv = new DataView(buf);
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== 'SBL5' || dv.getUint32(4, true) !== 1) throw new Error('pacote anatômico inválido');
  const jsonLen = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, jsonLen))) as Header;
  const base = 12 + jsonLen;
  const [ox, oy, oz] = header.offset;
  const [sx, sy, sz] = header.scale;
  const block = (at: number, bytes: number) => new Uint8Array(buf, base + at, bytes);

  const parts: AnatomyPart[] = header.parts.map((h) => {
    const n = h.vertexCount;
    const q = new Int16Array(n * 4);
    MeshoptDecoder.decodeVertexBuffer(new Uint8Array(q.buffer), n, 8, block(h.positions, h.positionsBytes));
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = ox + ((q[i * 4] ?? 0) / 32767) * sx;
      positions[i * 3 + 1] = oy + ((q[i * 4 + 1] ?? 0) / 32767) * sy;
      positions[i * 3 + 2] = oz + ((q[i * 4 + 2] ?? 0) / 32767) * sz;
      // A quantização tira o x exato de 0: devolve a linha média, para a cópia espelhada encostar.
      if (h.mirror && Math.abs(positions[i * 3] ?? 1) < 3e-5) positions[i * 3] = 0;
    }
    const indices = new Uint32Array(h.indexCount);
    MeshoptDecoder.decodeIndexBuffer(new Uint8Array(indices.buffer), h.indexCount, 4, block(h.indices, h.indicesBytes));
    const sk = new Uint8Array(n * 8);
    MeshoptDecoder.decodeVertexBuffer(sk, n, 8, block(h.skin, h.skinBytes));
    const joints = new Uint8Array(n * 4);
    const weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        joints[i * 4 + k] = sk[i * 8 + k] ?? 0;
        weights[i * 4 + k] = (sk[i * 8 + 4 + k] ?? 0) / 255;
      }
    }
    let along: Float32Array | undefined;
    let radial: Float32Array | undefined;
    if (h.attr !== undefined && h.attrBytes !== undefined) {
      const raw = new Uint8Array(n * 4);
      MeshoptDecoder.decodeVertexBuffer(raw, n, 4, block(h.attr, h.attrBytes));
      const i8 = new Int8Array(raw.buffer);
      const rmax = h.rmax ?? 0;
      along = new Float32Array(n);
      radial = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        along[i] = (raw[i * 4] ?? 0) / 255;
        for (let k = 0; k < 3; k++) radial[i * 3 + k] = ((i8[i * 4 + 1 + k] ?? 0) / 127) * rmax;
      }
    }
    return {
      id: h.id,
      kind: h.kind,
      mirror: h.mirror,
      objects: h.objects,
      ...(h.segment !== undefined && { segment: h.segment }),
      ...(h.layer !== undefined && { layer: h.layer }),
      ...(h.skinDepth !== undefined && { skinDepth: h.skinDepth }),
      ...(h.ends && { ends: h.ends }),
      ...(h.centerline && { centerline: h.centerline }),
      ...(h.section && { section: h.section }),
      positions,
      indices,
      joints,
      weights,
      ...(along && { along }),
      ...(radial && { radial }),
    };
  });

  const index = new Map(header.joints.map((j, i) => [j.id, i]));
  const jointMirror = Uint8Array.from(header.joints, (j, i) => index.get(mirrorJointId(j.id)) ?? i);
  return {
    lod: header.lod,
    stature: header.stature,
    source: header.source,
    joints: header.joints,
    jointMirror,
    landmarks: header.landmarks,
    parts,
  };
}

const pending = new Map<AnatomyLod, Promise<AnatomyPack>>();
/** Baixa sob demanda (fora do precache do PWA) e guarda na página. */
export function loadAnatomyPack(lod: AnatomyLod): Promise<AnatomyPack> {
  let p = pending.get(lod);
  if (!p) {
    p = fetch(anatomyUrl(lod))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(parseAnatomyPack)
      .catch((e: unknown) => {
        pending.delete(lod);
        throw e;
      });
    pending.set(lod, p);
  }
  return p;
}
