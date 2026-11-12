/**
 * Acesso tipado aos dados. Sem Zod em runtime: a validação roda em `data.test.ts` (CI),
 * então o cast abaixo é seguro enquanto os testes passam.
 */
import musclesJson from './muscles.json';
import referencesJson from './references.json';
import skeletonJson from './skeleton.json';
import type { Reference } from './schema/evidence';
import type { MuscleDef } from './schema/muscle';
import type { SkeletonDef } from './schema/skeleton';

export const skeletonDef = skeletonJson as unknown as SkeletonDef;
export const muscleDefs = musclesJson as unknown as MuscleDef[];
export const references = referencesJson as unknown as Reference[];

const refIndex = new Map(references.map((r) => [r.id, r]));
export const getReference = (id: string): Reference | undefined => refIndex.get(id);

export type { Reference, MuscleDef, SkeletonDef };
