import { z } from 'zod';
import { sourced } from './evidence';

const Range = z.tuple([z.number().int().nonnegative(), z.number().int().positive()]).refine(([a, b]) => a < b, 'faixa invertida');

/** Parâmetros do planejador. Todo número com fonte e confiança. */
export const PlanningFile = z.object({
  volume: z.object({ priorizar: sourced(Range), manter: sourced(Range) }),
  defaultSets: sourced(z.object({ priorizar: z.number().int().positive(), manter: z.number().int().positive() })),
  frequency: sourced(z.number().int().min(1).max(3)),
  maxSetsPerSession: sourced(z.number().int().min(2).max(12)),
  maxSetsPerSlot: sourced(z.number().int().min(1).max(8)),
  reps: sourced(z.object({ composto: Range, isolado: Range })),
  mesocycle: sourced(
    z.object({
      rirStart: z.number().int().min(0).max(5),
      rirEnd: z.number().int().min(0).max(5),
      deloadSetsFactor: z.number().gt(0).max(1),
      deloadRir: z.number().int().min(0).max(6),
    }),
  ),
  preferLong: sourced(z.boolean()),
});
export type PlanningFile = z.infer<typeof PlanningFile>;
