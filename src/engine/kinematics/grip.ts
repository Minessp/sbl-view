/**
 * Mão que fecha: dobra dos dedos no vértice, em espaço da mão na pose de ligação, antes do skinning.
 * Referência pura do shader (`scene/body/material.ts` repete a conta em GLSL; mexer nos dois juntos).
 *
 * Quadro da mão (lado direito): origem no centro do punho, `s` ao longo do eixo punho → ponta do 3º dedo, `h` para a
 * palma (lado da flexão), `w` para o polegar. Cada dedo tem três juntas (MCF, IFP, IFD) medidas na malha óssea; a linha de
 * dobra passa por elas e, entre dois dedos, é interpolada pela posição `w` do vértice. A dobra é uma rotação no plano
 * (s, h) em torno do centro da junta, aplicada da ponta para a base (o pivô de cada junta ainda está na ligação quando
 * ela entra) e com entrada suave de ±6 mm em volta da linha (sem vinco). O polegar gira inteiro em torno de um eixo pela
 * base do 1º metacarpo (oposição), com máscara pela distância ao raio ósseo medida no plano da palma (a profundidade não
 * conta: músculo e pele por cima dele giram igual e um não fura o outro).
 */
import type { SkeletonDef } from '@/data/schema/skeleton';
import { add, cross, DEG, dot, normalize, scale, sub, type Vec3 } from '@/engine/math/vec';
import { at } from '@/engine/math/arr';

export interface HandSpec {
  /** Centro do punho na ligação (origem do segmento `hand_r`). */
  readonly origin: Vec3;
  /** Unitário, punho → ponta do 3º dedo. */
  readonly axis: Vec3;
  /** Unitário, normal da palma (para onde os dedos fletem). */
  readonly palm: Vec3;
  /** Centros das juntas, um por dedo: indicador, médio, anelar, mínimo. */
  readonly mcp: readonly Vec3[];
  readonly pip: readonly Vec3[];
  readonly dip: readonly Vec3[];
  readonly thumb: { readonly base: Vec3; readonly tip: Vec3; readonly axis: Vec3 };
}

/** Ângulos de cada junta com a mão fechada (g = 1), graus. */
export const GRIP_DEG = { mcp: 70, pip: 85, dip: 45, thumb: 40 } as const;
/** Meia largura da entrada da dobra em volta da linha (m). */
export const FOLD_HALF = 0.006;
/** Máscara do polegar: distância ao raio ósseo no plano da palma (m) em que a rotação começa a cair e em que some. */
export const THUMB_MASK = [0.01, 0.018] as const;

export function handSpec(def: SkeletonDef): HandSpec {
  const seg = def.segments.find((s) => s.id === 'hand_r');
  if (!seg || !def.hand) throw new Error('skeleton.json sem mão');
  const h = def.hand;
  return { origin: seg.origin, axis: normalize(h.axis), palm: normalize(h.palm), mcp: h.mcp, pip: h.pip, dip: h.dip, thumb: { ...h.thumb, axis: normalize(h.thumb.axis) } };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Quadro (s, w, h) da mão. */
export function handFrame(hand: HandSpec) {
  const across = normalize(cross(hand.palm, hand.axis));
  // `w` positivo para o polegar.
  const w = dot(sub(hand.thumb.base, hand.origin), across) >= dot(sub(at(hand.mcp, 3), hand.origin), across) ? across : scale(across, -1);
  const local = (p: Vec3): Vec3 => {
    const q = sub(p, hand.origin);
    return [dot(q, hand.axis), dot(q, w), dot(q, hand.palm)];
  };
  const world = (l: Vec3): Vec3 => add(hand.origin, add(scale(hand.axis, l[0]), add(scale(w, l[1]), scale(hand.palm, l[2]))));
  return { across: w, local, world };
}

/** Distância no plano da palma (s, w) de p ao segmento a–b (em quadro local): pele e músculo da mesma coluna têm a mesma máscara. */
function planeDist(p: Vec3, a: Vec3, b: Vec3) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const px = p[0] - a[0];
  const py = p[1] - a[1];
  const t = Math.min(Math.max((px * bx + py * by) / (bx * bx + by * by), 0), 1);
  return Math.hypot(px - bx * t, py - by * t);
}

/** Centro da junta (s, h) na posição `w`, interpolado entre os dedos vizinhos (ordenados do indicador ao mínimo). */
function jointAt(js: readonly Vec3[], w: number): [number, number] {
  // js em quadro local: w decresce do indicador ao mínimo.
  const n = js.length;
  if (w >= at(js, 0)[1]) return [at(js, 0)[0], at(js, 0)[2]];
  for (let i = 0; i + 1 < n; i++) {
    const a = at(js, i);
    const b = at(js, i + 1);
    if (w >= b[1]) {
      const t = (a[1] - w) / (a[1] - b[1]);
      return [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  const z = at(js, n - 1);
  return [z[0], z[2]];
}

function rotateAxis(p: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = axis;
  const kxp = cross(k, p);
  const kd = dot(k, p);
  return [p[0] * c + kxp[0] * s + k[0] * kd * (1 - c), p[1] * c + kxp[1] * s + k[1] * kd * (1 - c), p[2] * c + kxp[2] * s + k[2] * kd * (1 - c)];
}

/** Dados pré-calculados para muitas chamadas (o shader recebe o mesmo em uniforms). */
export function gripRig(hand: HandSpec) {
  const f = handFrame(hand);
  const folds = (['dip', 'pip', 'mcp'] as const).map((k) => ({ joints: hand[k].map(f.local), angle: GRIP_DEG[k] * DEG }));
  const thumb = { base: hand.thumb.base, tip: hand.thumb.tip, axis: hand.thumb.axis, angle: GRIP_DEG.thumb * DEG, baseL: f.local(hand.thumb.base), tipL: f.local(hand.thumb.tip) };
  return { ...f, folds, thumb };
}
export type GripRig = ReturnType<typeof gripRig>;

/** Vértice da mão direita (ligação, m) com a mão fechada `g` (0 aberta … 1 fechada). */
export function gripBend(p: Vec3, g: number, hand: HandSpec | GripRig): Vec3 {
  const rig = 'folds' in hand ? hand : gripRig(hand);
  if (g <= 0) return p;
  const l0 = rig.local(p);
  const m = 1 - smoothstep(THUMB_MASK[0], THUMB_MASK[1], planeDist(l0, rig.thumb.baseL, rig.thumb.tipL));
  let s = l0[0];
  let h = l0[2];
  for (const fold of rig.folds) {
    const [sj, hj] = jointAt(fold.joints, l0[1]);
    const phi = fold.angle * g * (1 - m) * smoothstep(-FOLD_HALF, FOLD_HALF, l0[0] - sj);
    const ds = s - sj;
    const dh = h - hj;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    s = sj + ds * c - dh * sn;
    h = hj + ds * sn + dh * c;
  }
  const q = rig.world([s, l0[1], h]);
  if (m <= 0) return q;
  return add(rig.thumb.base, rotateAxis(sub(q, rig.thumb.base), rig.thumb.axis, rig.thumb.angle * g * m));
}
