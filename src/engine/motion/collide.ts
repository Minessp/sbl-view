/**
 * Atravessamento num quadro do clipe: cápsulas dos segmentos (`data/body-volumes.json`) contra as peças (caixa
 * orientada), o chão, a barra (segmento entre as pegadas) e as mãos contra coxas e tronco. Puro e determinístico.
 *
 * Contatos declarados não contam: o segmento preso (`root.pin`), o apoio do `support` (assento, banco, chão), o segmento
 * que carrega uma peça ou um rolo, o pé com alvo `ball` (plataforma, degrau), a mão espalmada (`fingers` 0) e, para a
 * barra, o segmento em que ela se apoia (`attach`, carga presa a segmento, `plumb` rente às pernas).
 */
import volumesJson from '@/data/body-volumes.json';
import type { BodyVolumes } from '@/data/schema/skeleton';
import { pointToWorld } from '@/engine/kinematics/fk';
import { mirrorId } from '@/engine/kinematics/skeleton';
import { add, DEG, dot, lerp, scale, sub, type Vec3 } from '@/engine/math/vec';
import type { CompiledClip, MotionFrame } from './evaluate';

export type ContactKind = 'block' | 'floor' | 'bar' | 'hand';

export interface Penetration {
  readonly a: string;
  readonly b: string;
  readonly kind: ContactKind;
  readonly depthM: number;
}

export interface Capsule {
  readonly id: string;
  readonly p: Vec3;
  readonly q: Vec3;
  readonly r: number;
}

const defaultVolumes = volumesJson as unknown as BodyVolumes;

/** Meio comprimento da barra entre os colares (o que pode encostar no corpo), por tipo. */
const BAR_HALF = { olympic: 0.655, curl: 0.6, fixed: 0.55 } as const;
const BAR_R = 0.0142;

const SUPPORT: Readonly<Record<string, readonly string[]>> = {
  seated: ['pelvis', 'thigh_r', 'thigh_l'],
  supine: ['pelvis', 'lumbar', 'trunk', 'neck', 'head'],
  incline: ['pelvis', 'lumbar', 'trunk', 'neck', 'head', 'thigh_r', 'thigh_l'],
  prone: ['pelvis', 'lumbar', 'trunk', 'thigh_r', 'thigh_l'],
  kneeling: ['shank_r', 'shank_l', 'foot_r', 'foot_l'],
};

const both = (id: string) => (id.endsWith('_r') || id.endsWith('_l') ? [id, mirrorId(id)] : [id]);

/** Segmentos que podem encostar em peça e chão, e os que podem encostar na barra. */
export function declared(clip: CompiledClip, frame: MotionFrame) {
  const c = clip.clip;
  const rest = new Set<string>(SUPPORT[c.support] ?? []);
  if (c.root.mode === 'pin') rest.add(c.root.segment);
  for (const e of c.equipment) {
    if (e.kind === 'block' && e.segment) for (const s of both(e.segment)) rest.add(s);
    if (e.kind === 'pad') for (const s of both(e.segment)) rest.add(s);
  }
  for (const r of c.reach) {
    if (r.limb === 'leg' && r.target.kind === 'ball') for (const s of r.side === 'both' ? ['foot_r', 'foot_l'] : [`foot_${r.side}`]) rest.add(s);
  }
  for (const s of ['r', 'l'] as const) if (frame.fingers[s] === 0) rest.add(`hand_${s}`);
  const bar = new Set<string>();
  for (const r of c.reach) {
    if (r.limb !== 'arm') continue;
    if (r.target.kind === 'attach') for (const s of both(r.target.segment)) bar.add(s);
    if (r.target.kind === 'plumb') for (const s of ['thigh_r', 'thigh_l', 'shank_r', 'shank_l']) bar.add(s);
  }
  if ((c.load.kind === 'gravity' || c.load.kind === 'guided') && c.load.segment) for (const s of both(c.load.segment)) bar.add(s);
  return { rest, bar };
}

export function capsulesOf(clip: CompiledClip, frame: MotionFrame, volumes: BodyVolumes = defaultVolumes): Capsule[] {
  const out: Capsule[] = [];
  for (const seg of clip.sk.segments) {
    const v = volumes.segments[seg.id.replace(/_l$/, '_r')];
    if (!v) continue;
    const [a, b] = v.ends ?? [0, 1];
    out.push({ id: seg.id, p: pointToWorld(frame.pose, seg.id, scale(seg.tip, a)), q: pointToWorld(frame.pose, seg.id, scale(seg.tip, b)), r: v.radius });
  }
  return out;
}

/** Pontos mais próximos entre os segmentos p1–q1 e p2–q2 (Ericson, Real-Time Collision Detection 5.1.9): distância. */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  let s: number;
  let t: number;
  if (a < 1e-12 && e < 1e-12) return Math.hypot(...r);
  if (a < 1e-12) {
    s = 0;
    t = clamp(f / e);
  } else {
    const c = dot(d1, r);
    if (e < 1e-12) {
      t = 0;
      s = clamp(-c / a);
    } else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  const d = sub(add(p1, scale(d1, s)), add(p2, scale(d2, t)));
  return Math.hypot(d[0], d[1], d[2]);
}

/** Distância com sinal do ponto à caixa (centro, tamanho, inclinação em X em graus): negativa dentro. */
export function boxDistance(p: Vec3, center: Vec3, size: Vec3, pitchDeg: number): number {
  const d = sub(p, center);
  const a = -pitchDeg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const l: Vec3 = [d[0], d[1] * c - d[2] * s, d[1] * s + d[2] * c];
  const qx = Math.abs(l[0]) - size[0] / 2;
  const qy = Math.abs(l[1]) - size[1] / 2;
  const qz = Math.abs(l[2]) - size[2] / 2;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0);
}

/** Atravessamentos do quadro, do mais fundo ao mais raso (só profundidade > 0; um por par). */
export function penetrations(frame: MotionFrame, clip: CompiledClip, volumes: BodyVolumes = defaultVolumes): Penetration[] {
  const caps = capsulesOf(clip, frame, volumes);
  const { rest, bar } = declared(clip, frame);
  const hits = new Map<string, Penetration>();
  const hit = (a: string, b: string, kind: ContactKind, depthM: number) => {
    if (depthM <= 0) return;
    const k = `${a}|${b}`;
    const old = hits.get(k);
    if (!old || old.depthM < depthM) hits.set(k, { a, b, kind, depthM });
  };
  const SAMPLES = 9;
  for (const cap of caps) {
    if (rest.has(cap.id)) continue;
    hit(cap.id, 'chão', 'floor', cap.r - Math.min(cap.p[1], cap.q[1]));
    frame.equipment.forEach((e) => {
      if (e.kind !== 'block') return;
      let worst = -Infinity;
      for (let i = 0; i < SAMPLES; i++) worst = Math.max(worst, cap.r - boxDistance(lerp(cap.p, cap.q, i / (SAMPLES - 1)), e.center, e.size, e.pitch));
      hit(cap.id, `peça:${e.role}`, 'block', worst);
    });
  }
  const byId = new Map(caps.map((c) => [c.id, c]));
  for (const e of frame.equipment) {
    if (e.kind !== 'barbell') continue;
    const h = BAR_HALF[e.bar];
    const p = add(e.center, scale(e.axis, -h));
    const q = add(e.center, scale(e.axis, h));
    for (const id of ['head', 'neck', 'trunk', 'thigh_r', 'thigh_l']) {
      const cap = byId.get(id);
      if (!cap || bar.has(id)) continue;
      hit(id, 'barra', 'bar', cap.r + BAR_R - segmentDistance(cap.p, cap.q, p, q));
    }
  }
  for (const s of ['r', 'l'] as const) {
    const hand = byId.get(`hand_${s}`);
    if (!hand) continue;
    for (const id of ['trunk', 'thigh_r', 'thigh_l']) {
      const cap = byId.get(id);
      if (cap) hit(hand.id, id, 'hand', hand.r + cap.r - segmentDistance(hand.p, hand.q, cap.p, cap.q));
    }
  }
  return [...hits.values()].sort((x, y) => y.depthM - x.depthM);
}

/** Limite de profundidade (m) por tipo de contato no teste de dados. */
export const PENETRATION_LIMIT: Readonly<Record<ContactKind, number>> = { block: 0.02, hand: 0.02, bar: 0.015, floor: 0.01 };
