import strings from '@/i18n/dict';
import appStrings from '@/i18n/dict.app';
import type { Strings } from './pt-BR';
import type { AppStrings } from './pt-BR.app';

/**
 * Dicionário completo para as páginas lazy. A shell importa `@/i18n` (só o necessário
 * para a primeira pintura); qualquer rota além da página inicial importa daqui.
 */
export const t: Strings & AppStrings = { ...strings, ...appStrings };
export { fmt, locale } from './index';
