/**
 * Estações: a estrutura que liga ao chão as peças que o clipe já tem (barra, blocos, rolos, trilhos, cabos). A estação lê
 * os quadros do clipe e nunca repete coordenada: o gancho fica na altura da barra, o pé do banco sob o estofado.
 */
import { Group, type Object3D } from 'three';
import type { StationId } from '@/data/schema/motion';
import type { MotionFrame } from '@/engine/motion/evaluate';
import type { Vec3 } from '@/engine/math/vec';
import type { GearKit } from '../kit';
import { adjustableBench, flatBench, preacherBench } from './bench';
import { benchRack, powerRack } from './rack';

export interface StationContext {
  /** Primeiro quadro e outras amostras do clipe (u crescente). */
  readonly frames: readonly MotionFrame[];
  readonly kit: GearKit;
}

export interface StationView {
  readonly group: Object3D;
  update?(f: MotionFrame): void;
  /** Pontos no chão sob os pés da estação (sombra de contato). */
  readonly floor: Vec3[];
}

export type StationBuilder = (ctx: StationContext, params: Readonly<Record<string, number>>) => StationView;

export const STATIONS: Readonly<Record<StationId, StationBuilder>> = {
  power_rack: powerRack,
  bench_rack: benchRack,
  flat_bench: flatBench,
  adjustable_bench: adjustableBench,
  preacher_bench: preacherBench,
};

/** Estações que desenham a estrutura do banco: a peça do clipe fica só com o estofado. */
export const BENCH_STATIONS: ReadonlySet<StationId> = new Set(['flat_bench', 'adjustable_bench', 'preacher_bench']);

export function buildStation(id: StationId, ctx: StationContext, params: Readonly<Record<string, number>> = {}, at?: Vec3, yaw = 0): StationView {
  const v = STATIONS[id](ctx, params);
  if (!at && !yaw) return v;
  const g = new Group();
  g.add(v.group);
  if (at) g.position.set(at[0], at[1], at[2]);
  g.rotation.y = (yaw * Math.PI) / 180;
  const c = Math.cos(g.rotation.y);
  const s = Math.sin(g.rotation.y);
  const o = at ?? [0, 0, 0];
  return { group: g, ...(v.update ? { update: v.update } : {}), floor: v.floor.map((p) => [o[0] + p[0] * c + p[2] * s, 0, o[2] - p[0] * s + p[2] * c] as Vec3) };
}
