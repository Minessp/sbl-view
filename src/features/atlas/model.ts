/**
 * Curvas do Atlas: comprimento e braço de momento por ação sagital, saídos do motor.
 * Sem three.js; memoizado (o esqueleto de referência não muda).
 */
import { skeletonDef } from '@/data';
import { musclePathDefs } from '@/data/paths';
import type { Movement, MuscleDef } from '@/data/schema/muscle';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { EngineSkeleton } from '@/engine/kinematics/types';
import { sweepJoint } from '@/engine/muscle/momentArm';
import { buildMusclePaths, type MusclePath } from '@/engine/muscle/paths';
import { movementById, movements } from '@/features/library/catalog';

let cache: { sk: EngineSkeleton; paths: MusclePath[] } | null = null;
export function atlasBody() {
  if (!cache) {
    const sk = buildSkeleton(skeletonDef);
    cache = { sk, paths: buildMusclePaths(sk, musclePathDefs) };
  }
  return cache;
}

export interface ActionCurve {
  movement: Movement;
  /** Nome do sentido positivo do eixo x (ex.: "Flexão do quadril"). */
  axisLabel: string;
  range: readonly [number, number];
  /** Fração do eixo x onde fica 0° (posição em pé). */
  neutralAt: number;
  x: number[];
  series: { partId: string; label: string; length: number[]; arm: number[] }[];
}

const N = 37;

/** Uma curva por ação no plano sagital. Partes que não cruzam a articulação ficam de fora. */
export function actionCurves(m: MuscleDef): ActionCurve[] {
  const { sk, paths } = atlasBody();
  const dofIds = new Set(sk.segments.flatMap((s) => s.dofs.map((d) => d.id)));
  const out: ActionCurve[] = [];
  for (const a of m.actions) {
    const mv = movementById(a.movement);
    if (!mv?.dof || !mv.sign || !mv.rangeDeg) continue;
    const range = a.rangeDeg ?? mv.rangeDeg;
    const dof = dofIds.has(`${mv.dof}_r`) ? `${mv.dof}_r` : mv.dof;
    const parts = paths.filter((p) => p.side === 'r' && p.muscleId === m.id && (!a.parts || a.parts.includes(p.partId)));
    const series = parts
      .map((p) => {
        const s = sweepJoint(sk, p, {}, dof, range[0], range[1], N);
        return {
          partId: p.partId,
          label: m.parts.find((x) => x.id === p.partId)?.name ?? p.partId,
          length: s.length,
          arm: s.arm.map((r) => r * (mv.sign ?? 1)),
        };
      })
      .filter((s) => Math.max(...s.arm.map(Math.abs)) > 0.001);
    if (series.length === 0) continue;
    const pos = movements.find((x) => x.dof === mv.dof && x.sign === 1);
    out.push({
      movement: mv,
      axisLabel: pos?.label ?? mv.label,
      range,
      neutralAt: (0 - range[0]) / (range[1] - range[0]),
      x: Array.from({ length: N }, (_, i) => i / (N - 1)),
      series,
    });
  }
  return out;
}
