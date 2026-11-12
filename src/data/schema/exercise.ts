import { z } from 'zod';
import { Evidence } from './evidence';

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

/** Trajetória por quadros-chave de ângulos (graus) em t ∈ [0,1]. */
export const KeyTrajectory = z.object({
  kind: z.literal('keys'),
  tracks: z.array(z.object({ dof: z.string(), keys: z.array(z.object({ t: z.number(), deg: z.number() })).min(2) })),
  evidence: Evidence,
});

/**
 * Agachamento resolvido pelo motor: joelho e tornozelo seguem a profundidade; a inclinação do tronco
 * sai da condição de equilíbrio estático (centro de massa do sistema sobre o meio do pé).
 */
export const SquatTrajectory = z.object({
  kind: z.literal('squat'),
  depthDeg: z.number().min(30).max(155),
  ankleMaxDeg: z.number().min(0).max(45),
  heelWedgeDeg: z.number().min(0).max(25),
  evidence: Evidence,
});

export const Trajectory = z.discriminatedUnion('kind', [KeyTrajectory, SquatTrajectory]);
export type Trajectory = z.infer<typeof Trajectory>;

export const Resistance = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gravity'), segment: z.string(), point: Vec3, evidence: Evidence }),
  z.object({ kind: z.literal('cable'), segment: z.string(), point: Vec3, pulley: Vec3, evidence: Evidence }),
]);
export type Resistance = z.infer<typeof Resistance>;

export const ExerciseVariant = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  label: z.string(),
  short: z.string(),
  trajectory: Trajectory,
  resistance: Resistance,
  /** Pose fixa dos braços etc. (graus, nomes de DOF sem lado → aplicados aos dois lados). */
  holdDeg: z.record(z.string(), z.number()),
  rationale: Evidence.extend({ text: z.string() }),
});
export type ExerciseVariant = z.infer<typeof ExerciseVariant>;

export const Exercise = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
  status: z.enum(['consolidado', 'hipotese']),
  equipment: z.array(z.string()),
  targets: z.array(z.object({ group: z.string(), role: z.enum(['alvo', 'sinergista']) })),
  variants: z.array(ExerciseVariant).min(1),
});
export type Exercise = z.infer<typeof Exercise>;

export const CapacityCurve = z.object({
  joint: z.enum(['hip', 'knee', 'ankle']),
  dof: z.string(),
  label: z.string(),
  peakDeg: z.number(),
  widthDeg: z.number().positive(),
  floor: z.number().min(0).max(1),
  evidence: Evidence,
});
export type CapacityCurve = z.infer<typeof CapacityCurve>;
