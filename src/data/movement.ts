/**
 * Movimento nomeado → DOFs do esqueleto (lado direito). Puro: o teste dos dados, as curvas do Atlas e a
 * demonstração usam o mesmo mapeamento.
 */
import type { Angles } from '@/engine/kinematics/types';
import type { Movement } from './schema/muscle';

const DEG = Math.PI / 180;

/** `hip_flex` → `hip_flex_r` quando o DOF é bilateral; DOF central (`lumbar_flex`) fica como está. */
export const sidedDof = (dof: string, dofIds: ReadonlySet<string>): string => (dofIds.has(`${dof}_r`) ? `${dof}_r` : dof);

/** DOFs fixos do movimento (radianos, com lado), em graus no dado. */
export function baseAnglesDeg(mv: Movement, dofIds: ReadonlySet<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(mv.base ?? {})) out[sidedDof(k, dofIds)] = v;
  return out;
}

export function baseAngles(mv: Movement, dofIds: ReadonlySet<string>): Angles {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(baseAnglesDeg(mv, dofIds))) out[k] = v * DEG;
  return out;
}
