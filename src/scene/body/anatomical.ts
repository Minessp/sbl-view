/**
 * Malha anatômica (BodyParts3D, CC BY 4.0), gerada por `scripts/bp3d.mjs`.
 * Baixada só quando alguém escolhe o modelo anatômico; fica em cache na página.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import bp3d from '@/data/bodyparts3d.json';
import type { Vec3 } from '@/engine/math/vec';
import { boxOfPoints, type Box, type FigureKind, type FigureModel, type FigurePart } from './figure';

interface HeaderPart {
  key: string;
  kind: FigureKind;
  muscleId?: string;
  mirror: boolean;
  vertexCount: number;
  indexCount: number;
  index16: boolean;
  positions: number;
  indices: number;
}
interface Header {
  version: number;
  offset: Vec3;
  scale: Vec3;
  parts: HeaderPart[];
}

const DEEP: ReadonlySet<string> = new Set(bp3d.deep);
export const ANATOMICAL_URL = `${import.meta.env.BASE_URL}models/bp3d.bin`;

/** Lê o pacote. Exportado para teste. */
export function parseAnatomical(buf: ArrayBuffer): FigureModel {
  const dv = new DataView(buf);
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== 'SBL3' || dv.getUint32(4, true) !== 1) throw new Error('pacote anatômico inválido');
  const jsonLen = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, jsonLen))) as Header;
  const base = 12 + jsonLen;
  const [ox, oy, oz] = header.offset;
  const [sx, sy, sz] = header.scale;
  const boxes = new Map<string, Box>();

  const parts: FigurePart[] = header.parts.map((h) => {
    const q = new Int16Array(buf, base + h.positions, h.vertexCount * 3);
    const pos = new Float32Array(h.vertexCount * 3);
    for (let i = 0; i < h.vertexCount; i++) {
      pos[i * 3] = ox + ((q[i * 3] ?? 0) / 32767) * sx;
      pos[i * 3 + 1] = oy + ((q[i * 3 + 1] ?? 0) / 32767) * sy;
      pos[i * 3 + 2] = oz + ((q[i * 3 + 2] ?? 0) / 32767) * sz;
    }
    const idx = h.index16 ? new Uint16Array(buf, base + h.indices, h.indexCount) : new Uint32Array(buf, base + h.indices, h.indexCount);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setIndex(new BufferAttribute(idx.slice(), 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    if (h.muscleId && g.boundingBox) {
      const { min, max } = g.boundingBox;
      // Os dois lados: espelha em X.
      const pts: Vec3[] = [
        [min.x, min.y, min.z],
        [max.x, max.y, max.z],
      ];
      if (h.mirror) pts.push([-min.x, min.y, min.z], [-max.x, max.y, max.z]);
      const b = boxOfPoints(pts);
      if (b) boxes.set(h.muscleId, b);
    }
    return {
      key: h.key,
      kind: h.kind,
      ...(h.muscleId && { muscleId: h.muscleId }),
      deep: h.muscleId ? DEEP.has(h.muscleId) : false,
      geometry: g,
      mirror: h.mirror,
      fiber: false,
    };
  });

  return {
    id: 'anatomico',
    parts,
    boxOf: (id) => boxes.get(id) ?? null,
    dispose: () => undefined,
  };
}

let pending: Promise<FigureModel> | null = null;
export function loadAnatomical(): Promise<FigureModel> {
  pending ??= fetch(ANATOMICAL_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then(parseAnatomical)
    .catch((e: unknown) => {
      pending = null;
      throw e;
    });
  return pending;
}
