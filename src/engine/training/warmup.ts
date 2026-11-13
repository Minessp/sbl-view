/**
 * Séries de aquecimento até a carga de trabalho: frações da carga, arredondadas ao passo.
 * Sem unidade. Carga abaixo do mínimo (a barra vazia) vira o mínimo; cargas repetidas saem.
 */
import { roundTo } from './progression';

export interface WarmupStep {
  pct: number;
  reps: number;
}

export function warmupSets(work: number, steps: readonly WarmupStep[], opts: { step: number; min: number }): { load: number; reps: number }[] {
  const out: { load: number; reps: number }[] = [];
  if (!(work > 0)) return out;
  for (const s of steps) {
    const load = Math.max(opts.min, roundTo(work * s.pct, opts.step));
    if (load >= work) continue;
    const prev = out.at(-1);
    if (prev && load <= prev.load) continue;
    out.push({ load, reps: s.reps });
  }
  return out;
}
