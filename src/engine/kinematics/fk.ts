import {
  applyTransform,
  composeTransform,
  quatConj,
  quatFromAxisAngle,
  quatMul,
  QUAT_IDENTITY,
  rotate,
  sub,
  type Quat,
  type Transform,
  type Vec3,
} from '../math/vec';
import type { Angles, EngineSkeleton, Pose, SegmentId } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface FkOptions {
  /** Transformação aplicada à raiz (pelve). Padrão: identidade na pose neutra. */
  readonly root?: Transform;
  /** Respeitar limites de amplitude. Padrão: true. */
  readonly clampToRom?: boolean;
}

/**
 * Cinemática direta. Cada DOF gira em torno do seu eixo (frame do pai), em ordem.
 * Determinística, sem estado.
 */
export function forwardKinematics(sk: EngineSkeleton, angles: Angles, opts: FkOptions = {}): Pose {
  const clampToRom = opts.clampToRom ?? true;
  const world = new Map<SegmentId, Transform>();
  for (const seg of sk.segments) {
    let q: Quat = QUAT_IDENTITY;
    for (const dof of seg.dofs) {
      const raw = angles[dof.id] ?? 0;
      const a = clampToRom ? clamp(raw, dof.min, dof.max) : raw;
      q = quatMul(q, quatFromAxisAngle(dof.axis, a * dof.sign));
    }
    const local: Transform = { position: seg.jointOffset, rotation: q };
    if (seg.parent === null) {
      const root = opts.root ?? { position: sk.neutralOrigin.get(seg.id) ?? [0, 0, 0], rotation: QUAT_IDENTITY };
      world.set(seg.id, composeTransform(root, { position: [0, 0, 0], rotation: q }));
    } else {
      const parent = world.get(seg.parent);
      if (!parent) throw new Error(`Segmento ${seg.id} antes do pai ${seg.parent}`);
      world.set(seg.id, composeTransform(parent, local));
    }
  }
  return { world };
}

/** Ponto dado no frame local de um segmento → mundo. */
export function pointToWorld(pose: Pose, segment: SegmentId, local: Vec3): Vec3 {
  const t = pose.world.get(segment);
  if (!t) throw new Error(`Segmento desconhecido: ${segment}`);
  return applyTransform(t, local);
}

export const jointPosition = (pose: Pose, segment: SegmentId): Vec3 => pointToWorld(pose, segment, [0, 0, 0]);

/**
 * Reposiciona a pose inteira para que um segmento (ex.: pé) fique com a
 * transformação-alvo — o pé "planta" e o resto do corpo se acomoda.
 */
export function anchorPose(pose: Pose, segment: SegmentId, target: Transform): Pose {
  const cur = pose.world.get(segment);
  if (!cur) throw new Error(`Segmento desconhecido: ${segment}`);
  // Δ = alvo ∘ atual⁻¹
  const dq = quatMul(target.rotation, quatConj(cur.rotation));
  const dp = sub(target.position, rotate(dq, cur.position));
  const delta: Transform = { position: dp, rotation: dq };
  const world = new Map<SegmentId, Transform>();
  for (const [id, t] of pose.world) world.set(id, composeTransform(delta, t));
  return { world };
}
