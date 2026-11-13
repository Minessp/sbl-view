/**
 * Figura do corpo atrás de uma interface só (`FigureModel`): o esquemático procedural (fusos +
 * ossos estilizados) ou a malha anatômica do BodyParts3D. Atlas e mapa de calor desenham qualquer um.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { bilateral, degToAngles } from '@/engine/kinematics/skeleton';
import { sampleCurve, spindleIndices, spindleUVs, vertexCount, writeSpindle, type SpindleFlat } from '@/engine/geometry/spindle';
import { must } from '@/engine/math/arr';
import type { Vec3 } from '@/engine/math/vec';
import { pathFlat, pathWorldPoints, type MusclePath } from '@/engine/muscle/paths';
import { atlasBody } from '@/features/atlas/model';
import { buildBones } from './bones';

export type FigureKind = 'muscle' | 'context' | 'bone' | 'skin';

export interface FigurePart {
  key: string;
  kind: FigureKind;
  muscleId?: string;
  /** Profundo: quando é o alvo, os demais viram fantasma para ele aparecer. */
  deep: boolean;
  geometry: BufferGeometry;
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  /** Desenhar também espelhado em X (lado esquerdo). */
  mirror: boolean;
  /** Tem UV de fibra (fuso). */
  fiber: boolean;
}

export interface Box {
  center: Vec3;
  size: Vec3;
}

export interface FigureModel {
  id: 'esquematico' | 'anatomico';
  parts: FigurePart[];
  /** Caixa do músculo (os dois lados), para enquadrar; null se o modelo não tem o músculo. */
  boxOf(muscleId: string): Box | null;
  dispose(): void;
}

export function boxOfPoints(points: Iterable<Vec3>): Box | null {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const p of points) {
    any = true;
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? Infinity, p[k] ?? 0);
      hi[k] = Math.max(hi[k] ?? -Infinity, p[k] ?? 0);
    }
  }
  if (!any) return null;
  return { center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

const LAYOUT = { rings: 30, sides: 12 } as const;
export const FIGURE_POSE = degToAngles(bilateral({ shoulder_abd: 13, elbow_flex: 8, hip_abd: 2.5 }));

function spindleGeometry(points: Vec3[], path: MusclePath, flat: SpindleFlat | null): BufferGeometry {
  const n = vertexCount(LAYOUT);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  writeSpindle(LAYOUT, points, path.radius, path.tendon, pos, nor, flat);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(spindleUVs(LAYOUT), 2));
  g.setIndex(new BufferAttribute(spindleIndices(LAYOUT), 1));
  g.computeBoundingSphere();
  return g;
}

let procedural: FigureModel | null = null;

/** Esquemático: memoizado (o esqueleto de referência e a pose não mudam). */
export function proceduralFigure(): FigureModel {
  if (procedural) return procedural;
  const { sk, paths } = atlasBody();
  const pose = forwardKinematics(sk, FIGURE_POSE);
  const points = new Map<string, Vec3[]>();
  const parts: FigurePart[] = paths.map((p) => {
    const pts = pathWorldPoints(pose, p);
    const list = points.get(p.muscleId) ?? [];
    list.push(...sampleCurve(pts, 9));
    points.set(p.muscleId, list);
    return { key: p.key, kind: 'muscle', muscleId: p.muscleId, deep: p.layer === 'deep', geometry: spindleGeometry(pts, p, pathFlat(pose, p)), mirror: false, fiber: true };
  });
  for (const [seg, g] of buildBones(sk)) {
    const tr = must(pose.world, seg, 'segmento');
    parts.push({
      key: `bone_${seg}`,
      kind: 'bone',
      deep: false,
      geometry: g,
      position: tr.position as [number, number, number],
      quaternion: tr.rotation as [number, number, number, number],
      mirror: false,
      fiber: false,
    });
  }
  procedural = {
    id: 'esquematico',
    parts,
    boxOf: (id) => boxOfPoints(points.get(id) ?? []),
    // Fica em cache pela vida da página: não descarta.
    dispose: () => undefined,
  };
  return procedural;
}
