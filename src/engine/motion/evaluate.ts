/**
 * Avalia um clipe de movimento num instante da repetição: graus → apoio (raiz) → IK das pernas → IK dos braços (com ritmo
 * escapuloumeral) → FK final, mais o equipamento e o vetor da carga no mundo. Puro e determinístico.
 */
import type { Angle, Equipment, MotionClip, Place, Reach, StationId } from '@/data/schema/motion';
import { MIDFOOT_AHEAD_OF_ANKLE } from '../exercises/squat';
import { forwardKinematics, pointToWorld } from '../kinematics/fk';
import { mirrorId } from '../kinematics/skeleton';
import type { EngineSkeleton, Pose } from '../kinematics/types';
import { must } from '../math/arr';
import {
  add,
  angleBetween,
  cross,
  DEG,
  distance,
  length,
  lerp,
  mirrorX,
  normalize,
  quatConj,
  quatFromAxisAngle,
  quatMul,
  QUAT_IDENTITY,
  rotate,
  scale,
  sub,
  type Quat,
  type Transform,
  type Vec3,
} from '../math/vec';
import { centerOfMass, type PointMass } from '../statics/mass';
import { anglesFromRotation, chainOf, solveTwoBone, type TwoBoneChain } from './ik';
import { evalCurve, evalPath, makeCurve, makePath, type Curve, type PathCurve } from './keys';

/** Centro da palma na pose neutra (mundo, lado direito): 45% do punho à ponta da mão, um pouco à frente. */
export function defaultGrip(sk: EngineSkeleton): Vec3 {
  const hand = must(sk.byId, 'hand_r', 'segmento');
  const o = must(sk.neutralOrigin, 'hand_r', 'segmento');
  return add(add(o, scale(hand.tip, 0.45)), [0, 0, 0.012 * (sk.stature / 1.75)]);
}

/**
 * Ritmo escapuloumeral: depois de 30° de elevação do braço, a cintura escapular soma 0,4° por grau (a relação clássica de
 * ~2:1 entre glenoumeral e escapulotorácica; Ludewig 2009, a verificar), metade na clavícula e metade na escápula.
 */
export const RHYTHM = { startDeg: 30, ratio: 0.4 } as const;

const curveOf = (a: Angle): Curve => makeCurve(typeof a === 'number' ? [{ u: 0, v: a }] : a.map((k) => ({ u: k.u, v: k.deg })));

/** Ponto fixo ou caminho: o caminho vira curva; o ponto fixo fica como está. */
type CompiledPlace = { readonly fixed: Vec3 } | { readonly path: PathCurve };
const placeOf = (p: Place): CompiledPlace => (p.length > 0 && typeof p[0] === 'number' ? { fixed: p as Vec3 } : { path: makePath(p as { u: number; p: Vec3 }[]) });
const placeAt = (c: CompiledPlace, u: number): Vec3 => ('fixed' in c ? c.fixed : evalPath(c.path, u));

interface CompiledReach {
  readonly spec: Reach;
  readonly sides: readonly ('r' | 'l')[];
  readonly chains: Readonly<Record<'r' | 'l', TwoBoneChain>>;
  readonly path: PathCurve | null;
  /** Alvo do pé (perna). */
  readonly ball: CompiledPlace | null;
  readonly pitch: Curve | null;
  readonly yaw: Curve | null;
}

export interface CompiledClip {
  readonly clip: MotionClip;
  readonly sk: EngineSkeleton;
  readonly hold: Readonly<Record<string, number>>;
  readonly tracks: readonly { readonly dof: string; readonly curve: Curve }[];
  readonly pitch: Curve | null;
  /** Onde a raiz presa fica (modo `pin`). */
  readonly rootAt: CompiledPlace | null;
  readonly legs: readonly CompiledReach[];
  readonly arms: readonly CompiledReach[];
  /** Pegada no frame da mão (por lado). */
  readonly grip: Readonly<Record<'r' | 'l', Vec3>>;
  readonly masses: readonly PointMass[];
  /** Barra segura pelas duas mãos: pegada supinada (palmas para cima/à frente) ou pronada, por lado. Sem barra: null. */
  readonly bar: Readonly<Record<'r' | 'l', boolean>> | null;
  /** Quanto cada mão fecha (0 espalmada … 1 fechada). */
  readonly fingers: Readonly<Record<'r' | 'l', number>>;
}

/** Mão fechada no implemento; corda pede um pouco mais; mão solta meio aberta; espalmada no chão ou no banco. */
export const FINGERS = { grip: 0.85, rope: 0.9, loose: 0.15, flat: 0 } as const;

/**
 * Quanto a mão fecha, pelo que ela segura: barra, halter, pegador ou barra fixa = fechada; corda um pouco mais; braço
 * sem alvo ou pendurado sem implemento = solta; alvo de caminho sem implemento: pegador de máquina ou barras paralelas
 * fecham, o resto (chão, banco) fica espalmado. `clip.fingers` sobrescreve.
 */
function fingersOf(clip: MotionClip): Record<'r' | 'l', number> {
  const holds = (s: 'r' | 'l'): number | null => {
    for (const e of clip.equipment) {
      if (e.kind === 'barbell') return FINGERS.grip;
      if (e.kind === 'dumbbell' && (s === 'r' || e.hands !== 'r')) return FINGERS.grip;
      if (e.kind === 'cable' && (s === 'r' || e.handle !== 'single')) return e.handle === 'rope' ? FINGERS.rope : FINGERS.grip;
    }
    return null;
  };
  const machine = clip.equipment.some((e) => e.kind === 'pad' || e.kind === 'rail' || e.kind === 'swing');
  const of = (s: 'r' | 'l') => {
    const held = holds(s);
    if (held !== null) return held;
    const arm = clip.reach.find((r) => r.limb === 'arm' && (r.side === 'both' || r.side === s));
    if (!arm || arm.target.kind === 'hang') return FINGERS.loose;
    if (arm.target.kind === 'path' && (machine || clip.support === 'hanging')) return FINGERS.grip;
    return FINGERS.flat;
  };
  return { r: clip.fingers?.r ?? of('r'), l: clip.fingers?.l ?? of('l') };
}

/** Nome de DOF do dado → ids do esqueleto (sem lado = os dois). */
function sided(ids: ReadonlySet<string>, id: string): string[] {
  if (ids.has(id)) return [id];
  if (ids.has(`${id}_r`)) return [`${id}_r`, `${id}_l`];
  throw new Error(`DOF desconhecido no clipe: ${id}`);
}

/** Ponto da pose neutra (mundo) → frame local do segmento, com espelho para o lado esquerdo. */
function localOf(sk: EngineSkeleton, segment: string, worldNeutral: Vec3, side: 'r' | 'l'): { segment: string; local: Vec3 } {
  const seg = side === 'l' ? mirrorId(segment) : segment;
  const p = side === 'l' ? mirrorX(worldNeutral) : worldNeutral;
  return {
    segment: seg,
    local: sub(p, must(sk.neutralOrigin, seg, 'segmento')),
  };
}

export function compileClip(clip: MotionClip, sk: EngineSkeleton, masses: readonly PointMass[] = []): CompiledClip {
  const ids = new Set(sk.segments.flatMap((s) => s.dofs.map((d) => d.id)));
  const hold: Record<string, number> = {};
  for (const [id, v] of Object.entries(clip.hold)) for (const d of sided(ids, id)) hold[d] = v;
  const tracks = clip.tracks.flatMap((t) => {
    const curve = curveOf(t.keys);
    return sided(ids, t.dof).map((dof) => ({ dof, curve }));
  });
  const reach = (r: Reach): CompiledReach => {
    const [top, mid] = r.limb === 'arm' ? ['upperarm', 'forearm'] : ['thigh', 'shank'];
    return {
      spec: r,
      sides: r.side === 'both' ? ['r', 'l'] : [r.side],
      chains: {
        r: chainOf(sk, `${top}_r`, `${mid}_r`),
        l: chainOf(sk, `${top}_l`, `${mid}_l`),
      },
      path: r.target.kind === 'path' ? makePath(r.target.keys) : null,
      ball: r.target.kind === 'ball' ? placeOf(r.target.point) : null,
      pitch: r.target.kind === 'ball' ? curveOf(r.target.pitch ?? 0) : null,
      yaw: r.target.kind === 'ball' && r.target.yaw !== undefined ? curveOf(r.target.yaw) : null,
    };
  };
  const g = clip.grip ?? defaultGrip(sk);
  const hasBar = clip.equipment.some((e) => e.kind === 'barbell' || (e.kind === 'cable' && e.handle === 'bar' && !e.mirror));
  const supinated = (s: 'r' | 'l') => (hold[`forearm_pro_${s}`] ?? 0) < 80;
  return {
    clip,
    sk,
    hold,
    tracks,
    pitch: clip.root.mode === 'pin' && clip.root.pitch !== undefined ? curveOf(clip.root.pitch) : null,
    rootAt: clip.root.mode === 'pin' ? placeOf(clip.root.at) : null,
    legs: clip.reach.filter((r) => r.limb === 'leg').map(reach),
    arms: clip.reach.filter((r) => r.limb === 'arm').map(reach),
    grip: {
      r: localOf(sk, 'hand_r', g, 'r').local,
      l: localOf(sk, 'hand_r', g, 'l').local,
    },
    masses,
    bar: hasBar ? { r: supinated('r'), l: supinated('l') } : null,
    fingers: fingersOf(clip),
  };
}

/**
 * Pegada na barra: a pronação gira a mão até o eixo da palma (do polegar ao mínimo) ficar ao longo da barra. Supinada:
 * o mínimo aponta para a outra mão (rosca); pronada: para fora (supino, remada). Flexão e desvio do punho ficam como estão.
 */
function alignBarGrip(c: CompiledClip, pose: Pose, rad: Record<string, number>): boolean {
  if (!c.bar) return false;
  let changed = false;
  for (const side of ['r', 'l'] as const) {
    const hand = must(c.sk.byId, `hand_${side}`, 'segmento');
    const [pro, flex, dev] = hand.dofs;
    if (!pro || !flex || !dev) continue;
    const other = side === 'r' ? 'l' : 'r';
    const g = (s: 'r' | 'l') => pointToWorld(pose, `hand_${s}`, c.grip[s]);
    const toOther = normalize(sub(g(other), g(side)));
    const want = c.bar[side] ? toOther : scale(toOther, -1);
    const forearm = must(pose.world, `forearm_${side}`, 'segmento');
    const t = rotate(quatConj(forearm.rotation), want);
    const rest = quatMul(quatFromAxisAngle(flex.axis, (rad[flex.id] ?? 0) * flex.sign), quatFromAxisAngle(dev.axis, (rad[dev.id] ?? 0) * dev.sign));
    const w = rotate(rest, [side === 'r' ? 1 : -1, 0, 0]);
    if (Math.hypot(t[0], t[2]) < 0.2) continue;
    const phi = Math.atan2(t[0], t[2]) - Math.atan2(w[0], w[2]);
    // Fora da amplitude, fica a ponta que deixa o eixo mais perto do pedido (não a que só passa menos da faixa).
    let best = rad[pro.id] ?? 0,
      miss = Infinity;
    for (const k of [-2, -1, 0, 1, 2]) {
      const v = Math.min(pro.max, Math.max(pro.min, (phi + k * 2 * Math.PI) / pro.sign));
      const d = v * pro.sign - phi;
      const m = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
      if (m < miss - 1e-9) {
        miss = m;
        best = v;
      }
    }
    if (Math.abs(best - (rad[pro.id] ?? 0)) > 1e-6) changed = true;
    rad[pro.id] = best;
  }
  return changed;
}

export type ResolvedEquipment =
  | {
      readonly kind: 'barbell';
      readonly center: Vec3;
      readonly axis: Vec3;
      readonly plates: number;
      readonly bar: 'olympic' | 'curl' | 'fixed';
    }
  | { readonly kind: 'rail'; readonly from: Vec3; readonly to: Vec3; readonly gauge: number }
  | { readonly kind: 'swing'; readonly pivot: Vec3; readonly end: Vec3 }
  | { readonly kind: 'dumbbell'; readonly center: Vec3; readonly axis: Vec3; readonly style: 'round' | 'hex' }
  | {
      readonly kind: 'station';
      readonly id: StationId;
      readonly at: Vec3 | undefined;
      readonly yaw: number;
      readonly params: Readonly<Record<string, number>>;
    }
  | {
      readonly kind: 'cable';
      readonly grips: readonly Vec3[];
      readonly pulley: Vec3;
      readonly handle: 'bar' | 'rope' | 'v' | 'single';
      readonly axis: Vec3;
      /** Um de um par espelhado (cada mão na sua roldana). */
      readonly mirror: boolean;
    }
  | {
      readonly kind: 'block';
      readonly role: string;
      readonly center: Vec3;
      readonly size: Vec3;
      readonly pitch: number;
      /** Anda com um segmento (o renderizador atualiza a cada quadro). */
      readonly moving: boolean;
    }
  | {
      readonly kind: 'pad';
      readonly centers: readonly Vec3[];
      readonly pivot: Vec3 | null;
    };

export interface MotionFrame {
  readonly u: number;
  /** Graus finais por DOF (com lado), antes do limite do FK: o teste confere a amplitude. */
  readonly deg: Readonly<Record<string, number>>;
  readonly pose: Pose;
  /** Raiz dada ao FK (antes dos DOFs da pelve): com `deg`, refaz a pose (mistura entre rotas). */
  readonly root: Transform;
  readonly grips: Readonly<Record<'r' | 'l', Vec3>>;
  /** Quanto cada mão fecha (0 espalmada … 1 fechada). */
  readonly fingers: Readonly<Record<'r' | 'l', number>>;
  readonly equipment: readonly ResolvedEquipment[];
  /** Ponto de aplicação e direção (unitária) da carga. */
  readonly load: { readonly point: Vec3; readonly dir: Vec3 } | null;
  /** Pontos do corpo apoiados no chão (sombra de contato). */
  readonly contacts: readonly Vec3[];
  /** Maior distância (m) entre ponta e alvo das restrições. */
  readonly error: number;
}

const toRad = (deg: Readonly<Record<string, number>>) => Object.fromEntries(Object.entries(deg).map(([k, v]) => [k, v * DEG]));
const toDeg = (rad: Readonly<Record<string, number>>) => Object.fromEntries(Object.entries(rad).map(([k, v]) => [k, v / DEG]));

/** Ângulo (rad) de uma rotação em torno de X (supõe rotação pura em X). */
const xAngle = (q: readonly [number, number, number, number]) => 2 * Math.atan2(q[0], q[3]);

/** Pose com a raiz já posicionada (apoio). */
function placeRoot(c: CompiledClip, rad: Readonly<Record<string, number>>, u: number): Transform {
  const sk = c.sk;
  const base: Transform = {
    position: must(sk.neutralOrigin, 'pelvis', 'segmento'),
    rotation: QUAT_IDENTITY,
  };
  const root = c.clip.root;
  if (root.mode === 'plant') {
    // Só a parte sagital da âncora: o pé direito volta à inclinação e à altura/profundidade neutras. Com abdução
    // simétrica, a âncora rígida rolaria o corpo inteiro; assim a pelve fica no meio e de nível.
    const raw = forwardKinematics(sk, rad, { clampToRom: false, root: base });
    const foot = must(raw.world, 'foot_r', 'segmento');
    const f = rotate(foot.rotation, [0, 0, 1]);
    const dq = quatFromAxisAngle([1, 0, 0], Math.atan2(f[1], Math.hypot(f[0], f[2])));
    const p = rotate(dq, sub(foot.position, base.position));
    const n = must(sk.neutralOrigin, 'foot_r', 'segmento');
    return {
      position: [base.position[0], n[1] - p[1], n[2] - p[2]],
      rotation: dq,
    };
  }
  const pitch = c.pitch ? evalCurve(c.pitch, u) : 0;
  const rotated: Transform = {
    position: base.position,
    rotation: quatFromAxisAngle([1, 0, 0], pitch * DEG),
  };
  const raw = forwardKinematics(sk, rad, { clampToRom: false, root: rotated });
  const { segment, local } = localOf(sk, root.segment, root.point, 'r');
  const p = pointToWorld(raw, segment, local);
  const at = c.rootAt ? placeAt(c.rootAt, u) : p;
  return {
    position: add(rotated.position, sub(at, p)),
    rotation: rotated.rotation,
  };
}

/** Raio (m) da frente da coxa e da canela até a linha do osso, perto da ponta proximal e da distal (malha, de perfil). */
const LEG_FRONT = { thigh: [0.085, 0.06], shank: [0.05, 0.035] } as const;
/** Raio da barra olímpica + folga até a pele. */
const BAR_CLEAR = 0.02;

/** Frente da perna (z) na altura y: a linha da coxa ou da canela mais o raio da frente. Fora da perna: −∞. */
function legFront(pose: Pose, side: 'r' | 'l', y: number): number {
  let z = -Infinity;
  for (const seg of ['thigh', 'shank'] as const) {
    const t = must(pose.world, `${seg}_${side}`, 'segmento');
    const next = must(pose.world, `${seg === 'thigh' ? 'shank' : 'foot'}_${side}`, 'segmento');
    const a = t.position,
      b = next.position;
    if ((y - a[1]) * (y - b[1]) > 0 || Math.abs(a[1] - b[1]) < 1e-6) continue;
    const k = (y - a[1]) / (b[1] - a[1]);
    const [r0, r1] = LEG_FRONT[seg];
    z = Math.max(z, a[2] + (b[2] - a[2]) * k + r0 + (r1 - r0) * k);
  }
  return z;
}

/**
 * Pegada no prumo: na vertical sobre o meio do pé, à distância do ombro que o braço tem; se a perna estiver mais à
 * frente nessa altura, a barra encosta nela.
 */
function plumbTarget(c: CompiledClip, pose: Pose, side: 'r' | 'l', shoulder: Vec3, reach: number, ahead: number): Vec3 {
  const ankle = must(pose.world, `foot_${side}`, 'segmento').position;
  const z0 = ankle[2] + MIDFOOT_AHEAD_OF_ANKLE * (c.sk.stature / 1.75) + ahead;
  let z = z0,
    y = shoulder[1] - reach;
  for (let i = 0; i < 4; i++) {
    const dz = z - shoulder[2];
    y = shoulder[1] - Math.sqrt(Math.max(0, reach * reach - dz * dz));
    z = Math.max(z0, legFront(pose, side, y) + BAR_CLEAR);
  }
  return [shoulder[0], y, z];
}

function solveFrame(c: CompiledClip, u: number, ankleOffset: number) {
  const sk = c.sk;
  const deg: Record<string, number> = { ...c.hold };
  for (const t of c.tracks) deg[t.dof] = evalCurve(t.curve, u);
  if (ankleOffset !== 0) for (const s of ['r', 'l']) deg[`ankle_dorsi_${s}`] = (deg[`ankle_dorsi_${s}`] ?? 0) + ankleOffset;
  const rad: Record<string, number> = toRad(deg);
  const root = placeRoot(c, rad, u);
  const fk = () => forwardKinematics(sk, rad, { clampToRom: false, root });
  let pose = fk();
  let error = 0;

  // ---- Pernas: cabeça dos metatarsos num ponto, pé com a inclinação e a abertura pedidas ----
  // O eixo do joelho segue o do pé; o pé (dorsiflexão, inversão, adução) gira até a orientação pedida e o que ele erra
  // (amplitude) volta ao alvo do tornozelo.
  const feet: {
    side: 'r' | 'l';
    ball: Vec3;
    q: Quat;
    hinge: Vec3;
    chain: TwoBoneChain;
    ankle: Vec3;
    pole: Vec3;
  }[] = [];
  for (const r of c.legs) {
    const tg = r.spec.target;
    if (tg.kind !== 'ball') throw new Error(`Perna só aceita alvo "ball" (${c.clip.id})`);
    const pitchQ = quatFromAxisAngle([1, 0, 0], (r.pitch ? evalCurve(r.pitch, u) : 0) * DEG);
    const yaw = (r.yaw ? evalCurve(r.yaw, u) : 0) * DEG;
    for (const side of r.sides) {
      // Abertura: + = ponta do pé para fora (direito para −X, esquerdo para +X).
      const yawQ = quatFromAxisAngle([0, 1, 0], side === 'r' ? -yaw : yaw);
      const q = quatMul(yawQ, pitchQ);
      const foot = must(sk.byId, `foot_${side}`, 'segmento');
      const pt = r.ball ? placeAt(r.ball, u) : [0, 0, 0] as Vec3;
      const ball = side === 'l' ? mirrorX(pt) : pt;
      feet.push({
        side,
        ball,
        q,
        hinge: rotate(yawQ, [1, 0, 0]),
        chain: r.chains[side],
        ankle: sub(ball, rotate(q, foot.tip)),
        pole: side === 'l' ? mirrorX(r.spec.pole) : r.spec.pole,
      });
    }
  }
  const tipOf = (side: 'r' | 'l') => must(sk.byId, `foot_${side}`, 'segmento').tip;
  for (let it = 0; it < (feet.length ? 4 : 0); it++) {
    for (const f of feet) {
      const res = solveTwoBone(f.chain, pose, must(sk.byId, `foot_${f.side}`, 'segmento').jointOffset, f.ankle, f.pole, rad, f.hinge);
      Object.assign(rad, res.angles);
    }
    pose = fk();
    for (const f of feet) {
      const shank = must(pose.world, `shank_${f.side}`, 'segmento');
      Object.assign(rad, anglesFromRotation(must(sk.byId, `foot_${f.side}`, 'segmento'), quatMul(quatConj(shank.rotation), f.q)));
    }
    pose = fk();
    for (const f of feet) f.ankle = add(f.ankle, sub(f.ball, pointToWorld(pose, `foot_${f.side}`, tipOf(f.side))));
  }
  for (const f of feet) error = Math.max(error, distance(pointToWorld(pose, `foot_${f.side}`, tipOf(f.side)), f.ball));

  // ---- Pés plantados sem alvo: a planta assenta no chão (sem rolar com a abdução), a ponta segue a rotação do quadril ----
  if (c.clip.root.mode === 'plant') {
    const free = (['r', 'l'] as const).filter((s) => !feet.some((f) => f.side === s));
    for (const side of free) {
      const foot = must(pose.world, `foot_${side}`, 'segmento');
      const fwd = rotate(foot.rotation, [0, 0, 1]);
      const flat = quatFromAxisAngle([0, 1, 0], Math.atan2(fwd[0], fwd[2]));
      const shank = must(pose.world, `shank_${side}`, 'segmento');
      Object.assign(rad, anglesFromRotation(must(sk.byId, `foot_${side}`, 'segmento'), quatMul(quatConj(shank.rotation), flat)));
    }
    if (free.length) pose = fk();
  }

  // ---- Braços: duas passadas (a cintura escapular acompanha a elevação e o IK refaz) ----
  const gripWorld = (p: Pose, side: 'r' | 'l') => pointToWorld(p, `hand_${side}`, c.grip[side]);
  const targets: { side: 'r' | 'l'; target: Vec3 }[] = [];
  if (c.arms.length) {
    const girdle0: Record<string, number> = {};
    for (const s of ['r', 'l']) for (const d of [`clav_elev_${s}`, `scap_uprot_${s}`]) girdle0[d] = rad[d] ?? 0;
    for (let pass = 0; pass < 3; pass++) {
      targets.length = 0;
      for (const r of c.arms) {
        for (const side of r.sides) {
          const tg = r.spec.target;
          const shoulder = must(pose.world, `upperarm_${side}`, 'segmento').position;
          let target: Vec3;
          if (tg.kind === 'path' && r.path) target = side === 'l' ? mirrorX(evalPath(r.path, u)) : evalPath(r.path, u);
          else if (tg.kind === 'attach') {
            const a = localOf(sk, tg.segment, tg.point, side);
            target = pointToWorld(pose, a.segment, a.local);
          } else if (tg.kind === 'hang') target = sub(shoulder, [0, distance(shoulder, gripWorld(pose, side)), 0]);
          else if (tg.kind === 'plumb') target = plumbTarget(c, pose, side, shoulder, distance(shoulder, gripWorld(pose, side)), tg.ahead ?? 0);
          else throw new Error(`Braço não aceita alvo "${tg.kind}" (${c.clip.id})`);
          const forearm = must(pose.world, `forearm_${side}`, 'segmento');
          const endLocal = rotate(quatConj(forearm.rotation), sub(gripWorld(pose, side), forearm.position));
          const pole = side === 'l' ? mirrorX(r.spec.pole) : r.spec.pole;
          Object.assign(rad, solveTwoBone(r.chains[side], pose, endLocal, target, pole, rad).angles);
          targets.push({ side, target });
        }
      }
      pose = fk();
      if (pass === 2) break;
      // Ritmo: elevação do braço em relação ao tórax.
      for (const { side } of targets) {
        const arm = sub(must(pose.world, `forearm_${side}`, 'segmento').position, must(pose.world, `upperarm_${side}`, 'segmento').position);
        const down = rotate(must(pose.world, 'trunk', 'segmento').rotation, [0, -1, 0]);
        const elev = angleBetween(arm, down) / DEG;
        const extra = Math.max(0, elev - RHYTHM.startDeg) * RHYTHM.ratio * 0.5 * DEG;
        rad[`clav_elev_${side}`] = (girdle0[`clav_elev_${side}`] ?? 0) + extra;
        rad[`scap_uprot_${side}`] = (girdle0[`scap_uprot_${side}`] ?? 0) + extra;
      }
      pose = fk();
      if (alignBarGrip(c, pose, rad)) pose = fk();
    }
    for (const t of targets) error = Math.max(error, distance(gripWorld(pose, t.side), t.target));
  }

  // Braços só por FK (rosca em pé): a barra segue as mãos, a pegada alinha uma vez.
  if (!c.arms.length && alignBarGrip(c, pose, rad)) pose = fk();

  const grips = { r: gripWorld(pose, 'r'), l: gripWorld(pose, 'l') };
  return { deg: toDeg(rad), rad, root, pose, grips, error };
}

function resolveEquipment(c: CompiledClip, pose: Pose, grips: Readonly<Record<'r' | 'l', Vec3>>, eq: Equipment): ResolvedEquipment[] {
  const sk = c.sk;
  const handAxis = (side: 'r' | 'l') => rotate(must(pose.world, `hand_${side}`, 'segmento').rotation, [1, 0, 0]);
  const both = c.arms.some((a) => a.sides.length === 2) || c.clip.equipment.some((e) => e.kind === 'barbell');
  switch (eq.kind) {
    case 'barbell':
      return [
        {
          kind: 'barbell',
          center: lerp(grips.r, grips.l, 0.5),
          axis: normalize(sub(grips.l, grips.r)),
          plates: eq.plates,
          bar: eq.bar ?? (eq.plates > 0 ? 'olympic' : 'curl'),
        },
      ];
    case 'rail':
      return [{ kind: 'rail', from: eq.from, to: eq.to, gauge: eq.gauge }];
    case 'swing': {
      const a = localOf(sk, eq.segment, eq.point, 'r');
      return [{ kind: 'swing', pivot: eq.pivot, end: pointToWorld(pose, a.segment, a.local) }];
    }
    case 'dumbbell':
      return (eq.hands === 'r' ? (['r'] as const) : (['r', 'l'] as const)).map((s) => ({
        kind: 'dumbbell',
        center: grips[s],
        axis: handAxis(s),
        style: eq.style ?? 'round',
      }));
    case 'station':
      return [{ kind: 'station', id: eq.id, at: eq.at, yaw: eq.yaw ?? 0, params: eq.params ?? {} }];
    case 'cable': {
      const axis = normalize(sub(grips.l, grips.r));
      if (eq.mirror)
        return (['r', 'l'] as const).map((s) => ({
          kind: 'cable',
          grips: [grips[s]],
          pulley: s === 'l' ? mirrorX(eq.pulley) : eq.pulley,
          handle: 'single',
          axis,
          mirror: true,
        }));
      return [
        {
          kind: 'cable',
          grips: eq.handle === 'single' ? [grips.r] : both || eq.handle !== 'bar' ? [grips.r, grips.l] : [grips.r],
          pulley: eq.pulley,
          handle: eq.handle,
          axis,
          mirror: false,
        },
      ];
    }
    case 'block': {
      if (eq.segment) {
        const a = localOf(sk, eq.segment, eq.center, 'r');
        const rot = must(pose.world, a.segment, 'segmento').rotation;
        return [
          {
            kind: 'block',
            role: eq.role,
            center: pointToWorld(pose, a.segment, a.local),
            size: eq.size,
            pitch: xAngle(rot) / DEG + (eq.pitch ?? 0),
            moving: true,
          },
        ];
      }
      return [
        {
          kind: 'block',
          role: eq.role,
          center: eq.center,
          size: eq.size,
          pitch: eq.pitch ?? 0,
          moving: false,
        },
      ];
    }
    case 'pad': {
      const sides = eq.both ? (['r', 'l'] as const) : (['r'] as const);
      const centers = sides.map((s) => {
        const a = localOf(sk, eq.segment, eq.point, s);
        return pointToWorld(pose, a.segment, a.local);
      });
      const seg = eq.segment;
      const joint = pointToWorld(pose, seg, [0, 0, 0]);
      return [
        {
          kind: 'pad',
          centers,
          pivot: eq.lever ? [eq.both ? joint[0] : (centers[0]?.[0] ?? joint[0]), joint[1], joint[2]] : null,
        },
      ];
    }
  }
}

/** Pontos do pé perto do chão (tornozelo e ponta), para a sombra. */
function contactsOf(sk: EngineSkeleton, pose: Pose): Vec3[] {
  const out: Vec3[] = [];
  for (const s of ['r', 'l'] as const) {
    const foot = must(sk.byId, `foot_${s}`, 'segmento');
    for (const p of [pointToWorld(pose, foot.id, [0, 0, 0]), pointToWorld(pose, foot.id, foot.tip)]) if (p[1] < 0.15) out.push(p);
  }
  return out;
}

function frameAt(c: CompiledClip, u: number): ReturnType<typeof solveFrame> {
  const bal = c.clip.balance;
  if (!bal || c.clip.root.mode !== 'plant') return solveFrame(c, u, 0);
  // Equilíbrio: o centro de massa (corpo + carga nas mãos) sobre o meio do pé. Mais dorsiflexão = corpo à frente.
  const k = c.sk.stature / 1.75;
  const target = must(c.sk.neutralOrigin, 'foot_r', 'segmento')[2] + MIDFOOT_AHEAD_OF_ANKLE * k;
  const load: PointMass[] =
    bal.massKg > 0
      ? (['r', 'l'] as const).map((s) => ({
          id: `load_${s}`,
          segment: `hand_${s}`,
          local: c.grip[s],
          mass: bal.massKg / 2,
        }))
      : [];
  const ms = [...c.masses, ...load];
  const f = (off: number) => {
    const fr = solveFrame(c, u, off);
    return { fr, z: centerOfMass(fr.pose, ms)[2] - target };
  };
  let [lo, hi] = bal.rangeDeg;
  const a = f(lo);
  if (a.z >= 0) return a.fr;
  const b = f(hi);
  if (b.z <= 0) return b.fr;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid).z < 0) lo = mid;
    else hi = mid;
  }
  return f((lo + hi) / 2).fr;
}

export function evaluateClip(c: CompiledClip, u: number): MotionFrame {
  const fr = frameAt(c, u);
  const equipment = c.clip.equipment.flatMap((e) => resolveEquipment(c, fr.pose, fr.grips, e));
  return {
    u,
    deg: fr.deg,
    pose: fr.pose,
    root: fr.root,
    grips: fr.grips,
    fingers: c.fingers,
    equipment,
    load: loadOf(c, u, fr, equipment),
    contacts: contactsOf(c.sk, fr.pose),
    error: fr.error,
  };
}

function loadOf(c: CompiledClip, u: number, fr: ReturnType<typeof solveFrame>, eq: readonly ResolvedEquipment[]): MotionFrame['load'] {
  const L = c.clip.load;
  const handle =
    c.arms.some((a) => a.sides.length === 2) || eq.some((e) => e.kind === 'barbell' || (e.kind === 'cable' && e.grips.length === 2))
      ? lerp(fr.grips.r, fr.grips.l, 0.5)
      : fr.grips.r;
  if (L.kind === 'gravity') {
    if (L.segment && L.point) {
      const a = localOf(c.sk, L.segment, L.point, 'r');
      return {
        point: pointToWorld(fr.pose, a.segment, a.local),
        dir: [0, -1, 0],
      };
    }
    const bar = eq.find((e) => e.kind === 'barbell');
    return {
      point: bar && bar.kind === 'barbell' ? bar.center : handle,
      dir: [0, -1, 0],
    };
  }
  if (L.kind === 'cable') {
    const cab = eq.find((e) => e.kind === 'cable');
    if (!cab || cab.kind !== 'cable') return null;
    const at = cab.mirror || cab.handle === 'single' ? fr.grips.r : handle;
    return { point: at, dir: normalize(sub(cab.pulley, at)) };
  }
  if (L.kind === 'guided') {
    // Contra o caminho do ponto na fase concêntrica (diferença finita em u).
    const pointOf = (pose: Pose, grips: Readonly<Record<'r' | 'l', Vec3>>): Vec3 => {
      if (L.segment && L.point) {
        const a = localOf(c.sk, L.segment, L.point, 'r');
        return pointToWorld(pose, a.segment, a.local);
      }
      return c.arms.some((a) => a.sides.length === 2) ? lerp(grips.r, grips.l, 0.5) : grips.r;
    };
    const here = pointOf(fr.pose, fr.grips);
    const du = u < 0.98 ? 0.02 : -0.02;
    const next = solveFrame(c, u + du, 0);
    const vel = scale(sub(pointOf(next.pose, next.grips), here), Math.sign(du));
    if (length(vel) < 1e-6) return null;
    // A concêntrica é sempre u crescente: a carga aponta contra.
    return { point: here, dir: normalize(scale(vel, -1)) };
  }
  // Alavanca: perpendicular ao braço da máquina (no plano sagital), contra a fase concêntrica.
  const pad = eq.find((e) => e.kind === 'pad' && e.pivot);
  if (!pad || pad.kind !== 'pad' || !pad.pivot) return null;
  const center = pad.centers[0] ?? pad.pivot;
  const r = sub(center, pad.pivot);
  let dir = normalize(cross([1, 0, 0], r));
  // Sentido: o rolo anda para lá quando u cresce; a carga vai contra a concêntrica.
  const du = u < 0.98 ? 0.02 : -0.02;
  const next = solveFrame(c, u + du, 0);
  const pe = c.clip.equipment.find((e) => e.kind === 'pad' && e.lever);
  if (pe && pe.kind === 'pad') {
    const a = localOf(c.sk, pe.segment, pe.point, 'r');
    const vel = scale(sub(pointToWorld(next.pose, a.segment, a.local), center), Math.sign(du));
    // A concêntrica é u crescente: a resistência vai contra esse sentido.
    const towardOut = vel[0] * dir[0] + vel[1] * dir[1] + vel[2] * dir[2] > 0;
    if (towardOut) dir = scale(dir, -1);
  }
  return length(dir) > 0 ? { point: center, dir } : null;
}
