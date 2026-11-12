/** Derivados para gráficos e leituras (puros). */
import type { SquatFrame } from '@/engine/exercises/squat';
import { at } from '@/engine/math/arr';
import type { VariantSeries } from './model';

export interface Effort {
  knee: number[];
  hip: number[];
}

/** Demanda ÷ capacidade relativa, sem normalizar. */
export function rawEffort(s: VariantSeries): Effort {
  return {
    knee: s.frames.map((f, i) => Math.max(0, f.demand.knee.moment) / at(s.capacity.knee, i)),
    hip: s.frames.map((f, i) => Math.max(0, f.demand.hip.moment) / at(s.capacity.hip, i)),
  };
}

export function effortRefs(all: readonly VariantSeries[]): { knee: number; hip: number; ankle: number } {
  let knee = 1e-6, hip = 1e-6, ankle = 1e-6;
  for (const s of all) {
    const e = rawEffort(s);
    knee = Math.max(knee, ...e.knee);
    hip = Math.max(hip, ...e.hip);
    ankle = Math.max(ankle, ...s.frames.map((f) => f.demand.ankle.moment));
  }
  return { knee, hip, ankle };
}

/** Quadro interpolado linearmente em u (para leituras numéricas no cursor). */
export function sampleAt(frames: readonly SquatFrame[], u: number) {
  const n = frames.length - 1;
  const x = Math.min(n, Math.max(0, u * n));
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const a = at(frames, i), b = at(frames, i + 1);
  const L = (p: number, q: number) => p + (q - p) * f;
  return {
    knee: L(a.angles.knee, b.angles.knee),
    hip: L(a.angles.hip, b.angles.hip),
    ankle: L(a.angles.ankle, b.angles.ankle),
    trunk: L(a.angles.trunk, b.angles.trunk),
    lumbar: L(a.angles.lumbar, b.angles.lumbar),
    hipM: L(a.demand.hip.moment, b.demand.hip.moment),
    kneeM: L(a.demand.knee.moment, b.demand.knee.moment),
    ankleM: L(a.demand.ankle.moment, b.demand.ankle.moment),
    hipArm: L(a.demand.hip.arm, b.demand.hip.arm),
    kneeArm: L(a.demand.knee.arm, b.demand.knee.arm),
    balanced: a.balanced && b.balanced,
  };
}
