import type { Entity, ImportReport } from './types';

/**
 * Mescla por id: entra o que não existe, substitui o que tem `updatedAt` maior, mantém o resto.
 * Lápides viajam como registros comuns, então apagar num aparelho apaga no outro.
 */
export function mergeById<T extends Entity>(local: readonly T[], incoming: readonly T[]): { put: T[]; report: ImportReport } {
  const have = new Map(local.map((x) => [x.id, x]));
  const put: T[] = [];
  const report: ImportReport = { added: 0, updated: 0, kept: 0 };
  for (const x of incoming) {
    const cur = have.get(x.id);
    if (!cur) {
      put.push(x);
      report.added++;
    } else if (x.updatedAt > cur.updatedAt) {
      put.push(x);
      report.updated++;
    } else report.kept++;
  }
  return { put, report };
}
