/**
 * Preload da fonte principal (Archivo latin): a fonte é descoberta só depois do CSS,
 * e o título da abertura espera por ela. Só o subconjunto latin; o resto vem por unicode-range.
 */
import type { Plugin } from 'vite';

const FONTS = [/archivo-latin-wdth-normal-[\w-]+\.woff2$/];

export function fontPreload(): Plugin {
  let base = '/';
  return {
    name: 'sbl-font-preload',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => FONTS.some((re) => re.test(f)));
        if (files.length !== FONTS.length) throw new Error(`preload: fonte não encontrada no bundle (${files.join(', ')})`);
        return files.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: base + f, as: 'font', type: 'font/woff2', crossorigin: '' },
          injectTo: 'head-prepend' as const,
        }));
      },
    },
  };
}
