import { pointToWorld } from '@/engine/kinematics/fk';
import { bilateral, degToAngles } from '@/engine/kinematics/skeleton';
import type { EngineSkeleton, Pose } from '@/engine/kinematics/types';
import type { Vec3 } from '@/engine/math/vec';

/** Pose de referência: em pé, braços um pouco afastados (as mãos não encostam na coxa). */
export const STANDING = degToAngles(bilateral({ shoulder_abd: 14, elbow_flex: 8, hip_abd: 2.5, forearm_pro: 20 }));

/** Pontos de apoio no chão (tornozelo e ponta de cada pé), para a sombra de contato. */
export function footContacts(sk: EngineSkeleton, pose: Pose): Vec3[] {
  const out: Vec3[] = [];
  for (const id of ['foot_r', 'foot_l'] as const) {
    const seg = sk.byId.get(id);
    if (!seg || !pose.world.has(id)) continue;
    out.push(pointToWorld(pose, id, [0, 0, 0]), pointToWorld(pose, id, seg.tip));
  }
  return out;
}
