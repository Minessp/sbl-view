/**
 * Anotações sobre a vista de perfil, escritas direto no SVG do slot (sem re-render React).
 * Marcação esperada no slot: elementos com data-k = com, floor, hip-arm, knee-arm, hip-tick, knee-tick,
 * hip-label, knee-label, knee-arc, knee-angle, trunk-ref, trunk-arc, trunk-angle.
 */
import type { SquatFrame } from '@/engine/exercises/squat';
import type { Vec3 } from '@/engine/math/vec';
import { fmt } from '@/i18n/app';

type Project = (v: Vec3) => readonly [number, number];

const cache = new WeakMap<HTMLElement, Map<string, SVGElement | null>>();
function el(slot: HTMLElement, k: string): SVGElement | null {
  let m = cache.get(slot);
  if (!m) {
    m = new Map();
    cache.set(slot, m);
  }
  if (!m.has(k) || !m.get(k)?.isConnected) m.set(k, slot.querySelector<SVGElement>(`[data-k="${k}"]`));
  return m.get(k) ?? null;
}

const set = (e: SVGElement | null, attrs: Record<string, string | number>) => {
  if (!e) return;
  for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, typeof v === 'number' ? v.toFixed(1) : v);
};

/** Arco SVG em torno de c, do ângulo a0 a a1 (rad, tela), raio r. */
function arc(c: readonly [number, number], a0: number, a1: number, r: number): string {
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const x0 = c[0] + r * Math.cos(a0), y0 = c[1] + r * Math.sin(a0);
  const x1 = c[0] + r * Math.cos(a0 + d), y1 = c[1] + r * Math.sin(a0 + d);
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

export function writeOverlay(slot: HTMLElement, f: SquatFrame, project: Project) {
  const x = 0; // perfil: X do mundo some na projeção
  const { hip, knee, ankle } = f.joints;
  const floorY = project([x, 0, 0])[1];

  // Linha do peso do sistema, do CM ao chão (cai sobre o meio do pé quando há equilíbrio).
  const com = project(f.com);
  set(el(slot, 'com'), { x1: com[0], y1: com[1], x2: com[0], y2: floorY });
  set(el(slot, 'com-dot'), { cx: com[0], cy: com[1] });
  const heel = project([x, 0, -0.07]);
  const toe = project([x, 0, 0.22]);
  set(el(slot, 'floor'), { x1: heel[0] - 30, y1: floorY, x2: toe[0] + 30, y2: floorY });
  const mid = project([x, 0, f.midfootZ]);
  set(el(slot, 'midfoot'), { x1: mid[0], y1: floorY - 5, x2: mid[0], y2: floorY + 5 });

  // Braços de momento: da articulação até a linha do peso que ela sustenta.
  const arm = (j: Vec3, lineZ: number, key: 'hip' | 'knee', armM: number) => {
    const p = project(j);
    const q = project([x, j[1], lineZ]);
    set(el(slot, `${key}-arm`), { x1: p[0], y1: p[1], x2: q[0], y2: q[1] });
    set(el(slot, `${key}-tick`), { x1: q[0], y1: q[1] - 6, x2: q[0], y2: q[1] + 6 });
    const label = el(slot, `${key}-label`);
    set(label, { x: (p[0] + q[0]) / 2, y: p[1] - 8 });
    if (label) label.textContent = `${fmt.n0(Math.abs(armM) * 100)} cm`;
  };
  arm(hip, f.demand.hip.lineZ, 'hip', f.demand.hip.arm);
  arm(knee, f.demand.knee.lineZ, 'knee', f.demand.knee.arm);

  // Ângulo do joelho (entre coxa e perna).
  const K = project(knee), H = project(hip), A = project(ankle);
  const aH = Math.atan2(H[1] - K[1], H[0] - K[0]);
  const aA = Math.atan2(A[1] - K[1], A[0] - K[0]);
  set(el(slot, 'knee-arc'), { d: arc(K, aA, aH, 20) });
  const km = (aH + aA) / 2;
  const kneeText = el(slot, 'knee-angle');
  set(kneeText, { x: K[0] + 34 * Math.cos(km + Math.PI), y: K[1] + 34 * Math.sin(km + Math.PI) + 4 });
  if (kneeText) kneeText.textContent = `${fmt.n0(f.angles.knee)}°`;

  // Inclinação do tronco: vertical de referência a partir do quadril.
  const up: Vec3 = [x, hip[1] + 0.28, hip[2]];
  const U = project(up);
  set(el(slot, 'trunk-ref'), { x1: H[0], y1: H[1], x2: U[0], y2: U[1] });
  const neck = project([x, hip[1] + 0.28 * Math.cos((f.angles.trunk * Math.PI) / 180), hip[2] + 0.28 * Math.sin((f.angles.trunk * Math.PI) / 180)]);
  const a0 = Math.atan2(U[1] - H[1], U[0] - H[0]);
  const a1 = Math.atan2(neck[1] - H[1], neck[0] - H[0]);
  set(el(slot, 'trunk-arc'), { d: arc(H, a0, a1, 44) });
  const tt = el(slot, 'trunk-angle');
  set(tt, { x: H[0] + 54 * Math.cos((a0 + a1) / 2), y: H[1] + 54 * Math.sin((a0 + a1) / 2) });
  if (tt) tt.textContent = `${fmt.n0(f.angles.trunk)}°`;

  slot.dataset.balanced = String(f.balanced);
}
