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

export const SkeletonDef = z.object({
  stature: z.number().positive(),
  segments: z.array(SegmentDef).min(1),
});
export type SkeletonDef = z.infer<typeof SkeletonDef>;
