/**
 * Variações do Lab de comparação: cada uma é um botão com opções, e cada opção remenda o clipe do exercício
 * (`engine/motion/patch.ts`) antes de compilar. O teste dos dados compila toda opção com as mesmas regras dos clipes.
 */
import { z } from 'zod';
import { Evidence } from './evidence';

export const ClipPatch = z.object({
  path: z.string().min(1),
  op: z.enum(['set', 'add']),
  value: z.number(),
});

export const LabVariation = z.object({
  /** Exercício da biblioteca (id do clipe). */
  exercise: z.string().regex(/^[a-z_]+$/),
  id: z.string().regex(/^[a-z_]+$/),
  /** O que muda: pegada, inclinação do banco, altura da polia, posição dos pés. */
  kind: z.enum(['grip', 'incline', 'pulley', 'feet']),
  label: z.string(),
  options: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_]+$/),
        label: z.string(),
        /** Opção que reproduz o clipe da biblioteca (sem remendo). */
        base: z.boolean().optional(),
        patches: z.array(ClipPatch),
      }),
    )
    .min(2),
  /** O que a variação muda na mecânica, em uma frase (hipótese mecânica entra como tal). */
  text: z.string(),
  evidence: Evidence,
});
export type LabVariation = z.infer<typeof LabVariation>;
export const LabVariationFile = z.array(LabVariation);
