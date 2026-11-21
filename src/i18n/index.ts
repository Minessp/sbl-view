import strings from '@/i18n/dict';
import { LOCALE } from './locale';
import type { Strings } from './pt-BR';

/** Idioma ativo, do build (`@/i18n/dict` aponta para `pt-BR.ts` ou `en.ts`). */
export const t: Strings = strings;
export const locale = LOCALE;

const nf1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
export const fmt = {
  n0: (x: number) => nf0.format(x),
  n1: (x: number) => nf1.format(x),
};
