/** Idioma do pacote, decidido no build (`vite --mode en`). PT-BR na raiz, inglês em `/en/`. */
export type Locale = 'pt-BR' | 'en';
export const LOCALE: Locale = __LOCALE__;
export const PREFIX: '' | '/en' = LOCALE === 'en' ? '/en' : '';
export const OTHER: Locale = LOCALE === 'en' ? 'pt-BR' : 'en';
