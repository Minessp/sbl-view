/**
 * Rotas por idioma. Sem dependência além do idioma do build: entra na shell. Caminhos sem a base e sem o prefixo `/en`
 * (o roteador já tem `base + PREFIX`). Nomes de parâmetro de busca (`alvo`, `ex`, `parte`, `exercicio`) não mudam.
 */
import { LOCALE, type Locale } from '@/i18n/locale';

const PT = {
  atlas: '/atlas',
  library: '/exercicios',
  lab: '/lab',
  labSquat: '/lab/agachamento',
  labCompare: '/lab/comparar',
  training: '/treino',
  plan: '/treino/plano',
  history: '/treino/historico',
  progress: '/treino/progresso',
  analysis: '/treino/analise',
  data: '/treino/dados',
  about: '/sobre',
  terms: '/termos',
  privacy: '/privacidade',
  licenses: '/licencas',
  learn: '/aprender',
} as const;

export type RouteKey = keyof typeof PT;

const EN: Record<RouteKey, string> = {
  atlas: '/atlas',
  library: '/exercises',
  lab: '/lab',
  labSquat: '/lab/squat',
  labCompare: '/lab/compare',
  training: '/training',
  plan: '/training/plan',
  history: '/training/history',
  progress: '/training/progress',
  analysis: '/training/analysis',
  data: '/training/data',
  about: '/about',
  terms: '/terms',
  privacy: '/privacy',
  licenses: '/licenses',
  learn: '/learn',
};

export const ROUTES: Record<Locale, Record<RouteKey, string>> = { 'pt-BR': PT, en: EN };
export const R = ROUTES[LOCALE];

export const slug = (id: string) => id.replaceAll('_', '-');
export const unslug = (s: string) => s.replaceAll('-', '_');
export const exerciseHref = (id: string) => `${R.library}/${slug(id)}`;
export const muscleHref = (id: string, part?: string) => `${R.atlas}/${slug(id)}${part ? `?parte=${part}` : ''}`;

/** Rota mais longa que casa com o caminho (exata ou seguida de `/`). */
function matchRoute(table: Record<RouteKey, string>, path: string): RouteKey | undefined {
  let best: RouteKey | undefined;
  for (const k of Object.keys(table) as RouteKey[]) {
    const r = table[k];
    if ((path === r || path.startsWith(`${r}/`)) && (!best || r.length > table[best].length)) best = k;
  }
  return best;
}

/**
 * Caminho equivalente no outro idioma. Entra e sai com o prefixo do idioma (`/en/...` ou sem), com busca e âncora.
 * Caminho desconhecido só troca o prefixo.
 */
export function translatePath(path: string, to: Locale): string {
  const cut = path.search(/[?#]/);
  const pathname = cut < 0 ? path : path.slice(0, cut);
  const tail = cut < 0 ? '' : path.slice(cut);
  const fromEn = pathname === '/en' || pathname.startsWith('/en/');
  const bare = fromEn ? pathname.slice(3) || '/' : pathname;
  const from = ROUTES[fromEn ? 'en' : 'pt-BR'];
  const key = matchRoute(from, bare);
  const moved = key ? ROUTES[to][key] + bare.slice(from[key].length) : bare;
  const prefixed = to === 'en' ? `/en${moved === '/' ? '/' : moved}` : moved;
  return prefixed + tail;
}
