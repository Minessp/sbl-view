/**
 * Perfil de resistência: quanto a carga do clipe pesa em torno de um DOF ao longo da repetição.
 *
 * Trabalho virtual: com força unitária F na direção da carga e o ponto de aplicação p, o momento generalizado em torno do
 * DOF θ é Q = F · ∂p/∂θ (m por unidade de força). O lado do corpo sem a carga fica parado na derivada: se a carga está
 * no segmento do DOF ou abaixo dele (rosca: mão), gira só esse ramo; se está do outro lado (barra fixa, agachamento:
 * tronco), o ramo distal fica preso e o resto gira em torno da articulação. Assim cadeia aberta e fechada saem da mesma
 * conta, sem saber onde o corpo se apoia.
 *
 * Força constante ao longo da repetição: peso, cabo (sem inércia), máquina sem came. Peso do próprio corpo fora.
 * Puro, determinístico.
 */
import { anchorPose, forwardKinematics, pointToWorld } from '../kinematics/fk';
import type { EngineSkeleton, Pose } from '../kinematics/types';
import { at, must } from '../math/arr';
import { DEG, sub, type Vec3 } from '../math/vec';
import type { CompiledClip, MotionFrame } from './evaluate';

/** Ponto do corpo onde a carga age (pose neutra → frame local). */
export interface LoadAttachment {
  readonly segment: string;
  readonly local: Vec3;
}

/**
 * Onde a carga do clipe encosta no corpo. Peso num ponto de segmento, guiada num ponto de segmento ou rolo de alavanca:
 * esse ponto. Peso nas mãos, cabo e guiada nas mãos: a pegada direita (cada mão leva a sua parte; a barra fica entre as
 * pegadas e o eixo do DOF é do lado direito).
 */
export function loadAttachment(c: CompiledClip): LoadAttachment {
  const L = c.clip.load;
  const at = (segment: string, point: Vec3): LoadAttachment => ({ segment, local: sub(point, must(c.sk.neutralOrigin, segment, 'segmento')) });
  if ((L.kind === 'gravity' || L.kind === 'guided') && L.segment && L.point) return at(L.segment, L.point);
  if (L.kind === 'lever') {
    const pad = c.clip.equipment.find((e) => e.kind === 'pad' && e.lever);
    if (pad && pad.kind === 'pad') return at(pad.segment, pad.point);
  }
  return { segment: 'hand_r', local: c.grip.r };
}

/** O segmento `seg` está no ramo de `top` (ele mesmo ou descendente)? */
export function inSubtree(sk: EngineSkeleton, top: string, seg: string): boolean {
  let s: string | null = seg;
  while (s) {
    if (s === top) return true;
    s = must(sk.byId, s, 'segmento').parent;
  }
  return false;
}

const dofSegment = (sk: EngineSkeleton, dof: string): string => {
  for (const s of sk.segments) if (s.dofs.some((d) => d.id === dof)) return s.id;
  throw new Error(`DOF desconhecido: ${dof}`);
};

/**
 * Momento da carga unitária em torno do DOF (m), no sentido positivo do DOF (o movimento nomeado). Positivo = a carga
 * empurra para a flexão/abdução/...; quem resiste à concêntrica depende de para onde o DOF anda nela.
 */
export function loadMoment(c: CompiledClip, f: MotionFrame, dof: string, attach: LoadAttachment = loadAttachment(c), hDeg = 0.5): number {
  const load = f.load;
  if (!load) return 0;
  const sk = c.sk;
  const seg = dofSegment(sk, dof);
  const rootSeg = at(sk.segments, 0).id;
  const root = must(f.pose.world, rootSeg, 'segmento');
  const fixDistal = !inSubtree(sk, seg, attach.segment);
  const fixed = must(f.pose.world, seg, 'segmento');
  const rad: Record<string, number> = {};
  for (const [k, v] of Object.entries(f.deg)) rad[k] = v * DEG;
  const base = rad[dof] ?? 0;
  const pointAt = (th: number): Vec3 => {
    let pose: Pose = forwardKinematics(sk, { ...rad, [dof]: th }, { clampToRom: false, root });
    if (fixDistal) pose = anchorPose(pose, seg, fixed);
    return pointToWorld(pose, attach.segment, attach.local);
  };
  const h = hDeg * DEG;
  const d = sub(pointAt(base + h), pointAt(base - h));
  return (load.dir[0] * d[0] + load.dir[1] * d[1] + load.dir[2] * d[2]) / (2 * h);
}
