/**
 * Comprimento dos músculos-alvo ao longo do clipe (% em relação a em pé), pelo mesmo caminho do Atlas. Sem three.js.
 */
import { musclePathDefs } from '@/data/paths';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { evaluateClip, type CompiledClip } from '@/engine/motion/evaluate';
import { buildMusclePaths, mtuLength } from '@/engine/muscle/paths';
import { STANDING } from '@/scene/body/poses';

export interface LengthCurves {
  readonly x: readonly number[];
  readonly series: readonly {
    readonly id: string;
    readonly values: readonly number[];
  }[];
}

const N = 25;

/** Média das partes do lado direito de cada músculo; só músculos com caminho no modelo. */
export function lengthCurves(c: CompiledClip, muscles: readonly string[]): LengthCurves {
  const paths = buildMusclePaths(c.sk, musclePathDefs).filter((p) => p.side === 'r' && muscles.includes(p.muscleId));
  const stand = forwardKinematics(c.sk, STANDING);
  const rest = new Map(paths.map((p) => [p.key, mtuLength(stand, p)]));
  const x = Array.from({ length: N }, (_, i) => i / (N - 1));
  const poses = x.map((u) => evaluateClip(c, u).pose);
  const series = muscles
    .map((id) => {
      const parts = paths.filter((p) => p.muscleId === id);
      if (!parts.length) return null;
      const values = poses.map((pose) => {
        let s = 0;
        for (const p of parts) s += mtuLength(pose, p) / (rest.get(p.key) ?? 1) - 1;
        return (s / parts.length) * 100;
      });
      return { id, values };
    })
    .filter((s): s is { id: string; values: number[] } => s !== null);
  return { x, series };
}

/** Valor da curva em u (interpolação linear entre amostras). */
export function valueAt(x: readonly number[], v: readonly number[], u: number): number {
  const n = x.length;
  const f = Math.min(n - 1, Math.max(0, u * (n - 1)));
  const i = Math.min(n - 2, Math.floor(f));
  const a = v[i] ?? 0,
    b = v[i + 1] ?? a;
  return a + (b - a) * (f - i);
}
