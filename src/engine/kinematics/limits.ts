/**
 * Limites articulares por plano, na rotação composta: cada DOF pode caber na amplitude e a combinação ainda torcer o osso.
 * Rotação local = balanço + torção (Shoemake/Baerlocher); balanço limitado por plano e interpolado por superelipse
 * (expoente 4: dois planos juntos chegam quase ao limite de cada um).
 * Só coluna, pescoço, ombro e quadril: nas dobradiças o eixo inclinado faria a torção vazar. Acima de `twistUntil` de
 * balanço só ele vale (singularidade). Puro; guarda contra pose absurda, não medida clínica.
 */
import { must } from '../math/arr';
import { cross, DEG, dot, length, normalize, quatConj, quatMul, rotate, type Quat, type Vec3 } from '../math/vec';
import type { EngineSkeleton, Pose } from './types';

export interface JointLimit {
  /** Torção em torno do eixo do osso (graus, [mín, máx]); sinal pela regra da mão direita no eixo origem → ponta. */
  readonly twist: readonly [number, number];
  /** Balanço máximo (graus) em cada direção do plano: à frente, atrás, para fora (lateral), para dentro (medial). */
  readonly swing: { readonly front: number; readonly back: number; readonly out: number; readonly in: number };
  /** Balanço (graus) acima do qual a torção não é conferida. */
  readonly twistUntil?: number;
}

/**
 * Por segmento (lado direito; o esquerdo usa o mesmo, espelhado). O balanço é medido no frame do pai: "à frente" = +Z,
 * "para fora" = −X no lado direito.
 */
export const JOINT_LIMITS: Readonly<Record<string, JointLimit>> = {
  lumbar: { twist: [-35, 35], swing: { front: 65, back: 30, out: 35, in: 35 } },
  trunk: { twist: [-40, 40], swing: { front: 35, back: 20, out: 25, in: 25 } },
  neck: { twist: [-75, 75], swing: { front: 50, back: 55, out: 50, in: 50 } },
  head: { twist: [-15, 15], swing: { front: 25, back: 25, out: 15, in: 15 } },
  // Ombro: a elevação passa de 180° em qualquer plano entre a frente e o lado; atrás fica a extensão; para dentro, a
  // adução horizontal (cruzar o corpo) também chega longe acima do ombro.
  upperarm_r: { twist: [-125, 125], swing: { front: 185, back: 70, out: 185, in: 140 }, twistUntil: 120 },
  thigh_r: { twist: [-55, 55], swing: { front: 130, back: 35, out: 70, in: 35 } },
};

/** Expoente da superelipse entre os planos. */
const P = 4;

/** Rotação local da articulação proximal do segmento (frame do pai). */
const localRotation = (pose: Pose, id: string, parent: string): Quat =>
  quatMul(quatConj(must(pose.world, parent, 'segmento').rotation), must(pose.world, id, 'segmento').rotation);

/** Torção (rad) de q em torno do eixo unitário a. */
function twistAngle(q: Quat, a: Vec3): number {
  const p = dot([q[0], q[1], q[2]], a);
  let t = 2 * Math.atan2(p, q[3]);
  if (t > Math.PI) t -= 2 * Math.PI;
  if (t < -Math.PI) t += 2 * Math.PI;
  return t;
}

export interface JointReading {
  readonly segment: string;
  /** Graus. */
  readonly twist: number;
  /** Ângulo do balanço (graus) e quanto do limite elíptico ele usa (> 1 = fora). */
  readonly swing: number;
  readonly swingUse: number;
  /** Quanto passa (graus) do limite: da torção e do balanço, somados. */
  readonly over: number;
}

/**
 * Lê uma articulação. O eixo do osso é a direção origem → ponta na pose neutra; os planos do balanço saem do frame do
 * pai (que na pose neutra é o do mundo).
 */
export function readJoint(sk: EngineSkeleton, pose: Pose, id: string): JointReading | null {
  const seg = must(sk.byId, id, 'segmento');
  if (seg.parent === null) return null;
  const key = id.replace(/_l$/, '_r');
  const lim = JOINT_LIMITS[key];
  if (!lim) return null;
  const left = id.endsWith('_l');
  const axis = normalize(seg.tip);
  const q = localRotation(pose, id, seg.parent);
  const tw = twistAngle(q, axis) / DEG;
  const d = rotate(q, axis);
  const swing = Math.acos(Math.max(-1, Math.min(1, dot(d, axis)))) / DEG;
  // Planos: "à frente" e "para fora" no frame do pai, perpendiculares ao eixo do osso.
  const forwardWorld: Vec3 = Math.abs(axis[2]) > 0.7 ? [0, 1, 0] : [0, 0, 1];
  const fwd = normalize(sub3(forwardWorld, axis));
  const outv = normalize(cross(fwd, axis));
  // Lado direito: fora = −X. `outv` sai com o sinal do produto vetorial; acerta pelo X.
  const outSide: Vec3 = (left ? outv[0] < 0 : outv[0] > 0) ? [-outv[0], -outv[1], -outv[2]] : outv;
  const df = dot(d, fwd),
    dl = dot(d, outSide);
  const lateral = length([df, dl, 0]);
  let use = 0;
  if (lateral > 1e-6 && swing > 1e-3) {
    const cf = df / lateral,
      cl = dl / lateral;
    const a = cf >= 0 ? lim.swing.front : lim.swing.back;
    const b = cl >= 0 ? lim.swing.out : lim.swing.in;
    use = (Math.abs((swing * cf) / a) ** P + Math.abs((swing * cl) / b) ** P) ** (1 / P);
  }
  const twLo = left ? -lim.twist[1] : lim.twist[0];
  const twHi = left ? -lim.twist[0] : lim.twist[1];
  const twOver = swing > (lim.twistUntil ?? 180) ? 0 : tw < twLo ? twLo - tw : tw > twHi ? tw - twHi : 0;
  const swOver = use > 1 ? swing * (1 - 1 / use) : 0;
  return { segment: id, twist: tw, swing, swingUse: use, over: twOver + swOver };
}

/** Todas as articulações com limite. */
export function readJoints(sk: EngineSkeleton, pose: Pose): JointReading[] {
  const out: JointReading[] = [];
  for (const s of sk.segments) {
    const r = readJoint(sk, pose, s.id);
    if (r) out.push(r);
  }
  return out;
}

/** Projeção de v no plano perpendicular ao eixo unitário a. */
function sub3(v: Vec3, a: Vec3): Vec3 {
  const k = dot(v, a);
  return [v[0] - a[0] * k, v[1] - a[1] * k, v[2] - a[2] * k];
}
