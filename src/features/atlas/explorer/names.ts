/** Nome, nomenclatura e tipo de uma estrutura do explorador (músculo do Atlas ou parte do pacote). */
import { muscleDefs } from '@/data';
import type { MuscleDef } from '@/data/schema/muscle';
import { t } from '@/i18n/app';
import { muscleById } from '@/features/library/catalog';
import type { Pick, StructureInfo } from '../store';

export interface Described {
  readonly pick: Pick;
  readonly name: string;
  /** Nomenclatura latina (músculo do Atlas) ou nome do objeto de origem (resto). */
  readonly latin: string;
  readonly kind: StructureInfo['kind'];
  readonly muscle?: MuscleDef;
}

export function describe(p: Pick, structures: readonly StructureInfo[]): Described | null {
  if (p.kind === 'muscle') {
    const m = muscleById(p.id);
    return m ? { pick: p, name: m.name, latin: m.latin, kind: 'muscle', muscle: m } : null;
  }
  const s = structures.find((x) => x.id === p.id);
  if (!s) return null;
  return { pick: p, name: t.atlas.structures[s.id] ?? s.source, latin: s.source, kind: s.kind };
}

/** Sem acento e em minúsculas: a busca ignora diacríticos. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface SearchItem {
  readonly pick: Pick;
  readonly name: string;
  readonly detail: string;
  readonly hay: string;
}

/** Tudo que se pode buscar: músculos do Atlas primeiro, depois as outras partes (sem as malhas de músculos do Atlas). */
export function searchIndex(structures: readonly StructureInfo[]): SearchItem[] {
  const muscles = muscleDefs.map((m): SearchItem => ({
    pick: { kind: 'muscle', id: m.id, side: 'r' },
    name: m.name,
    detail: t.groups[m.group],
    hay: fold(`${m.name} ${m.latin} ${t.groups[m.group]}`),
  }));
  const parts = structures
    .filter((s) => !s.muscleId)
    .map((s): SearchItem => {
      const name = t.atlas.structures[s.id] ?? s.source;
      return { pick: { kind: 'part', id: s.id, side: 'r' }, name, detail: t.atlas.ex.kind[s.kind], hay: fold(`${name} ${s.source}`) };
    });
  return [...muscles, ...parts];
}

/** Busca por prefixo de palavra primeiro, depois por trecho. */
export function searchStructures(index: readonly SearchItem[], q: string, limit = 8): SearchItem[] {
  const f = fold(q.trim());
  if (!f) return [];
  const words = f.split(/\s+/);
  const scored: { it: SearchItem; s: number }[] = [];
  for (const it of index) {
    if (!words.every((w) => it.hay.includes(w))) continue;
    const starts = words.every((w) => it.hay.split(/\s+/).some((h) => h.startsWith(w)));
    scored.push({ it, s: (starts ? 0 : 1) + (it.pick.kind === 'muscle' ? 0 : 0.5) + (fold(it.name).startsWith(f) ? -1 : 0) });
  }
  return scored.sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name, 'pt-BR')).slice(0, limit).map((x) => x.it);
}
