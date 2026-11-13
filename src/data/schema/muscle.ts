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
  'rotator_cuff',
  'scapular',
]);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

/** Ponto do caminho: segmento ao qual está preso + posição na pose neutra (mundo, m, lado direito). */
export const PathPoint = z.object({ s: z.string(), p: Vec3 });
export type PathPoint = z.infer<typeof PathPoint>;

/**
 * Trecho do caminho do motor: id de uma malha do pacote (entra a linha central dela, da origem à inserção),
 * um ponto explícito com nota dizendo de onde saiu (o que a malha não tem: ligamento, tendão proximal, polia
 * óssea), ou parte da linha central de uma malha.
 */
export const PathRef = z.union([
  z.string().regex(/^[a-z0-9_]+$/),
  PathPoint.extend({ note: z.string().min(10) }),
  /** Só o trecho da linha central que cai nos segmentos dados (ex.: o tendão antes e depois do maléolo). */
  z.object({ mesh: z.string().regex(/^[a-z0-9_]+$/), only: z.array(z.string()).min(1) }),
]);
export type PathRef = z.infer<typeof PathRef>;

export const MusclePartDef = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
  /** Malhas do pacote anatômico (`anatomy.json`) que formam a parte: destaque, calor, seleção. */
  mesh: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1),
  /** Caminho do motor, encadeado. Ausente = linha central de `mesh[0]`. */
  path: z.array(PathRef).min(1).optional(),
  /**
   * Cilindro de contorno (eixo X do segmento) no trecho em que o caminho troca de segmento perto dele.
   * Corrige o atalho da polilinha por dentro do osso em flexão funda.
   */
  wrap: z
    .object({
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

/** `muscle-paths.json`, gerado por scripts/anatomy-pack.mjs: linha central de cada malha citada. */
export const MusclePathsFile = z.object({
  note: z.string(),
  parts: z.record(
    z.string(),
    z.object({
      ends: z.tuple([z.string(), z.string()]),
      layer: MuscleLayer,
      line: z.array(Vec3).length(16),
    }),
  ),
});
export type MusclePathsFile = z.infer<typeof MusclePathsFile>;
export const MovementFile = z.array(Movement);
