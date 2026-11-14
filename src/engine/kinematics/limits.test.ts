import { describe, expect, it } from 'vitest';
import skeletonJson from '@/data/skeleton.json';
import { SkeletonDef } from '@/data/schema/skeleton';
import { forwardKinematics } from './fk';
import { readJoint, readJoints } from './limits';
import { bilateral, buildSkeleton, degToAngles } from './skeleton';

const sk = buildSkeleton(SkeletonDef.parse(skeletonJson));
const pose = (deg: Record<string, number>) => forwardKinematics(sk, degToAngles(deg), { clampToRom: false });
const over = (deg: Record<string, number>, id: string) => readJoint(sk, pose(deg), id)?.over ?? 0;

describe('limites articulares por plano', () => {
  it('pose neutra e poses comuns ficam dentro', () => {
    expect(readJoints(sk, pose({})).every((r) => r.over === 0)).toBe(true);
    const ok = [
      bilateral({ hip_flex: 115, knee_flex: 140, hip_abd: 15, hip_rot: -15 }),
      bilateral({ shoulder_flex: 170, elbow_flex: 30 }),
      bilateral({ shoulder_abd: 90, shoulder_rot: -80 }),
      bilateral({ hip_flex: 90, hip_abd: 45 }),
    ];
    for (const d of ok) expect(readJoints(sk, pose(d)).filter((r) => r.over > 0.5)).toEqual([]);
  });

  it('cada DOF na amplitude, mas a combinação absurda é pega', () => {
    // Ombro com flexão e abdução no máximo (180° cada): o braço volta para baixo torcido meia volta em torno do úmero.
    const twisted = readJoint(sk, pose(bilateral({ shoulder_flex: 180, shoulder_abd: 180 })), 'upperarm_r');
    expect(twisted?.swing).toBeLessThan(30);
    expect(twisted?.over).toBeGreaterThan(40);
    // Quadril estendido e aduzido no máximo: a coxa cruza por trás da outra.
    expect(over(bilateral({ hip_flex: -30, hip_abd: -30 }), 'thigh_r')).toBeGreaterThan(0);
    // Fora da amplitude de um DOF só também é pego (rotação do quadril além de 55°).
    expect(over(bilateral({ hip_rot: 70 }), 'thigh_r')).toBeGreaterThan(10);
    expect(over(bilateral({ hip_rot: 70 }), 'thigh_l')).toBeGreaterThan(10);
  });
});
