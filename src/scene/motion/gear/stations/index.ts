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
import { dipStation, hyperBench, latTower, nordicAnchor, rowStation } from './frames';
import { calfSeated, calfStanding, chestPress, hackSquat, hipAbductor, legCurlLying, legCurlSeated, legExtension, legPress, pecDeck, pendulum, shoulderPress } from './machines';

export interface StationContext {
  /** Primeiro quadro e outras amostras do clipe (u crescente). */
  readonly frames: readonly MotionFrame[];
  readonly kit: GearKit;
}

export interface StationView {
  readonly group: Object3D;
  update?(f: MotionFrame): void;
}

export type StationBuilder = (ctx: StationContext, params: Readonly<Record<string, number>>) => StationView;

export const STATIONS: Readonly<Record<StationId, StationBuilder>> = {
  power_rack: powerRack,
  bench_rack: benchRack,
  flat_bench: flatBench,
  adjustable_bench: adjustableBench,
  preacher_bench: preacherBench,
  lat_tower: latTower,
  row_station: rowStation,
  dip_station: dipStation,
  hyper_bench: hyperBench,
  nordic_anchor: nordicAnchor,
  leg_extension: legExtension,
  leg_curl_seated: legCurlSeated,
  leg_curl_lying: legCurlLying,
  hack_squat: hackSquat,
  pendulum,
  leg_press: legPress,
  calf_standing: calfStanding,
  calf_seated: calfSeated,
  hip_abductor: hipAbductor,
  pec_deck: pecDeck,
  chest_press: chestPress,
  shoulder_press: shoulderPress,
};

/** Estações que desenham a estrutura do banco: a peça do clipe fica só com o estofado. */
export const BENCH_STATIONS: ReadonlySet<StationId> = new Set([
  'flat_bench',
  'adjustable_bench',
  'preacher_bench',
  'lat_tower',
  'row_station',
  'hyper_bench',
  'leg_extension',
  'leg_curl_seated',
  'leg_curl_lying',
  'leg_press',
  'calf_seated',
  'hip_abductor',
  'pec_deck',
  'chest_press',
  'shoulder_press',
]);

/** Máquinas: a estrutura entra inteira na caixa do clipe (enquadramento do player). */
export const FRAMED_STATIONS: ReadonlySet<StationId> = new Set([
  'leg_extension',
  'leg_curl_seated',
  'leg_curl_lying',
  'hack_squat',
  'pendulum',
  'leg_press',
  'calf_standing',
  'calf_seated',
  'hip_abductor',
  'pec_deck',
  'chest_press',
  'shoulder_press',
]);

export function buildStation(id: StationId, ctx: StationContext, params: Readonly<Record<string, number>> = {}, at?: Vec3, yaw = 0): StationView {
  const v = STATIONS[id](ctx, params);
  if (!at && !yaw) return v;
  const g = new Group();
  g.add(v.group);
  if (at) g.position.set(at[0], at[1], at[2]);
  g.rotation.y = (yaw * Math.PI) / 180;
  return { group: g, ...(v.update ? { update: v.update } : {}) };
}
