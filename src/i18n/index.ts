import { ptBR, type Strings } from './pt-BR';

/** Idioma ativo. Por ora só PT-BR; a troca futura muda só esta linha + um seletor. */
export const t: Strings = ptBR;
export const locale = 'pt-BR';

const nf1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
export const fmt = {
  n0: (x: number) => nf0.format(x),
  n1: (x: number) => nf1.format(x),
};
