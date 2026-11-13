/**
 * Substitutos de um exercício: mesmos alvos, equipamento disponível. Pontuação (maior = melhor):
 * 2 × Jaccard dos grupos-alvo + Jaccard dos músculos-alvo + 0,3 se o tipo (composto/isolado) bate
 * + 0,2 se os dois carregam o alvo alongado. Precisa dividir ao menos um grupo-alvo.
 */
import { targetGroups } from './generate';
import type { CatalogEntry } from './types';

const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
};

const targetMuscles = (e: CatalogEntry) => new Set(e.targets.filter((t) => t.role === 'alvo').map((t) => t.muscle));

export const hasEquipment = (e: CatalogEntry, equipment: readonly string[]) => equipment.length === 0 || e.equipment.every((q) => equipment.includes(q));

export function substitutes(
  id: string,
  catalog: readonly CatalogEntry[],
  equipment: readonly string[] = [],
  exclude: readonly string[] = [],
  limit = 8,
): { id: string; score: number }[] {
  const base = catalog.find((e) => e.id === id);
  if (!base) return [];
  const bg = new Set(targetGroups(base));
  const bm = targetMuscles(base);
  const skip = new Set([id, ...exclude]);
  return catalog
    .filter((e) => !skip.has(e.id) && hasEquipment(e, equipment))
    .map((e) => {
      const g = jaccard(bg, new Set(targetGroups(e)));
      const score = g === 0 ? 0 : 2 * g + jaccard(bm, targetMuscles(e)) + (e.isolated === base.isolated ? 0.3 : 0) + (e.long && base.long ? 0.2 : 0);
      return { id: e.id, score: Math.round(score * 1000) / 1000 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
