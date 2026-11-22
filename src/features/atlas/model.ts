/**
 * Curvas do Atlas: comprimento e braço de momento por ação (três planos), saídos do motor.
 * Sem three.js; memoizado (o esqueleto de referência não muda).
 */
import { skeletonDef } from '@/data';
import { musclePathDefs } from '@/data/paths';
import { baseAngles, baseAnglesDeg, sidedDof } from '@/data/movement';
import type { Movement, MuscleAction, MuscleDef } from '@/data/schema/muscle';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { EngineSkeleton } from '@/engine/kinematics/types';
import { sweepJoint } from '@/engine/muscle/momentArm';
import { buildMusclePaths, type MusclePath } from '@/engine/muscle/paths';
import { movementById, movements } from '@/features/library/catalog';
import { demoEnds } from './explorer/demo';

let cache: { sk: EngineSkeleton; paths: MusclePath[] } | null = null;
export function atlasBody() {
  if (!cache) {
    const sk = buildSkeleton(skeletonDef);
    cache = { sk, paths: buildMusclePaths(sk, musclePathDefs) };
  }
  return cache;
}

export interface ActionCurve {
  /** Identidade estável (ação + partes). */
  key: string;
  movement: Movement;
  /** Grau de liberdade do esqueleto que a curva mexe (`hip_flex_r`). */
  dof: string;
  /** Nome do sentido positivo do eixo x (ex.: "Flexão do quadril"). */
  axisLabel: string;
  range: readonly [number, number];
  /** Ponta alongada e encurtada da ação (graus do DOF): a demonstração vai de uma à outra. */
  from: number;
  to: number;
  /** Outros DOFs fixos (graus, com lado). */
  base: Readonly<Record<string, number>>;
  /** Fração do eixo x onde fica 0° (posição em pé). */
  neutralAt: number;
  x: number[];
  series: { partId: string; label: string; length: number[]; arm: number[] }[];
}

const N = 37;

/** A ação vale para a parte? (sem `parts` = músculo inteiro). */
export const actionHasPart = (a: MuscleAction, part: string | undefined): boolean => !part || !a.parts || a.parts.includes(part);

/**
 * Uma curva por ação que o modelo mede (movimento com DOF, sem `unmodeled`). Partes que não cruzam a articulação
 * ficam de fora; com `part`, só ela.
 */
export function actionCurves(m: MuscleDef, part?: string): ActionCurve[] {
  const { sk, paths } = atlasBody();
  const dofIds = new Set(sk.segments.flatMap((s) => s.dofs.map((d) => d.id)));
  const out: ActionCurve[] = [];
  for (const a of m.actions) {
    const mv = movementById(a.movement);
    if (!mv?.dof || !mv.sign || !mv.rangeDeg || a.unmodeled || !actionHasPart(a, part)) continue;
    const range = a.rangeDeg ?? mv.rangeDeg;
    const dof = sidedDof(mv.dof, dofIds);
    const base = baseAngles(mv, dofIds);
    const parts = paths.filter((p) => p.side === 'r' && p.muscleId === m.id && (!a.parts || a.parts.includes(p.partId)) && (!part || p.partId === part));
    const series = parts
      .map((p) => {
        const s = sweepJoint(sk, p, base, dof, range[0], range[1], N);
        return {
          partId: p.partId,
          label: m.parts.find((x) => x.id === p.partId)?.name ?? p.partId,
          length: s.length,
          arm: s.arm.map((r) => r * (mv.sign ?? 1)),
        };
      })
      .filter((s) => Math.max(...s.arm.map(Math.abs)) > 0.001);
    if (series.length === 0) continue;
    const pos = movements.find((x) => x.dof === mv.dof && x.sign === 1 && JSON.stringify(x.base ?? {}) === JSON.stringify(mv.base ?? {}));
    out.push({
      key: `${mv.id}-${series.map((s) => s.partId).join()}`,
      movement: mv,
      dof,
      axisLabel: pos?.label ?? mv.label,
      range,
      ...demoEnds(range, mv.sign),
      base: baseAnglesDeg(mv, dofIds),
      neutralAt: (0 - range[0]) / (range[1] - range[0]),
      x: Array.from({ length: N }, (_, i) => i / (N - 1)),
      series,
    });
  }
  return out;
}

/** Comprimento relativo a em pé (1 = em pé) na fração f do eixo da curva (primeira série). */
export function relLength(c: ActionCurve | undefined, f: number): number {
  const v = c?.series[0]?.length;
  if (!c || !v || v.length < 2) return 1;
  const x = Math.min(1, Math.max(0, f)) * (v.length - 1);
  const i = Math.min(v.length - 2, Math.floor(x));
  return 1 + ((v[i] ?? 0) + ((v[i + 1] ?? 0) - (v[i] ?? 0)) * (x - i));
}
