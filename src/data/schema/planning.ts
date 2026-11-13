import { z } from 'zod';
import { Evidence, sourced } from './evidence';

const Range = z.tuple([z.number().int().nonnegative(), z.number().int().positive()]).refine(([a, b]) => a < b, 'faixa invertida');
const Increments = z.object({ barra: z.number().positive(), halteres: z.number().positive(), maquina: z.number().positive(), polia: z.number().positive(), peso_corporal: z.literal(0) });

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
  rest: sourced(z.object({ composto: z.number().int().min(30).max(600), isolado: z.number().int().min(30).max(600) })),
  techniques: z.object({ lengthened_partials: Evidence, myo_reps: Evidence, drop: Evidence }),
  progression: sourced(z.object({ increment: z.object({ kg: Increments, lb: Increments }) })),
});
export type PlanningFile = z.infer<typeof PlanningFile>;

const Steps = z.array(z.object({ pct: z.number().gt(0).lt(1), reps: z.number().int().positive() })).min(1);
const PlateSet = z.object({ bar: z.number().positive(), plates: z.array(z.number().positive()).min(1) });

/** Parâmetros do tracker e da sessão ao vivo. */
export const TrainingFile = z.object({
  e1rm: z.object({ formula: z.literal('epley'), maxReps: sourced(z.number().int().min(1).max(20)) }),
  warmup: sourced(z.object({ composto: Steps, isolado: Steps })),
  plates: sourced(z.object({ kg: PlateSet, lb: PlateSet })),
  stagnation: sourced(
    z.object({ window: z.number().int().min(2).max(8), activeWeeks: z.number().int().min(1).max(12), minExercises: z.number().int().min(1), fraction: z.number().gt(0).max(1) }),
  ),
});
export type TrainingFile = z.infer<typeof TrainingFile>;
