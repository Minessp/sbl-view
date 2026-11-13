import { ptBR, type Strings } from './pt-BR';
import { ptBRApp, type AppStrings } from './pt-BR.app';

/**
 * Dicionário completo para as páginas lazy. A shell importa `@/i18n` (só o necessário
 * para a primeira pintura); qualquer rota além da abertura importa daqui.
 */
export const t: Strings & AppStrings = { ...ptBR, ...ptBRApp };
export { fmt, locale } from './index';
