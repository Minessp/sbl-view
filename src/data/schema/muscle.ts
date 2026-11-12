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
  /**
   * Seção achatada para músculo largo. face = para onde a face larga aponta (pose neutra, lado
   * direito); width/thickness multiplicam o raio. Só desenho: não entra em cálculo.
   */
  shape: z
    .object({
      face: Vec3.refine((v) => Math.hypot(...v) > 0.1, 'face nula'),
      width: z.number().min(1).max(3),
      thickness: z.number().min(0.2).max(1),
    })
    .optional(),
  /** Cilindro de contorno (eixo X do segmento) entre path[span] e path[span+1]. */
  wrap: z
    .object({
      span: z.number().int().min(0),
      segment: z.string(),
      center: Vec3,
      radius: z.number().positive(),
      /** Lado por onde a linha contorna, no frame do segmento (pose neutra). */
      side: Vec3,
      evidence: Evidence,
    })
    .optional(),
});
export type MusclePartDef = z.infer<typeof MusclePartDef>;

export const Joint = z.enum(['hip', 'knee', 'ankle', 'trunk', 'neck', 'scapula', 'shoulder', 'elbow', 'forearm', 'wrist']);
export type Joint = z.infer<typeof Joint>;

const DegRange = z.tuple([z.number(), z.number()]).refine(([a, b]) => a < b, 'faixa invertida');

/**
 * Movimento articular nomeado. Só os do plano sagital têm `dof`: é onde o modelo geométrico
 * (contornos com eixo transversal) dá braço de momento utilizável.
 */
export const Movement = z
  .object({
    id: z.string().regex(/^[a-z_]+$/),
    label: z.string(),
    joint: Joint,
    plane: z.enum(['sagital', 'frontal', 'transversal']),
    /** DOF do esqueleto sem sufixo de lado (`hip_flex`). */
    dof: z.string().optional(),
    /** +1 = sentido positivo do DOF; −1 = oposto (extensão, flexão plantar…). */
    sign: z.union([z.literal(1), z.literal(-1)]).optional(),
    /**
     * Faixa (graus do DOF) onde o teste confere o sinal do braço de momento do modelo
     * e onde o Atlas desenha as curvas. Fora dela o modelo não é mostrado.
     */
    rangeDeg: DegRange.optional(),
  })
  .refine((m) => (m.dof === undefined) === (m.sign === undefined) && (m.dof === undefined) === (m.rangeDeg === undefined), 'dof, sign e rangeDeg andam juntos')
  .refine((m) => m.dof === undefined || m.plane === 'sagital', 'só movimento sagital tem dof');
export type Movement = z.infer<typeof Movement>;

export const MuscleAction = z.object({
  movement: z.string(),
  role: z.enum(['principal', 'secundaria']),
  /** Restringe a ação a partes do músculo (ex.: deltoide anterior). Ausente = todas. */
  parts: z.array(z.string()).optional(),
  /** Estreita a faixa do movimento (ação que inverte com o ângulo, ou limite do modelo). */
  rangeDeg: DegRange.optional(),
  evidence: Evidence,
});
export type MuscleAction = z.infer<typeof MuscleAction>;

export const MuscleDef = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  latin: z.string(),
  name: z.string(),
  group: MuscleGroup,
  origin: z.string(),
  insertion: z.string(),
  /** Fonte de origem e inserção. */
  anatomy: Evidence,
  actions: z.array(MuscleAction).min(1),
  parts: z.array(MusclePartDef).min(1),
});
export type MuscleDef = z.infer<typeof MuscleDef>;

export const MuscleFile = z.array(MuscleDef);
export const MovementFile = z.array(Movement);
