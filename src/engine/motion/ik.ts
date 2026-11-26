/**
 * IK analítico de dois ossos sobre os DOFs do esqueleto (braço: ombro + cotovelo; perna: quadril + joelho).
 *
 * 1. Dobra (cotovelo/joelho, um DOF em X): sai da distância raiz → alvo, em forma fechada
 *    |E + Rx(φ)·F|² = D²  ⇒  c₀ + A·cos(φ − δ) = (D² − |E|² − |F|²)/2.
 * 2. Raiz (três DOFs na ordem X, Z, Y): a rotação que leva a ponta ao alvo, com o eixo da dobra alinhado ao plano que o
 *    polo pede, decomposta em ângulos de Euler XZY. Dos dois ramos da decomposição fica o que respeita a amplitude; se
 *    nenhum couber, o plano da dobra gira em passos de 5° em torno da linha raiz–alvo até caber.
 *
 * Determinístico, sem iteração numérica. O que passa da amplitude é preso no limite (e a ponta erra o alvo: o teste mede).
 */
import { must } from '../math/arr';
import { add, cross, dot, length, normalize, quatConj, rotate, scale, sub, type Quat, type Vec3 } from '../math/vec';
import type { EngineDof, EngineSegment, EngineSkeleton, Pose } from '../kinematics/types';

/** Giros testados (graus), do polo para fora. */
const SWIVEL = [0, ...Array.from({ length: 36 }, (_, i) => (i % 2 === 0 ? 1 : -1) * 5 * (Math.floor(i / 2) + 1))];

type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Rotação que leva a base (a0, a1, a2) em (b0, b1, b2): R = B·Aᵀ, linha a linha. */
function frameToFrame(a: readonly [Vec3, Vec3, Vec3], b: readonly [Vec3, Vec3, Vec3]): Mat3 {
  const r = (i: 0 | 1 | 2, j: 0 | 1 | 2) => b[0][i] * a[0][j] + b[1][i] * a[1][j] + b[2][i] * a[2][j];
  return [r(0, 0), r(0, 1), r(0, 2), r(1, 0), r(1, 1), r(1, 2), r(2, 0), r(2, 1), r(2, 2)];
}

/** Valor do DOF em [min, max] mais perto (com voltas de 2π) e quanto passa da faixa. */
function fit(raw: number, d: EngineDof): { v: number; over: number } {
  let best = raw,
    over = Infinity;
  for (const k of [-1, 0, 1]) {
    const v = raw + k * 2 * Math.PI;
    const o = v < d.min ? d.min - v : v > d.max ? v - d.max : 0;
    if (o < over) {
      over = o;
      best = v;
    }
  }
  return { v: best, over };
}

/** R = Rx(α)·Rz(β)·Ry(γ) → os dois ramos (α, β, γ). */
function eulerXZY(R: Mat3): [[number, number, number], [number, number, number]] {
  const beta = Math.asin(clamp(-R[1], -1, 1));
  const cb = Math.cos(beta);
  let alpha: number, gamma: number;
  if (Math.abs(cb) > 1e-6) {
    alpha = Math.atan2(R[7], R[4]);
    gamma = Math.atan2(R[2], R[0]);
  } else {
    // Trava (β = ±90°): só a soma importa; fica tudo em α.
    alpha = Math.atan2(-R[5], R[8]);
    gamma = 0;
  }
  return [
    [alpha, beta, gamma],
    [wrap(alpha + Math.PI), wrap(Math.PI - beta), wrap(gamma + Math.PI)],
  ];
}

export interface TwoBoneChain {
  /** Segmento raiz (braço, coxa): três DOFs na ordem X, Z, Y. */
  readonly top: EngineSegment;
  /** Segmento do meio (antebraço, perna): um DOF em X. */
  readonly mid: EngineSegment;
}

export function chainOf(sk: EngineSkeleton, top: string, mid: string): TwoBoneChain {
  const t = must(sk.byId, top, 'segmento');
  const m = must(sk.byId, mid, 'segmento');
  const axes = t.dofs.map((d) => (d.axis[0] === 1 ? 'x' : d.axis[1] === 1 ? 'y' : 'z')).join('');
  if (axes !== 'xzy' || m.dofs.length !== 1 || m.dofs[0]?.axis[0] !== 1 || m.parent !== t.id) {
    throw new Error(`Cadeia ${top}→${mid} fora do formato do IK (raiz XZY, dobra em X)`);
  }
  return { top: t, mid: m };
}

export interface IkResult {
  /** Ângulos (rad) dos DOFs da raiz e da dobra. */
  readonly angles: Record<string, number>;
  /** O alvo estava longe demais (ou perto demais): a ponta fica na direção dele. */
  readonly clipped: boolean;
}

/**
 * Resolve a cadeia para a ponta `endLocal` (no frame do segmento do meio) chegar a `target` (mundo).
 * `pose` dá o frame do pai da raiz e a posição da raiz (não dependem dos ângulos resolvidos).
 * `pole`: direção (mundo) para onde a dobra deve apontar. `hinge` (opcional, mundo): o eixo da dobra fica o mais perto
 * possível dele (perna: o eixo do joelho segue o do pé, que só tem um DOF e rolaria com a coxa aberta).
 */
export function solveTwoBone(
  chain: TwoBoneChain,
  pose: Pose,
  endLocal: Vec3,
  target: Vec3,
  pole: Vec3,
  prev?: Readonly<Record<string, number>>,
  hinge?: Vec3,
): IkResult {
  const { top, mid } = chain;
  if (top.parent === null) throw new Error(`Raiz da cadeia sem pai: ${top.id}`);
  const parent = must(pose.world, top.parent, 'segmento');
  const rootPos = must(pose.world, top.id, 'segmento').position;
  const qp: Quat = parent.rotation;
  const inv = quatConj(qp);
  const T = rotate(inv, sub(target, rootPos));
  const P = rotate(inv, pole);

  const E = mid.jointOffset;
  const F = endLocal;
  const knee = mid.dofs[0];
  if (!knee) throw new Error(`Dobra sem DOF: ${mid.id}`);

  // ---- Dobra ----
  const D = length(T);
  const eF = Math.hypot(E[1] * F[1] + E[2] * F[2], E[2] * F[1] - E[1] * F[2]);
  const delta = Math.atan2(E[2] * F[1] - E[1] * F[2], E[1] * F[1] + E[2] * F[2]);
  const c0 = E[0] * F[0];
  const K = (D * D - dot(E, E) - dot(F, F)) / 2;
  const c = eF > 1e-9 ? (K - c0) / eF : 1;
  const clipped = c > 1 || c < -1;
  const ac = Math.acos(clamp(c, -1, 1));
  // Dois φ possíveis; o ângulo do DOF é φ / sinal. Fica o que cabe na amplitude; empate: o mais perto do ângulo pedido
  // (perto de estendido o "menor" virava hiperextensão e o joelho estalava entre quadros vizinhos).
  // Sem pedido de hiperextensão, a dobra para trás perde o empate.
  const ref = prev?.[knee.id] ?? 0;
  const cost = (v: number) => Math.abs(v - ref) + (v < 0 && ref >= 0 ? Math.PI : 0);
  const cands = [delta + ac, delta - ac].map((phi) => fit(wrap(phi) / knee.sign, knee));
  cands.sort((a, b) => a.over - b.over || cost(a.v) - cost(b.v));
  const bend = clamp(cands[0]?.v ?? 0, knee.min, knee.max);
  const phi = bend * knee.sign;
  const cp = Math.cos(phi),
    sp = Math.sin(phi);
  const RF: Vec3 = [F[0], F[1] * cp - F[2] * sp, F[1] * sp + F[2] * cp];
  const w: Vec3 = [E[0] + RF[0], E[1] + RF[1], E[2] + RF[2]];

  // ---- Raiz ----
  const wn = normalize(w);
  // Sentido do eixo da dobra em relação ao plano raiz–dobra–ponta, medido com a dobra a 90°.
  const p90 = ((90 * Math.PI) / 180) * knee.sign;
  const w90: Vec3 = [E[0] + F[0], E[1] + F[1] * Math.cos(p90) - F[2] * Math.sin(p90), E[2] + F[1] * Math.sin(p90) + F[2] * Math.cos(p90)];
  const w90n = normalize(w90);
  const e90 = sub(E, scale(w90n, dot(E, w90n)));
  const s = dot(cross(w90n, normalize(e90)), [1, 0, 0]) >= 0 ? 1 : -1;

  const hx = sub([1, 0, 0], scale(wn, wn[0]));
  const h = normalize(hx);
  const A: [Vec3, Vec3, Vec3] = [wn, h, cross(wn, h)];

  const Tn = D > 1e-9 ? normalize(T) : wn;
  let hd0: Vec3;
  const H = hinge ? rotate(inv, hinge) : null;
  const hh = H ? sub(H, scale(Tn, dot(H, Tn))) : null;
  if (hh && length(hh) > 1e-6) hd0 = normalize(hh);
  else {
    let pp = sub(P, scale(Tn, dot(P, Tn)));
    if (length(pp) < 1e-6) pp = sub([0, 0, 1], scale(Tn, Tn[2]));
    hd0 = scale(normalize(cross(Tn, normalize(pp))), s);
  }
  const side0 = cross(Tn, hd0);

  const [dx, dz, dy] = top.dofs as readonly [EngineDof, EngineDof, EngineDof];
  // Giro em torno da linha raiz–alvo: começa no que o polo pede e abre aos poucos até caber na amplitude.
  let best: { a: [number, number, number]; over: number; dist: number } | null = null;
  for (const deg of SWIVEL) {
    const sw = (deg * Math.PI) / 180;
    const hd = add(scale(hd0, Math.cos(sw)), scale(side0, Math.sin(sw)));
    const R = frameToFrame(A, [Tn, hd, cross(Tn, hd)]);
    for (const [al, be, ga] of eulerXZY(R)) {
      const fx = fit(al / dx.sign, dx),
        fz = fit(be / dz.sign, dz),
        fy = fit(ga / dy.sign, dy);
      const over = fx.over + fz.over + fy.over;
      const dist = prev ? Math.abs(fx.v - (prev[dx.id] ?? 0)) + Math.abs(fz.v - (prev[dz.id] ?? 0)) + Math.abs(fy.v - (prev[dy.id] ?? 0)) : 0;
      if (!best || over < best.over - 1e-9 || (Math.abs(over - best.over) <= 1e-9 && deg === 0 && dist < best.dist))
        best = { a: [fx.v, fz.v, fy.v], over, dist };
    }
    if (best && best.over <= 1e-9) break;
  }
  const a = best?.a ?? [0, 0, 0];
  return {
    angles: {
      [dx.id]: clamp(a[0], dx.min, dx.max),
      [dz.id]: clamp(a[1], dz.min, dz.max),
      [dy.id]: clamp(a[2], dy.min, dy.max),
      [knee.id]: bend,
    },
    clipped,
  };
}

/** Matriz (linha a linha) de um quatérnio unitário. */
function quatToMat3(q: Quat): Mat3 {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

/**
 * Rotação local (no frame do pai) → ângulos dos três DOFs do segmento, na ordem X, Z, Y (pé: dorsiflexão, inversão,
 * adução). Dos dois ramos de Euler fica o que respeita a amplitude; o resultado é preso nela.
 */
export function anglesFromRotation(seg: EngineSegment, q: Quat): Record<string, number> {
  const axes = seg.dofs.map((d) => (d.axis[0] === 1 ? 'x' : d.axis[1] === 1 ? 'y' : 'z')).join('');
  if (axes !== 'xzy') throw new Error(`Segmento ${seg.id} fora do formato XZY`);
  const [dx, dz, dy] = seg.dofs as readonly [EngineDof, EngineDof, EngineDof];
  let best: { a: [number, number, number]; over: number } | null = null;
  for (const [al, be, ga] of eulerXZY(quatToMat3(q))) {
    const fx = fit(al / dx.sign, dx),
      fz = fit(be / dz.sign, dz),
      fy = fit(ga / dy.sign, dy);
    const over = fx.over + fz.over + fy.over;
    if (!best || over < best.over) best = { a: [fx.v, fz.v, fy.v], over };
  }
  const a = best?.a ?? [0, 0, 0];
  return {
    [dx.id]: clamp(a[0], dx.min, dx.max),
    [dz.id]: clamp(a[1], dz.min, dz.max),
    [dy.id]: clamp(a[2], dy.min, dy.max),
  };
}
