import { jointPosition, pointToWorld } from '../kinematics/fk';
import type { Pose } from '../kinematics/types';
import type { Vec3 } from '../math/vec';
import type { PointMass } from './mass';

export const G = 9.81;

export interface JointDemand {
  /** Momento articular líquido demandado (N·m), positivo = extensão (quadril, joelho) ou flexão plantar (tornozelo). */
  readonly moment: number;
  /** Braço de momento externo (m): distância horizontal entre a articulação e a linha do peso que ela sustenta. */
  readonly arm: number;
  /** Massa sustentada pela articulação (kg). */
  readonly supported: number;
  /** Posição Z (m, mundo) da linha vertical do peso sustentado. */
  readonly lineZ: number;
}

export interface SagittalDemand {
  readonly hip: JointDemand;
  readonly knee: JointDemand;
  readonly ankle: JointDemand;
}

const UPPER = new Set(['pelvis', 'trunk', 'head', 'upperarm_r', 'upperarm_l', 'forearm_r', 'forearm_l', 'hand_r', 'hand_l']);

/**
 * Análise quase estática no plano sagital, de cima para baixo, para UMA perna (lado `side`).
 * Hipóteses: postura simétrica (cada perna sustenta metade do corpo acima do quadril e da carga),
 * velocidade baixa (sem termos inerciais), segmentos rígidos, Z = anterior.
 */
export function sagittalDemand(
  pose: Pose,
  masses: readonly PointMass[],
  side: 'r' | 'l' = 'r',
  /** Cargas externas sustentadas pelo tronco/braços (barra, halter), em mundo. */
  externals: readonly { readonly world: Vec3; readonly mass: number }[] = [],
): SagittalDemand {
  const hipZ = jointPosition(pose, `thigh_${side}`)[2];
  const kneeZ = jointPosition(pose, `shank_${side}`)[2];
  const ankleZ = jointPosition(pose, `foot_${side}`)[2];

  // Acumula Σm e Σm·z por grupo.
  let mU = 0, mzU = 0;
  let mT = 0, mzT = 0;
  let mS = 0, mzS = 0;
  for (const m of masses) {
    const z = pointToWorld(pose, m.segment, m.local)[2];
    if (UPPER.has(m.segment)) {
      mU += m.mass / 2;
      mzU += (m.mass / 2) * z;
    } else if (m.segment === `thigh_${side}`) {
      mT += m.mass;
      mzT += m.mass * z;
    } else if (m.segment === `shank_${side}`) {
      mS += m.mass;
      mzS += m.mass * z;
    }
  }

  for (const e of externals) {
    mU += e.mass / 2;
    mzU += (e.mass / 2) * e.world[2];
  }

  const demand = (mass: number, mz: number, jz: number, sign: 1 | -1): JointDemand => {
    const comZ = mass > 0 ? mz / mass : jz;
    const arm = sign * (comZ - jz);
    return { moment: G * mass * arm, arm, supported: mass, lineZ: comZ };
  };

  return {
    hip: demand(mU, mzU, hipZ, 1),
    knee: demand(mU + mT, mzU + mzT, kneeZ, -1),
    ankle: demand(mU + mT + mS, mzU + mzT + mzS, ankleZ, 1),
  };
}
