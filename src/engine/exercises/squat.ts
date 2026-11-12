/**
 * Agachamento resolvido por equilíbrio estático.
 *
 * Modelo (sagital, simétrico, quase estático):
 *  - profundidade u ∈ [0,1]; flexão de joelho = profundidade × u; dorsiflexão = máxima × u;
 *  - pés plantados (com calço opcional sob o calcanhar);
 *  - o ângulo coxa-tronco é a incógnita: resolvido para que o centro de massa do sistema
 *    (corpo + carga) fique sobre o meio do pé. Além do limite de flexão do quadril, o restante
 *    vira flexão lombar (reportada como sinal de alerta do modelo, não como prescrição).
 */
import { anchorPose, forwardKinematics, jointPosition, pointToWorld } from '../kinematics/fk';
import { degToAngles } from '../kinematics/skeleton';
import type { EngineSkeleton, Pose } from '../kinematics/types';
import { must } from '../math/arr';
import { DEG, quatFromAxisAngle, quatMul, rotate, sub, add, type Transform, type Vec3 } from '../math/vec';
import { centerOfMass, type PointMass } from '../statics/mass';
import { sagittalDemand, type SagittalDemand } from '../statics/moments';

export interface SquatParams {
  readonly depthDeg: number;
  readonly ankleMaxDeg: number;
  readonly heelWedgeDeg: number;
  /** Ponto de aplicação da carga, no frame local do segmento. */
  readonly load: { readonly segment: string; readonly local: Vec3; readonly mass: number };
  /** Ângulos fixos (graus) por DOF já com lado. */
  readonly hold: Readonly<Record<string, number>>;
}

export interface SquatContext {
  readonly sk: EngineSkeleton;
  readonly body: readonly PointMass[];
  /** Limite de flexão do quadril (graus) antes de recorrer à lombar. */
  readonly hipLimitDeg: number;
  readonly lumbarLimitDeg: number;
}

export interface SquatFrame {
  readonly u: number;
  readonly dofDeg: Readonly<Record<string, number>>;
  readonly pose: Pose;
  readonly com: Vec3;
  readonly load: Vec3;
  readonly midfootZ: number;
  readonly joints: { readonly hip: Vec3; readonly knee: Vec3; readonly ankle: Vec3 };
  /** Graus: joelho, quadril (coxa–pelve), tornozelo (articular), tronco (inclinação a partir da vertical), lombar. */
  readonly angles: { readonly knee: number; readonly hip: number; readonly ankle: number; readonly trunk: number; readonly lumbar: number };
  readonly demand: SagittalDemand;
  /** false quando nem o tronco ereto nem o limite de flexão equilibram o sistema. */
  readonly balanced: boolean;
}

/** Convenção: alvo de equilíbrio (m à frente do tornozelo, estatura 1,75 m). */
export const MIDFOOT_AHEAD_OF_ANKLE = 0.045;
/** Dorsiflexão em pé (graus): o corpo se equilibra inclinando levemente pelo tornozelo. */
export const STANDING_DORSI_DEG = 3;

/** Profundidade ao longo da repetição: desce em t ∈ [0, 0,5], sobe em [0,5, 1]. */
export const depthAt = (t: number) => (1 - Math.cos(2 * Math.PI * t)) / 2;

/** Transformação dos pés: pose neutra, girada sobre a cabeça dos metatarsos pelo calço. */
function footTargets(sk: EngineSkeleton, wedgeDeg: number): { r: Transform; l: Transform; midfootZ: number } {
  const neutral = forwardKinematics(sk, {});
  const k = sk.stature / 1.75;
  const out = (side: 'r' | 'l'): Transform => {
    const t = must(neutral.world, `foot_${side}`, 'segmento');
    if (wedgeDeg === 0) return t;
    const pivot: Vec3 = [t.position[0], 0, 0.15 * k];
    // Calcanhar sobe = pé em flexão plantar em relação ao chão = giro +X.
    const q = quatFromAxisAngle([1, 0, 0], wedgeDeg * DEG);
    return { position: add(pivot, rotate(q, sub(t.position, pivot))), rotation: quatMul(q, t.rotation) };
  };
  // "Meio do pé": 4,5 cm à frente do tornozelo na estatura de referência (convenção do modelo).
  return { r: out('r'), l: out('l'), midfootZ: MIDFOOT_AHEAD_OF_ANKLE * k };
}

function trunkLeanDeg(pose: Pose): number {
  const up = rotate(must(pose.world, 'trunk', 'segmento').rotation, [0, 1, 0]);
  return Math.atan2(up[2], up[1]) / DEG;
}

export function createSquatSolver(ctx: SquatContext, params: SquatParams) {
  const feet = footTargets(ctx.sk, params.heelWedgeDeg);
  const loadMass: PointMass = { id: 'load', segment: params.load.segment, local: params.load.local, mass: params.load.mass };
  const masses = [...ctx.body, loadMass];

  const build = (u: number, thighTrunkDeg: number) => {
    const knee = params.depthDeg * u;
    // Ângulo articular: em pé, a perna fica quase vertical; com calço, isso exige flexão plantar.
    const a0 = Math.min(STANDING_DORSI_DEG, params.ankleMaxDeg) - params.heelWedgeDeg;
    const ankle = a0 + (params.ankleMaxDeg - a0) * u;
    const hip = Math.min(thighTrunkDeg, ctx.hipLimitDeg);
    const lumbar = Math.max(0, thighTrunkDeg - ctx.hipLimitDeg);
    const dofDeg: Record<string, number> = { ...params.hold };
    for (const s of ['r', 'l']) {
      dofDeg[`knee_flex_${s}`] = knee;
      dofDeg[`ankle_dorsi_${s}`] = ankle;
      dofDeg[`hip_flex_${s}`] = hip;
    }
    dofDeg.lumbar_flex = lumbar;
    const raw = forwardKinematics(ctx.sk, degToAngles(dofDeg), { clampToRom: false });
    const pose = anchorPose(raw, 'foot_r', feet.r);
    return { pose, dofDeg, knee, ankle, hip, lumbar };
  };

  const comZ = (pose: Pose) => centerOfMass(pose, masses)[2];

  return function solve(u: number): SquatFrame {
    const target = feet.midfootZ;
    // Ângulo coxa-tronco: do tronco 10° para trás até o limite (quadril + lombar).
    const shin = STANDING_DORSI_DEG + (params.ankleMaxDeg + params.heelWedgeDeg - STANDING_DORSI_DEG) * u;
    const phi = params.depthDeg * u - shin;
    let lo = Math.max(-15, phi - 10);
    let hi = ctx.hipLimitDeg + ctx.lumbarLimitDeg;
    let balanced = true;
    const fLo = comZ(build(u, lo).pose) - target;
    const fHi = comZ(build(u, hi).pose) - target;
    let x: number;
    if (fLo >= 0) {
      x = lo;
      balanced = fLo < 0.01;
    } else if (fHi <= 0) {
      x = hi;
      balanced = false;
    } else {
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (comZ(build(u, mid).pose) - target < 0) lo = mid;
        else hi = mid;
      }
      x = (lo + hi) / 2;
    }
    const b = build(u, x);
    const load = pointToWorld(b.pose, params.load.segment, params.load.local);
    return {
      u,
      dofDeg: b.dofDeg,
      pose: b.pose,
      com: centerOfMass(b.pose, masses),
      load,
      midfootZ: target,
      joints: { hip: jointPosition(b.pose, 'thigh_r'), knee: jointPosition(b.pose, 'shank_r'), ankle: jointPosition(b.pose, 'foot_r') },
      angles: { knee: b.knee, hip: b.hip, ankle: b.ankle, trunk: trunkLeanDeg(b.pose), lumbar: b.lumbar },
      demand: sagittalDemand(b.pose, ctx.body, 'r', [{ world: load, mass: params.load.mass }]),
      balanced,
    };
  };
}

/** Amostra a descida (u de 0 a 1) em n pontos. */
export function sampleSquat(solve: (u: number) => SquatFrame, n = 49): SquatFrame[] {
  return Array.from({ length: n }, (_, i) => solve(i / (n - 1)));
}
