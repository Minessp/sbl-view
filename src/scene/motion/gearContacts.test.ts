/**
 * Atravessamento contra o equipamento como é desenhado (estações, barra, halteres, cabos), em 13 amostras por clipe.
 * Falha para os lotes já revistos (`GEAR_ENFORCED`); o resto só relata (`--silent=false` para ver) até a revisão chegar nele.
 */
import { describe, expect, it } from 'vitest';
import { evaluateClip } from '@/engine/motion/evaluate';
import { library } from '@/features/library/catalog';
import { compiledClip } from '@/features/library/motion';
import { EquipmentView } from './equipment';
import { GEAR_LIMIT, gearHits } from './gearContacts';

const GEAR_ENFORCED = new Set<string>([
  'squat', 'front_squat', 'goblet_squat', 'deadlift', 'romanian_deadlift', 'bench_press', 'lat_pulldown', 'barbell_row', 'seated_cable_row',
  'barbell_curl',
]);
const GEAR_EXCEPTIONS: Record<string, string> = {};

describe('atravessamento contra o equipamento desenhado', () => {
  it('nada passa do limite fora dos contatos declarados', () => {
    const lines: string[] = [];
    const wrong: string[] = [];
    for (const ex of library) {
      const c = compiledClip(ex.id);
      if (!c) continue;
      const view = new EquipmentView([0, 0.25, 0.5, 0.75, 1].map((u) => evaluateClip(c, u)));
      const worst = new Map<string, { d: number; u: number }>();
      for (let i = 0; i <= 12; i++) {
        const f = evaluateClip(c, i / 12);
        view.update(f, false);
        for (const h of gearHits(view, c, f)) {
          if (h.depthM <= GEAR_LIMIT[h.kind]) continue;
          const k = `${h.a}×${h.b}`;
          if ((worst.get(k)?.d ?? 0) < h.depthM) worst.set(k, { d: h.depthM, u: f.u });
        }
      }
      view.dispose();
      if (!worst.size) continue;
      const desc = [...worst].sort((a, b) => b[1].d - a[1].d).map(([k, v]) => `${k} ${(v.d * 100).toFixed(1)} cm (u ${v.u.toFixed(2)})`);
      lines.push(`${ex.id}: ${desc.join('; ')}`);
      if (GEAR_ENFORCED.has(ex.id) && !(ex.id in GEAR_EXCEPTIONS)) wrong.push(`${ex.id}: ${desc.join('; ')}`);
    }
    console.log(`[equipamento] ${lines.length} de ${library.length} exercícios com atravessamento\n${lines.join('\n')}`);
    expect(wrong).toEqual([]);
  }, 120_000);
});
