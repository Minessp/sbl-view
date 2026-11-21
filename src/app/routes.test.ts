import { describe, expect, it } from 'vitest';
import { exerciseHref, muscleHref, R, ROUTES, slug, translatePath, unslug, type RouteKey } from './routes';

const keys = Object.keys(ROUTES['pt-BR']) as RouteKey[];

describe('rotas', () => {
  it('as duas tabelas têm as mesmas chaves e caminhos distintos dentro de cada idioma', () => {
    expect(Object.keys(ROUTES.en).sort()).toEqual([...keys].sort());
    for (const l of ['pt-BR', 'en'] as const) expect(new Set(Object.values(ROUTES[l])).size).toBe(keys.length);
  });

  it('translatePath vai e volta em toda rota, com id, busca e âncora', () => {
    for (const k of keys) {
      const pt = ROUTES['pt-BR'][k];
      const en = `/en${ROUTES.en[k]}`;
      for (const tail of ['', '/bench-press', '?alvo=biceps_brachii&ex=x', '/vastus-lateralis?parte=long_head', '#evidencia']) {
        expect(translatePath(pt + tail, 'en')).toBe(en + tail);
        expect(translatePath(en + tail, 'pt-BR')).toBe(pt + tail);
      }
    }
  });

  it('início e caminho desconhecido só trocam o prefixo', () => {
    expect(translatePath('/', 'en')).toBe('/en/');
    expect(translatePath('/en/', 'pt-BR')).toBe('/');
    expect(translatePath('/en', 'pt-BR')).toBe('/');
    expect(translatePath('/?x=1', 'en')).toBe('/en/?x=1');
    expect(translatePath('/nada/aqui', 'en')).toBe('/en/nada/aqui');
    expect(translatePath('/en/nada', 'pt-BR')).toBe('/nada');
  });

  it('slug com hífen e links do idioma do build', () => {
    expect(slug('vastus_lateralis')).toBe('vastus-lateralis');
    expect(unslug(slug('incline_dumbbell_curl'))).toBe('incline_dumbbell_curl');
    expect(exerciseHref('bench_press')).toBe(`${R.library}/bench-press`);
    expect(muscleHref('biceps_femoris', 'long_head')).toBe(`${R.atlas}/biceps-femoris?parte=long_head`);
  });
});
