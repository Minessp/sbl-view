/**
 * Interpolação de quadros-chave e relógio da repetição. Puro e determinístico.
 *
 * Curva: Hermite cúbica monótona (Fritsch–Carlson). Entre duas chaves o valor nunca sai do intervalo delas, então um
 * clipe que respeita a amplitude nas chaves respeita em todo u.
 */
import type { Vec3 } from '../math/vec';

export interface Key {
  readonly u: number;
  readonly v: number;
}

/** Tangentes de Fritsch–Carlson para chaves ordenadas por u. */
function tangents(keys: readonly Key[]): number[] {
  const n = keys.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = keys[i] as Key,
      b = keys[i + 1] as Key;
    d.push(b.u > a.u ? (b.v - a.v) / (b.u - a.u) : 0);
  }
  const m: number[] = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) m[i] = d[0] ?? 0;
    else if (i === n - 1) m[i] = d[n - 2] ?? 0;
    else {
      const d0 = d[i - 1] ?? 0,
        d1 = d[i] ?? 0;
      m[i] = d0 * d1 <= 0 ? 0 : (d0 + d1) / 2;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const di = d[i] ?? 0;
    if (di === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] ?? 0) / di,
      b = (m[i + 1] ?? 0) / di;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * di;
      m[i + 1] = t * b * di;
    }
  }
  // Pontas planas: a repetição para e volta nelas.
  m[0] = 0;
  m[n - 1] = 0;
  return m;
}

/** Curva pronta para avaliar (chaves ordenadas, tangentes calculadas uma vez). */
export interface Curve {
  readonly keys: readonly Key[];
  readonly m: readonly number[];
}

export function makeCurve(keys: readonly Key[]): Curve {
  const sorted = [...keys].sort((a, b) => a.u - b.u);
  return { keys: sorted, m: tangents(sorted) };
}

export function evalCurve(c: Curve, u: number): number {
  const k = c.keys;
  const n = k.length;
  const f = k[0];
  const l = k[n - 1];
  if (!f || !l) return 0;
  if (n === 1 || u <= f.u) return f.v;
  if (u >= l.u) return l.v;
  let i = 0;
  while (i < n - 2 && u > (k[i + 1] as Key).u) i++;
  const a = k[i] as Key,
    b = k[i + 1] as Key;
  const h = b.u - a.u;
  if (h <= 0) return b.v;
  const t = (u - a.u) / h;
  const t2 = t * t,
    t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a.v + (t3 - 2 * t2 + t) * h * (c.m[i] ?? 0) + (-2 * t3 + 3 * t2) * b.v + (t3 - t2) * h * (c.m[i + 1] ?? 0);
}

/** Caminho no espaço: uma curva monótona por eixo. */
export interface PathCurve {
  readonly axes: readonly [Curve, Curve, Curve];
}

export function makePath(keys: readonly { readonly u: number; readonly p: Vec3 }[]): PathCurve {
  const axis = (a: 0 | 1 | 2) => makeCurve(keys.map((k) => ({ u: k.u, v: k.p[a] })));
  return { axes: [axis(0), axis(1), axis(2)] };
}

export const evalPath = (c: PathCurve, u: number): Vec3 => [evalCurve(c.axes[0], u), evalCurve(c.axes[1], u), evalCurve(c.axes[2], u)];

// ---- Relógio da repetição ----

export interface TempoSpec {
  readonly out: number;
  readonly hold: number;
  readonly back: number;
  readonly rest: number;
  readonly concentric: 'out' | 'back';
}

export type RepPhase = 'out' | 'hold' | 'back' | 'rest';

export const cycleLength = (t: TempoSpec) => t.out + t.hold + t.back + t.rest;

/** Suave nas pontas (velocidade zero ao parar e ao virar). */
const ease = (x: number) => x * x * (3 - 2 * x);

/**
 * Tempo (s) dentro da repetição → u e fase. Fora de [0, ciclo) dá a volta.
 * Ordem: sai de u = 0 até 1 (`out`), pausa (`hold`), volta (`back`), pausa (`rest`).
 */
export function repAt(t: TempoSpec, time: number): { u: number; phase: RepPhase; concentric: boolean } {
  const T = cycleLength(t);
  const s = ((time % T) + T) % T;
  if (s < t.out)
    return {
      u: ease(s / t.out),
      phase: 'out',
      concentric: t.concentric === 'out',
    };
  if (s < t.out + t.hold) return { u: 1, phase: 'hold', concentric: false };
  if (s < t.out + t.hold + t.back)
    return {
      u: 1 - ease((s - t.out - t.hold) / t.back),
      phase: 'back',
      concentric: t.concentric === 'back',
    };
  return { u: 0, phase: 'rest', concentric: false };
}
