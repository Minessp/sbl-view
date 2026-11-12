import { z } from 'zod';
import { Evidence } from './evidence';

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const MuscleLayer = z.enum(['superficial', 'deep']);
export type MuscleLayer = z.infer<typeof MuscleLayer>;

export const MuscleGroup = z.enum([
  'quadriceps',
  'hamstrings',
  'gluteals',
  'adductors',
  'hip_flexors',
  'triceps_surae',
  'shin',
  'abdominals',
  'spinal_erectors',
  'lats',
  'traps',
  'chest',
  'delts',
  'elbow_flexors',
  'elbow_extensors',
  'forearm',
  'neck',
]);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

/** Ponto do caminho: segmento ao qual está preso + posição na pose neutra (mundo, m, lado direito). */
export const PathPoint = z.object({ s: z.string(), p: Vec3 });
export type PathPoint = z.infer<typeof PathPoint>;

export const MusclePartDef = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
  layer: MuscleLayer,
  /** origem → passagens → inserção. */
  path: z.array(PathPoint).min(2),
  /** Raio do ventre no desenho (m). Ilustrativo. */
  radius: z.number().positive(),
  /** Fração do caminho que é tendão em cada ponta [proximal, distal]. Ilustrativo. */
  tendon: z.tuple([z.number().min(0).max(0.6), z.number().min(0).max(0.6)]),
  pathEvidence: Evidence,
});
export type MusclePartDef = z.infer<typeof MusclePartDef>;

export const MuscleDef = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  latin: z.string(),
  name: z.string(),
  group: MuscleGroup,
  parts: z.array(MusclePartDef).min(1),
});
export type MuscleDef = z.infer<typeof MuscleDef>;

export const MuscleFile = z.array(MuscleDef);
