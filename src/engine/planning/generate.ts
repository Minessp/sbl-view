/**
 * Gerador de plano semanal. Determinístico: mesma entrada, mesmo plano.
 *
 * 1. Divisão: a dada em `split` (dias com os grupos que aceitam) ou, sem ela, a legada pelo número de
 *    dias: até 3 = corpo inteiro; 4 e 6 = superior/inferior; 5 = S/I/corpo/S/I.
 * 2. Cada grupo com meta recebe uma frequência (mínimo `frequency` se priorizado; mais dias se a
 *    meta passa do teto por sessão) e os dias que espalham melhor e equilibram a carga.
 * 3. Em cada dia, exercícios escolhidos por pontuação: cobre o grupo, aproveita outros grupos do dia,
 *    composto antes de isolado, variedade na semana e (no empate) alvo alongado. Exercício com alvo
 *    que o dia não aceita perde pontos (no dia de peito, nada de agachamento).
 * Uma série conta 1 para cada grupo-alvo do exercício (mesma regra do Progresso).
 */
import type { CatalogEntry, DayFocus, GenerateInput, PlanDay, PlanItem, Region, SplitDay } from './types';

const LETTERS = 'ABCDEF';

export function splitFor(days: number): DayFocus[] {
  if (days <= 3) return Array.from({ length: days }, () => 'full');
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return ['upper', 'lower', 'full', 'upper', 'lower'];
  return Array.from({ length: days }, (_, i) => (i % 2 === 0 ? 'upper' : 'lower'));
}

/** Grupos-alvo do exercício, sem repetição. */
export function targetGroups(e: CatalogEntry): string[] {
  return [...new Set(e.targets.filter((t) => t.role === 'alvo').map((t) => t.group))];
}

/** Combinações de k índices em 0..n-1, em ordem lexicográfica. */
function combos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push(acc);
      return;
    }
    for (let i = start; i < n; i++) walk(i + 1, [...acc, i]);
  };
  walk(0, []);
  return out;
}

/** Menor intervalo circular (em dias da semana) entre os dias escolhidos, supondo treinos espalhados. */
function minGap(chosen: readonly number[], days: number): number {
  if (chosen.length < 2) return 7;
  const pos = chosen.map((i) => (i * 7) / days);
  let gap = Infinity;
  for (let i = 0; i < pos.length; i++) {
    const a = pos[i] ?? 0;
    const b = i + 1 < pos.length ? (pos[i + 1] ?? 0) : (pos[0] ?? 0) + 7;
    gap = Math.min(gap, b - a);
  }
  return gap;
}

/** Reparte n em k partes quase iguais, maiores primeiro. */
export function spread(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0));
}

const allowsRegion = (focus: DayFocus, region: Region) => focus === 'full' || region === 'trunk' || region === focus;

/** Dias da divisão legada, com o filtro por região. */
function legacyDays(days: number, regionOf: (g: string) => Region): (SplitDay & { test: (g: string) => boolean })[] {
  return splitFor(days).map((focus) => ({ focus, groups: null, test: (g) => allowsRegion(focus, regionOf(g)) }));
}

const withTest = (d: SplitDay) => ({ ...d, test: (g: string) => d.groups === null || d.groups.includes(g) });

export function generatePlan(input: GenerateInput): PlanDay[] {
  const { targets, priorities, config } = input;
  const days = input.split ? input.split.length : input.days;
  const split = input.split ? input.split.map(withTest) : legacyDays(days, input.regionOf);
  const have = new Set(input.equipment);
  const usable = input.catalog.filter((e) => have.size === 0 || e.equipment.every((q) => have.has(q)));
  const usableById = new Map(usable.map((e) => [e.id, e]));
  const groupsOf = (id: string): string[] => {
    const e = usableById.get(id);
    return e ? targetGroups(e) : [];
  };

  // Grupos com meta e com ao menos um exercício possível, meta maior primeiro (empate: nome).
  const groups = Object.entries(targets)
    .filter(([g, n]) => n > 0 && priorities[g] !== 'fora' && usable.some((e) => targetGroups(e).includes(g)))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Passo 2: dias de cada grupo.
  const load = split.map(() => 0);
  const need = split.map(() => new Map<string, number>());
  for (const [g, total] of groups) {
    const allowed = split.flatMap((d, i) => (d.test(g) ? [i] : []));
    if (allowed.length === 0) continue;
    const wanted = Math.max(priorities[g] === 'priorizar' ? config.frequency : 1, Math.ceil(total / config.maxSetsPerSession));
    const f = Math.min(allowed.length, wanted, total);
    let best: number[] = [];
    let bestScore = Infinity;
    for (const c of combos(allowed.length, f)) {
      const chosen = c.map((j) => allowed[j] ?? 0);
      const score = chosen.reduce((s, i) => s + (load[i] ?? 0), 0) + 4 * (7 / f - minGap(chosen, days));
      if (score < bestScore - 1e-9) {
        bestScore = score;
        best = chosen;
      }
    }
    const parts = spread(total, best.length);
    best.forEach((d, i) => {
      const n = parts[i] ?? 0;
      need[d]?.set(g, n);
      load[d] = (load[d] ?? 0) + n;
    });
  }

  // Passo 3: exercícios de cada dia.
  const usedInWeek = new Map<string, number>();
  return split.map((day, d) => {
    const remaining = need[d] ?? new Map<string, number>();
    const items: PlanItem[] = [];
    const usedToday = new Set<string>();
    const take = (gs: readonly string[], n: number) => {
      for (const h of gs) {
        const left = remaining.get(h);
        if (left !== undefined) remaining.set(h, Math.max(0, left - n));
      }
    };
    for (let guard = 0; guard < 40; guard++) {
      const open = [...remaining].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const head = open[0];
      if (!head) break;
      const [g, r] = head;
      let pick: CatalogEntry | undefined;
      let pickScore = -Infinity;
      for (const e of usable) {
        const tg = targetGroups(e);
        if (!tg.includes(g) || usedToday.has(e.id)) continue;
        let score = 10 + (e.isolated ? 0 : 2) - (usedInWeek.get(e.id) ?? 0);
        for (const h of tg) {
          if (h === g) continue;
          if (!day.test(h)) {
            score -= 3;
            continue;
          }
          // Aproveita grupo que ainda precisa de séries; penaliza passar da meta de outro.
          score += (remaining.get(h) ?? 0) > 0 ? 2 : -1;
        }
        if (config.preferLong && e.long) score += 0.5;
        if (score > pickScore) {
          pickScore = score;
          pick = e;
        }
      }
      if (!pick) {
        // Sem outro exercício para o grupo: o resto vai para o que já está no dia (passa do teto).
        const same = items.find((it) => groupsOf(it.exerciseId).includes(g));
        if (same) {
          same.sets += r;
          take(groupsOf(same.exerciseId), r);
        }
        remaining.set(g, 0);
        continue;
      }
      // Sobra de 1 série vira parte do mesmo exercício, se couber com folga de 1.
      let n = Math.min(r, config.maxSetsPerSlot);
      if (r - n === 1 && r <= config.maxSetsPerSlot + 1) n = r;
      take(targetGroups(pick), n);
      usedToday.add(pick.id);
      usedInWeek.set(pick.id, (usedInWeek.get(pick.id) ?? 0) + 1);
      const rest = config.rest && (pick.isolated ? config.rest.isolado : config.rest.composto);
      items.push({ exerciseId: pick.id, sets: n, reps: pick.isolated ? config.reps.isolado : config.reps.composto, ...(rest && { restSec: rest }) });
    }
    // Composto primeiro, mantendo a ordem de escolha.
    const iso = (id: string) => Number(usableById.get(id)?.isolated ?? false);
    items.sort((a, b) => iso(a.exerciseId) - iso(b.exerciseId));
    return { id: LETTERS[d] ?? String(d + 1), focus: day.focus, ...(day.focus === 'custom' && day.groups && { groups: [...day.groups] }), items };
  });
}
