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

export const MovementPattern = z.enum(['agachamento', 'dobradica', 'empurrar_horizontal', 'empurrar_vertical', 'puxar_horizontal', 'puxar_vertical', 'isolado']);
export type MovementPattern = z.infer<typeof MovementPattern>;

export const Equipment = z.enum(['barra', 'halteres', 'maquina', 'polia', 'banco', 'rack', 'peso_corporal']);
export type Equipment = z.infer<typeof Equipment>;

/** Onde a carga pega o músculo-alvo: alongado, na faixa média ou encurtado. */
export const LengthEmphasis = z.enum(['alongado', 'intermediario', 'encurtado']);
export type LengthEmphasis = z.infer<typeof LengthEmphasis>;

/** Exercício da biblioteca. Os que têm `labId` também têm solver e variações no Lab. */
export const LibraryExercise = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
  pattern: MovementPattern,
  equipment: z.array(Equipment).min(1),
  /** hipotese = a razão de escolher o exercício ainda não foi testada direito. */
  status: z.enum(['consolidado', 'hipotese']),
  labId: z.string().optional(),
  summary: z.string(),
  targets: z
    .array(z.object({ muscle: z.string(), role: z.enum(['alvo', 'sinergista']), parts: z.array(z.string()).optional() }))
    .min(1),
  length: Evidence.extend({ emphasis: LengthEmphasis, text: z.string() }),
});
export type LibraryExercise = z.infer<typeof LibraryExercise>;
export const LibraryFile = z.array(LibraryExercise);

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
