/**
 * Migração de registros antigos. Usada na atualização do IndexedDB (Dexie `version(3)`) e na
 * importação de backup v1, para que os dois caminhos deem o mesmo plano.
 */
import { legacySplit } from '@/engine/planning/splits';
import type { Plan } from './types';

/** Plano da Fase 5 (sem `split`): a divisão sai do número de dias, como o gerador antigo fazia. Não mexe em `updatedAt`. */
export function migratePlan<T extends Omit<Plan, 'split'> & { split?: Plan['split'] }>(p: T): Plan {
  return p.split ? (p as Plan) : { ...p, split: legacySplit(p.days.length) };
}
