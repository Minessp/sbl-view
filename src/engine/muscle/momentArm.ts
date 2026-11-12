/**
 * Braço de momento pelo método da excursão do tendão: r = −dL/dθ.
 * Positivo = o músculo, ao encurtar, gira a articulação no sentido positivo do DOF
 * (flexão, abdução, dorsiflexão…). Estimativa do modelo geométrico, não medição.
 */
import { DEG } from '../math/vec';
import { forwardKinematics } from '../kinematics/fk';
import type { Angles, EngineSkeleton } from '../kinematics/types';
import { mtuLength, type MusclePath } from './paths';

/** Comprimento músculo-tendão (m) na pose dada por ângulos (rad). */
export function lengthAt(sk: EngineSkeleton, path: MusclePath, angles: Angles): number {
  return mtuLength(forwardKinematics(sk, angles), path);
}

function dofLimits(sk: EngineSkeleton, dofId: string): { min: number; max: number } {
  for (const s of sk.segments) for (const d of s.dofs) if (d.id === dofId) return { min: d.min, max: d.max };
  throw new Error(`DOF desconhecido: ${dofId}`);
}

/**
 * Braço de momento (m) em torno de `dofId`, no ângulo `deg`, com os outros DOFs em `base`.
 * Diferença central de ±h; vira unilateral na borda da amplitude (o FK limita os ângulos).
 */
export function momentArm(sk: EngineSkeleton, path: MusclePath, base: Angles, dofId: string, deg: number, hDeg = 0.5): number {
  const { min, max } = dofLimits(sk, dofId);
  const th = deg * DEG;
  const h = hDeg * DEG;
  const a = Math.max(min, th - h);
  const b = Math.min(max, th + h);
  if (b - a < 1e-9) return 0;
  const La = lengthAt(sk, path, { ...base, [dofId]: a });
  const Lb = lengthAt(sk, path, { ...base, [dofId]: b });
  return -(Lb - La) / (b - a);
}

export interface JointSweep {
  /** Ângulos amostrados (graus). */
  readonly deg: number[];
  /** Comprimento relativo à pose de referência: L/L₀ − 1. */
  readonly length: number[];
  /** Braço de momento (m), mesmo sinal do DOF. */
  readonly arm: number[];
}

/** Varre um DOF de `fromDeg` a `toDeg` em `n` passos. L₀ = comprimento em `base` (pose de referência). */
export function sweepJoint(
  sk: EngineSkeleton,
  path: MusclePath,
  base: Angles,
  dofId: string,
  fromDeg: number,
  toDeg: number,
  n = 41,
): JointSweep {
  const L0 = lengthAt(sk, path, base);
  const deg: number[] = [];
  const length: number[] = [];
  const arm: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = fromDeg + ((toDeg - fromDeg) * i) / (n - 1);
    deg.push(d);
    length.push(lengthAt(sk, path, { ...base, [dofId]: d * DEG }) / L0 - 1);
    arm.push(momentArm(sk, path, base, dofId, d));
  }
  return { deg, length, arm };
}
