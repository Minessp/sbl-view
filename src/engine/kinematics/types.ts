import type { Transform, Vec3 } from '../math/vec';

export type SegmentId = string;
export type DofId = string;

/** DOF já convertido para o motor: eixo no frame do pai, sinal, limites em radianos. */
export interface EngineDof {
  readonly id: DofId;
  /** Eixo de rotação no frame do segmento pai (vetor unitário). */
  readonly axis: Vec3;
  /** +1 ou -1: positivo = movimento nomeado (flexão, abdução…). */
  readonly sign: 1 | -1;
  readonly min: number;
  readonly max: number;
}

export interface EngineSegment {
  readonly id: SegmentId;
  readonly parent: SegmentId | null;
  /** Posição da articulação proximal no frame do pai (pose neutra). */
  readonly jointOffset: Vec3;
  /** Vetor da articulação proximal até a extremidade distal, no frame do próprio segmento. */
  readonly tip: Vec3;
  /** DOFs aplicados em ordem (rotações intrínsecas). */
  readonly dofs: readonly EngineDof[];
}

export interface EngineSkeleton {
  readonly stature: number;
  /** Segmentos em ordem topológica (pai antes do filho). */
  readonly segments: readonly EngineSegment[];
  readonly byId: ReadonlyMap<SegmentId, EngineSegment>;
  /** Posição neutra (mundo) da articulação proximal de cada segmento. */
  readonly neutralOrigin: ReadonlyMap<SegmentId, Vec3>;
}

/** Ângulos em radianos, por DOF. DOF ausente = 0. */
export type Angles = Readonly<Record<DofId, number>>;

export interface Pose {
  /** Transformação mundo de cada segmento (origem = articulação proximal). */
  readonly world: ReadonlyMap<SegmentId, Transform>;
}
