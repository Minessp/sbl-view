import { describe, expect, it } from 'vitest';
import { buildIndex, search } from './searchIndex';

const index = buildIndex();
const ids = (q: string) => search(index, q).map((h) => h.id);

describe('busca global', () => {
  it('acha sem acento e sem caixa', () => {
    expect(ids('BICEPS')).toContain('biceps_brachii');
    expect(ids('glúteo máximo')[0]).toBe('gluteus_maximus');
  });

  it('acha pelo id do exercício (nome em inglês do movimento)', () => {
    const hits = search(index, 'pulldown');
    expect(hits[0]?.kind).toBe('exercise');
    expect(hits.map((h) => h.id)).toContain('lat_pulldown');
  });

  it('acha parte de músculo com o nome do músculo', () => {
    const part = search(index, 'cabeca longa').find((h) => h.id.startsWith('biceps_femoris/'));
    expect(part?.label).toMatch(/^Bíceps femoral, cabeça longa/);
    expect(part?.href).toContain('?parte=');
  });

  it('acha páginas e ações, e nada com consulta vazia', () => {
    expect(search(index, 'tema').some((h) => h.action === 'theme')).toBe(true);
    expect(search(index, 'privacidade').some((h) => h.kind === 'page')).toBe(true);
    expect(search(index, '   ')).toEqual([]);
  });

  it('agrupa (cada grupo contíguo) e respeita o teto por grupo', () => {
    const kinds = search(index, 'a', 3).map((h) => h.kind);
    expect(kinds.filter((k, i) => i > 0 && k !== kinds[i - 1] && kinds.indexOf(k) < i)).toEqual([]);
    expect(kinds.filter((k) => k === 'exercise').length).toBeLessThanOrEqual(3);
  });
});
