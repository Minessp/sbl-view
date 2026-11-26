/**
 * Estações de peso corporal e de polia com assento. Todas leem as peças e a pose do próprio clipe:
 * - `lat_tower` (puxada): coluna do assento até a longarina no chão que vai à torre (a torre e a lança são do cabo) e
 *   rolos sobre as coxas (pela pose), num poste entre os joelhos.
 * - `row_station` (remada sentada): longarina baixa do assento à coluna da polia, poste do assento, escoras do apoio dos pés.
 * - `dip_station` (paralelas): duas barras sob as mãos, montantes e base no chão.
 * - `hyper_bench` (extensão a 45°): longarina da plataforma à almofada, pernas em T e rolo atrás dos tornozelos.
 * - `nordic_anchor` (nórdica): o rolo do clipe preso por dois montantes à plataforma.
 */
import { Group } from 'three';
import { jointPosition } from '@/engine/kinematics/fk';
import type { MotionFrame } from '@/engine/motion/evaluate';
import { add, normalize, rotate, scale, sub, type Vec3 } from '@/engine/math/vec';
import type { GearKit } from '../kit';
import { padGeometry, rod, rollerGeometry } from '../parts';
import { blocks, tLeg, toWorld } from './bench';
import type { StationBuilder } from './index';

type Cable = Extract<MotionFrame['equipment'][number], { kind: 'cable' }>;
type Pad = Extract<MotionFrame['equipment'][number], { kind: 'pad' }>;

const cableOf = (frames: readonly MotionFrame[]) => frames[0]?.equipment.find((e): e is Cable => e.kind === 'cable');
const padOf = (frames: readonly MotionFrame[]) => frames[0]?.equipment.find((e): e is Pad => e.kind === 'pad');

/** Rolo estofado no eixo X com o eixo de aço passando. */
function roller(kit: GearKit, g: Group, c: Vec3, len: number, r = 0.05) {
  const m = kit.mesh(kit.geo(rollerGeometry(r, len)), kit.mat('pad'), g);
  m.rotation.z = Math.PI / 2;
  m.position.set(c[0], c[1], c[2]);
  kit.rod(g, [c[0] - len / 2 - 0.03, c[1], c[2]], [c[0] + len / 2 + 0.03, c[1], c[2]], 0.012, 'chrome');
}

/** Ponto do segmento a→b mais perto de p. */
function nearestOn(a: Vec3, b: Vec3, p: Vec3): Vec3 {
  const ab = sub(b, a);
  const k = Math.max(0, Math.min(1, (sub(p, a)[0] * ab[0] + sub(p, a)[1] * ab[1] + sub(p, a)[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
  return add(a, scale(ab, k));
}

export const latTower: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  const cable = cableOf(frames);
  if (!seat || !cable) return { group: g };
  const [x, y, z] = seat.center;
  const rear = z - 0.28;
  // Pé da torre: a coluna fica 0,55 m à frente da roldana (`EquipmentView.buildCable`).
  const tower: Vec3 = [cable.pulley[0], 0.04, cable.pulley[2] + 0.55];
  kit.beam(g, [x, 0.04, rear], tower, 0.08);
  kit.beam(g, [x, y - seat.size[1] / 2 - 0.01, z], [x, 0.08, z], 0.07);
  tLeg(kit, g, x, rear, 0.06, 0.24);
  const knob = kit.mesh(kit.geo(rod(0.014, 0.06, 12)), kit.mat('rubber'), g);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(x + 0.06, y - 0.2, z);
  // Rolos sobre as coxas, logo atrás do joelho (pela pose), num poste entre os joelhos até a longarina.
  const f = frames[0];
  if (f) {
    const at = add(scale(jointPosition(f.pose, 'thigh_r'), 0.2), scale(jointPosition(f.pose, 'shank_r'), 0.8));
    const [tx, ty, tz] = [0, at[1] + 0.13, at[2]];
    for (const s of [-1, 1]) roller(kit, g, [tx + s * 0.11, ty, tz], 0.17, 0.05);
    kit.beam(g, [tx, ty, tz], [tx, 0.06, tz], 0.05);
    const collar = kit.mesh(kit.geo(padGeometry(0.07, 0.08, 0.07, 0.01)), kit.mat('steel'), g);
    collar.position.set(tx, ty - 0.14, tz);
  }
  return { group: g };
};

export const rowStation: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  const plate = all.find((e) => e.role === 'platform');
  const cable = cableOf(frames);
  if (!seat || !cable) return { group: g };
  const [x, y, z] = seat.center;
  const rear = z - 0.32;
  const front = cable.pulley[2] - 0.05;
  const rail = 0.07;
  kit.beam(g, [x, rail, rear], [x, rail, front], 0.09);
  kit.beam(g, [x, y - seat.size[1] / 2 - 0.01, z], [x, rail, z], 0.07);
  tLeg(kit, g, x, rear, rail, 0.26);
  if (plate) {
    const [, h, d] = plate.size;
    const lo = toWorld(plate, [0, -h * 0.4, d / 2 + 0.01]);
    const hi = toWorld(plate, [0, h * 0.35, d / 2 + 0.01]);
    kit.beam(g, lo, [x, rail, lo[2]], 0.05);
    kit.beam(g, hi, [x, rail, hi[2] + 0.18], 0.05);
  }
  return { group: g };
};

export const dipStation: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f = frames[0];
  if (!f) return { group: g };
  const ends: Vec3[][] = [];
  for (const p of [f.grips.r, f.grips.l]) {
    const back: Vec3 = [p[0], p[1], p[2] - 0.32];
    const fwd: Vec3 = [p[0], p[1], p[2] + 0.22];
    kit.rod(g, back, fwd, 0.022, 'chrome');
    // Manopla de borracha onde a mão fecha.
    kit.rod(g, [p[0], p[1], p[2] - 0.07], [p[0], p[1], p[2] + 0.07], 0.025, 'rubber');
    for (const e of [back, fwd]) {
      kit.beam(g, [e[0], e[1] + 0.02, e[2]], [e[0], 0.04, e[2]], 0.06);
    }
    kit.beam(g, [p[0], 0.03, back[2] - 0.08], [p[0], 0.03, fwd[2] + 0.08], 0.06);
    ends.push([back, fwd]);
  }
  const [r, l] = ends;
  if (r && l) {
    // Travessas baixas ligando os dois lados (rígidas, fora do caminho das pernas).
    for (const k of [0, 1]) {
      const a = r[k],
        b = l[k];
      if (a && b) kit.beam(g, [a[0], 0.03, a[2]], [b[0], 0.03, b[2]], 0.05);
    }
    // Travessa a meia altura só na frente: atrás passam as pernas dobradas.
    const a = r[1],
      b = l[1];
    if (a && b) kit.beam(g, [a[0], a[1] * 0.45, a[2]], [b[0], b[1] * 0.45, b[2]], 0.05);
  }
  return { group: g };
};

export const hyperBench: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const all = blocks(frames);
  const pad = all.find((e) => e.role === 'bench');
  const plate = all.find((e) => e.role === 'platform');
  const f = frames[0];
  if (!pad || !plate || !f) return { group: g };
  const a = toWorld(plate, [0, -plate.size[1] / 2 - 0.03, 0]);
  const b = toWorld(pad, [0, -pad.size[1] / 2 - 0.04, 0]);
  kit.beam(g, a, b, 0.07);
  tLeg(kit, g, b[0], b[2], b[1], 0.26);
  tLeg(kit, g, a[0], a[2], a[1], 0.26);
  // Rolo atrás dos tornozelos: sobre a parte de trás da perna, logo acima do tornozelo.
  const ankle = jointPosition(f.pose, 'foot_r');
  const knee = jointPosition(f.pose, 'shank_r');
  const shank = f.pose.world.get('shank_r');
  if (shank) {
    const up = normalize(sub(knee, ankle));
    const back = rotate(shank.rotation, [0, 0, -1]);
    const c0 = add(add(ankle, scale(up, 0.07)), scale(back, 0.065));
    const c: Vec3 = [0, c0[1], c0[2]];
    roller(kit, g, c, 0.36, 0.045);
    kit.beam(g, [0, c[1], c[2]], nearestOn(a, b, c), 0.04);
  }
  return { group: g };
};

export const nordicAnchor: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const pad = padOf(frames);
  const c = pad?.centers[0];
  const base = blocks(frames).find((e) => e.role === 'platform');
  if (!c) return { group: g };
  const top = base ? base.center[1] + base.size[1] / 2 : 0;
  for (const s of [-1, 1]) {
    const x = c[0] + s * 0.23;
    kit.beam(g, [x, top, c[2] - 0.02], [x, c[1] + 0.03, c[2]], 0.04);
    const foot = kit.mesh(kit.geo(padGeometry(0.08, 0.012, 0.12, 0.004)), kit.mat('steel'), g);
    foot.position.set(x, top + 0.006, c[2] - 0.02);
  }
  kit.rod(g, [c[0] - 0.23, c[1], c[2]], [c[0] + 0.23, c[1], c[2]], 0.012, 'chrome');
  return { group: g };
};
