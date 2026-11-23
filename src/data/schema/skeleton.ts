import { z } from 'zod';
import { Evidence } from './evidence';

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const DofDef = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  /** Nome do movimento positivo (chave i18n). */
  positive: z.string(),
  axis: z.enum(['x', 'y', 'z']),
  sign: z.union([z.literal(1), z.literal(-1)]),
  /** Amplitude em graus [mín, máx]. */
  romDeg: z.tuple([z.number(), z.number()]),
  rom: Evidence,
});
export type DofDef = z.infer<typeof DofDef>;

export const SegmentDef = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  parent: z.string().nullable(),
  /** Posição neutra (mundo, m) da articulação proximal. Lado direito quando bilateral. */
  origin: Vec3,
  /** Extremidade distal, mundo neutro (m). */
  tip: Vec3,
  /** Gera cópia espelhada (_r → _l). */
  bilateral: z.boolean(),
  joint: z.string().nullable(),
  dofs: z.array(DofDef),
  geometry: Evidence,
});
export type SegmentDef = z.infer<typeof SegmentDef>;

/** Mão que fecha (`engine/kinematics/grip.ts`): quadro e centros articulares na ligação, lado direito (m). */
export const HandDef = z.object({
  /** Punho → ponta do 3º dedo. */
  axis: Vec3,
  /** Normal da palma (lado da flexão). */
  palm: Vec3,
  /** Centro de cada junta, um por dedo: indicador, médio, anelar, mínimo. */
  mcp: z.array(Vec3).length(4),
  pip: z.array(Vec3).length(4),
  dip: z.array(Vec3).length(4),
  /** Polegar: base do 1º metacarpo, ponta da falange distal e eixo da oposição. */
  thumb: z.object({ base: Vec3, tip: Vec3, axis: Vec3 }),
  evidence: Evidence,
});
export type HandDef = z.infer<typeof HandDef>;

export const SkeletonDef = z.object({
  stature: z.number().positive(),
  segments: z.array(SegmentDef).min(1),
  hand: HandDef.optional(),
});
export type SkeletonDef = z.infer<typeof SkeletonDef>;

/**
 * Volumes para o teste de atravessamento (`engine/motion/collide.ts`): cápsula por segmento do lado direito (o esquerdo
 * espelha), do ponto `ends[0]` ao `ends[1]` da reta articulação → ponta (0 e 1 = as pontas; padrão [0, 1]).
 */
export const BodyVolumes = z.object({
  evidence: Evidence,
  segments: z.record(z.string().regex(/^[a-z]+(_r)?$/), z.object({ radius: z.number().positive(), ends: z.tuple([z.number(), z.number()]).optional() })),
});
export type BodyVolumes = z.infer<typeof BodyVolumes>;
