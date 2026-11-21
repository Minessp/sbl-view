/**
 * Idioma no HTML: `lang`, título, descrição, Open Graph, aviso sem JavaScript e manifesto vêm daqui (marcadores
 * `%SBL_*%` no index.html). No `vite preview`, `/en/...` sem extensão serve o `en/index.html` (Cloudflare: `_redirects`).
 */
import type { Plugin } from 'vite';

export type Locale = 'pt-BR' | 'en';

const HTML: Record<Locale, Record<string, string>> = {
  'pt-BR': {
    LANG: 'pt-BR',
    OG_LOCALE: 'pt_BR',
    DESCRIPTION: 'Atlas 3D de biomecânica para quem treina: como o comprimento do músculo, o ângulo da articulação e a carga se encontram em cada exercício.',
    OG_TITLE: 'SBL View: atlas de biomecânica para quem treina',
    OG_DESCRIPTION: 'Corpo 3D em camadas, Lab do agachamento, atlas dos músculos e registro de treino. Gratuito, aberto e sem conta: os dados ficam no seu aparelho.',
    NOSCRIPT: 'O SBL View precisa de JavaScript para desenhar o corpo e os gráficos.',
    MANIFEST: 'manifest.webmanifest',
  },
  en: {
    LANG: 'en',
    OG_LOCALE: 'en_US',
    DESCRIPTION: 'A 3D biomechanics atlas for people who train: how muscle length, joint angle and load meet in every exercise.',
    OG_TITLE: 'SBL View: a biomechanics atlas for people who train',
    OG_DESCRIPTION: 'Layered 3D body, squat Lab, muscle atlas and training log. Free, open and account-free: your data stays on your device.',
    NOSCRIPT: 'SBL View needs JavaScript to draw the body and the charts.',
    MANIFEST: 'en/manifest.webmanifest',
  },
};

export function localeHtml(locale: Locale): Plugin {
  return {
    name: 'sbl-locale',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace(/%SBL_([A-Z_]+)%/g, (all, key: string) => {
          const v = HTML[locale][key];
          if (v === undefined) throw new Error(`index.html: marcador ${all} sem valor`);
          return v;
        }),
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        if (/^\/en(\/|$)/.test(path) && !/\.[a-z0-9]+$/i.test(path)) req.url = '/en/index.html';
        next();
      });
    },
  };
}
