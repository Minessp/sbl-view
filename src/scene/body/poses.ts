import { bilateral, degToAngles } from '@/engine/kinematics/skeleton';

/** Pose de referência: em pé, braços um pouco afastados (as mãos não encostam na coxa). */
export const STANDING = degToAngles(bilateral({ shoulder_abd: 14, elbow_flex: 8, hip_abd: 2.5, forearm_pro: 20 }));
