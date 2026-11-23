/**
 * Índice da busca global (montado sob demanda, no chunk da busca): exercícios, músculos e partes, páginas e ações.
 * Comparação sem acento e sem caixa; cada palavra digitada precisa aparecer. O id do exercício entra nas chaves, então
 * o nome em inglês do movimento também acha ("pulldown" → puxada).
 */
import { muscleDefs } from '@/data';
import { partLabel } from '@/features/atlas/explorer/names';
import { library, muscleById } from '@/features/library/catalog';
import { t as tShell } from '@/i18n';
import { t } from '@/i18n/app';
import { exerciseHref, muscleHref, R } from './routes';

export type HitKind = 'exercise' | 'muscle' | 'page' | 'action';
export type HitAction = 'theme' | 'settings' | 'lang';
export interface Hit {
  readonly kind: HitKind;
  readonly id: string;
  readonly label: string;
  readonly sub?: string | undefined;
  readonly href?: string | undefined;
  readonly action?: HitAction | undefined;
  /** Rótulo e sinônimos (pesam mais). */
  readonly main: string;
  /** Contexto (alvos, nome latino): só desempata. */
  readonly extra: string;
}

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const words = (...s: (string | undefined)[]) => fold(s.filter(Boolean).join(' ').replaceAll('_', ' '));

export const GROUP_ORDER: readonly HitKind[] = ['exercise', 'muscle', 'page', 'action'];

export function buildIndex(): Hit[] {
  const S = t.search;
  const out: Hit[] = [];
  for (const e of library) {
    const targets = e.targets.map((x) => muscleById(x.muscle)?.name ?? '').filter(Boolean);
    out.push({ kind: 'exercise', id: e.id, label: e.name, sub: targets[0], href: exerciseHref(e.id), main: words(e.name, e.id), extra: words(...targets) });
  }
  for (const m of muscleDefs) {
    out.push({ kind: 'muscle', id: m.id, label: m.name, sub: m.latin, href: muscleHref(m.id), main: words(m.name, m.id), extra: words(m.latin) });
    if (m.parts.length > 1)
      for (const p of m.parts) {
        const label = partLabel(m, p.name);
        out.push({ kind: 'muscle', id: `${m.id}/${p.id}`, label, sub: m.latin, href: muscleHref(m.id, p.id), main: words(label), extra: words(m.latin) });
      }
  }
  const N = tShell.nav;
  const TR = t.training.tabs;
  const F = t.footer;
  const pages: [string, string, string?][] = [
    [R.atlas, N.atlas, S.syn.atlas],
    [R.library, N.library, S.syn.library],
    [R.labSquat, `${N.lab}: ${t.labTabs.squat}`],
    [R.labCompare, `${N.lab}: ${t.labTabs.compare}`],
    [R.training, `${N.training}: ${TR.log}`],
    [R.plan, `${N.training}: ${TR.plan}`],
    [R.history, `${N.training}: ${TR.history}`],
    [R.progress, `${N.training}: ${TR.progress}`],
    [R.analysis, `${N.training}: ${TR.analysis}`],
    [R.data, `${N.training}: ${TR.data}`, S.syn.data],
    [R.about, F.about],
    [R.terms, F.terms],
    [R.privacy, F.privacy],
    [R.licenses, F.licenses],
  ];
  for (const [href, label, syn] of pages) out.push({ kind: 'page', id: href, label, href, main: words(label, syn), extra: '' });
  const actions: [string, string, HitAction | undefined, string | undefined][] = [
    ['theme', S.actions.theme, 'theme', undefined],
    ['settings', S.actions.quality, 'settings', undefined],
    ['log', S.actions.log, undefined, R.training],
    ['lang', S.actions.lang, 'lang', undefined],
  ];
  for (const [id, label, action, href] of actions) out.push({ kind: 'action', id, label, action, href, main: words(label), extra: '' });
  return out;
}

/** Resultados agrupados: o grupo com o melhor acerto vem primeiro (empate: ordem fixa), até `per` por grupo. */
export function search(index: readonly Hit[], query: string, per = 6): Hit[] {
  const q = fold(query).trim();
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored: { h: Hit; s: number }[] = [];
  for (const h of index) {
    const all = `${h.main} ${h.extra}`;
    if (!tokens.every((k) => all.includes(k))) continue;
    const prefix = (k: string) => h.main.startsWith(k) || h.main.includes(` ${k}`);
    const s = fold(h.label).startsWith(q) ? 4 : tokens.every(prefix) ? 3 : tokens.every((k) => h.main.includes(k)) ? 2 : 1;
    scored.push({ h, s });
  }
  const groups = GROUP_ORDER.map((g) => scored.filter((x) => x.h.kind === g).sort((a, b) => b.s - a.s || a.h.label.length - b.h.label.length));
  return groups
    .filter((g) => g.length)
    .sort((a, b) => (b[0]?.s ?? 0) - (a[0]?.s ?? 0))
    .flatMap((g) => g.slice(0, per).map((x) => x.h));
}
