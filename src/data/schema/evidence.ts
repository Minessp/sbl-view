import { z } from 'zod';

export const Confidence = z.enum(['estabelecido', 'provavel', 'especulativo']);
export type Confidence = z.infer<typeof Confidence>;

export const SourceRef = z.object({
  /** Chave em references.json. */
  refId: z.string().min(1),
  /** Tabela, figura ou página. */
  locator: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** Metadado de evidência que acompanha todo número ou afirmação do banco. */
export const Evidence = z.object({
  source: z.array(SourceRef).min(1),
  confidence: Confidence,
  note: z.string().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const sourced = <T extends z.ZodType>(value: T) => Evidence.extend({ value });

export const Reference = z.object({
  id: z.string().min(1),
  /** Citação legível (autores, ano, título, veículo). */
  citation: z.string().min(1),
  doi: z.string().optional(),
  url: z.url().optional(),
  /** false = não conferido em fonte primária. A UI exibe "[a verificar]". */
  verified: z.boolean(),
  /** Licença, quando a referência também é fonte de asset ou dado redistribuído. */
  license: z.string().optional(),
  note: z.string().optional(),
});
export type Reference = z.infer<typeof Reference>;
