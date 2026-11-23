/**
 * Gaiola (`power_rack`) e suporte de supino (`bench_rack`). A barra do clipe dita tudo: os ganchos J ficam na altura da
 * barra no ponto mais alto da repetição (onde ela é tirada e devolvida; `params.hookY` sobrescreve, m), a gaiola se
 * centra nela e as barras de segurança passam abaixo do ponto mais baixo.
 */
import { BoxGeometry, Group, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { jointPosition } from '@/engine/kinematics/fk';
import type { MotionFrame } from '@/engine/motion/evaluate';
import type { Vec3 } from '@/engine/math/vec';
import type { GearKit } from '../kit';
import { padGeometry } from '../parts';
import type { StationBuilder } from './index';

const UPRIGHT = 0.075;
const BAR_R = 0.0142;

type Bar = Extract<MotionFrame['equipment'][number], { kind: 'barbell' }>;

export function barsOf(frames: readonly MotionFrame[]): Bar[] {
  return frames.flatMap((f) => f.equipment.filter((e): e is Bar => e.kind === 'barbell'));
}

const highest = (bars: readonly Bar[]): Bar | null => bars.reduce<Bar | null>((a, b) => (!a || b.center[1] > a.center[1] ? b : a), null);

/** Furação de 5 cm nas quatro faces do montante (uma geometria só para todos). */
function holes(kit: GearKit, g: Group, posts: readonly Vec3[], from: number, to: number) {
  const parts: BufferGeometry[] = [];
  const h = UPRIGHT / 2 + 0.0015;
  for (const [x, , z] of posts) {
    for (let y = from; y <= to; y += 0.05) {
      for (const [dx, dz, rot] of [
        [h, 0, true],
        [-h, 0, true],
        [0, h, false],
        [0, -h, false],
      ] as const) {
        const b = new BoxGeometry(rot ? 0.004 : 0.02, 0.024, rot ? 0.02 : 0.004);
        b.translate(x + dx, y, z + dz);
        parts.push(b);
      }
    }
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (merged) kit.mesh(kit.geo(merged), kit.mat('rubber'), g);
}

/** Gancho J preso ao montante, apontando para `dir` (unitário horizontal), com o topo do braço sob a barra. */
function jHook(kit: GearKit, g: Group, post: Vec3, top: number, dir: readonly [number, number], reach: number) {
  const sleeve = kit.mesh(kit.geo(padGeometry(UPRIGHT + 0.016, 0.16, UPRIGHT + 0.016, 0.006)), kit.mat('iron'), g);
  sleeve.position.set(post[0], top - 0.05, post[2]);
  const y = top - 0.015;
  const a: Vec3 = [post[0] + dir[0] * (UPRIGHT / 2), y, post[2] + dir[1] * (UPRIGHT / 2)];
  const b: Vec3 = [post[0] + dir[0] * (UPRIGHT / 2 + reach), y, post[2] + dir[1] * (UPRIGHT / 2 + reach)];
  kit.beam(g, a, b, 0.03, 'iron');
  // Revestimento de borracha onde a barra assenta e o lábio que segura.
  const liner = kit.mesh(kit.geo(padGeometry(0.034, 0.006, 0.034, 0.002)), kit.mat('rubber'), g);
  liner.position.set(b[0] - dir[0] * 0.03, top + 0.002, b[2] - dir[1] * 0.03);
  kit.beam(g, b, [b[0], y + 0.06, b[2]], 0.026, 'iron');
}

function foot(kit: GearKit, g: Group, x: number, z: number) {
  const f = kit.mesh(kit.geo(padGeometry(0.09, 0.016, 0.09, 0.005)), kit.mat('rubber'), g);
  f.position.set(x, 0.008, z);
}

export const powerRack: StationBuilder = ({ frames, kit }, params) => {
  const g = new Group();
  const bars = barsOf(frames);
  const top = highest(bars);
  const low = bars.reduce((a, b) => Math.min(a, b.center[1]), Infinity);
  const z0 = top?.center[2] ?? 0;
  const x0 = top?.center[0] ?? 0;
  const hookTop = (params.hookY ?? top?.center[1] ?? 1.4) - BAR_R;
  const H = params.height ?? 2.3;
  const X = params.width ?? 0.58;
  const front = z0 + 0.075;
  const back = front - (params.depth ?? 1.1);
  const posts: Vec3[] = [
    [x0 - X, 0, front],
    [x0 + X, 0, front],
    [x0 - X, 0, back],
    [x0 + X, 0, back],
  ];
  for (const p of posts) {
    kit.beam(g, [p[0], 0.03, p[2]], [p[0], H, p[2]], UPRIGHT);
    foot(kit, g, p[0], p[2]);
  }
  holes(kit, g, posts, 0.35, H - 0.2);
  // Base: longarinas no chão e travessa de trás; topo: travessas e laterais.
  for (const s of [-1, 1]) {
    kit.beam(g, [x0 + s * X, 0.04, front + 0.12], [x0 + s * X, 0.04, back - 0.12], 0.06);
    kit.beam(g, [x0 + s * X, H - 0.04, front], [x0 + s * X, H - 0.04, back], 0.06);
  }
  kit.beam(g, [x0 - X, 0.04, back], [x0 + X, 0.04, back], 0.06);
  for (const z of [front, back]) kit.beam(g, [x0 - X, H - 0.04, z], [x0 + X, H - 0.04, z], 0.06);
  for (const s of [-1, 1]) jHook(kit, g, [x0 + s * X, 0, front], hookTop, [0, -1], 0.08);
  // Barras de segurança: atravessam os montantes, abaixo do ponto mais baixo da barra.
  const safety = Math.max(0.3, (Number.isFinite(low) ? low : 0.9) - 0.09);
  for (const s of [-1, 1]) kit.rod(g, [x0 + s * X, safety, front + 0.14], [x0 + s * X, safety, back - 0.14], 0.022, 'chrome');
  return { group: g, floor: posts.map((p) => [p[0], 0, p[2]] as Vec3) };
};

export const benchRack: StationBuilder = ({ frames, kit }, params) => {
  const g = new Group();
  const bars = barsOf(frames);
  const top = highest(bars);
  const f0 = frames[0];
  // Para trás do banco = do quadril para a cabeça, no chão.
  let hd: [number, number] = [0, -1];
  if (f0) {
    const head = jointPosition(f0.pose, 'head');
    const hip = jointPosition(f0.pose, 'pelvis');
    const dx = head[0] - hip[0];
    const dz = head[2] - hip[2];
    const l = Math.hypot(dx, dz);
    if (l > 0.1) hd = [dx / l, dz / l];
  }
  const c = top?.center ?? [0, 1.1, 0];
  const hookTop = (params.hookY ?? c[1] - 0.06) - BAR_R;
  const X = params.width ?? 0.55;
  const back = 0.13;
  const side: [number, number] = [-hd[1], hd[0]];
  const posts: Vec3[] = [-1, 1].map((s) => [c[0] + side[0] * X * s + hd[0] * back, 0, c[2] + side[1] * X * s + hd[1] * back]);
  for (const p of posts) {
    kit.beam(g, [p[0], 0.03, p[2]], [p[0], hookTop + 0.16, p[2]], UPRIGHT);
    // Pé ao longo do banco, com borracha nas pontas.
    const a: Vec3 = [p[0] - hd[0] * 0.32, 0.035, p[2] - hd[1] * 0.32];
    const b: Vec3 = [p[0] + hd[0] * 0.3, 0.035, p[2] + hd[1] * 0.3];
    kit.beam(g, a, b, 0.06);
    foot(kit, g, a[0], a[2]);
    foot(kit, g, b[0], b[2]);
    jHook(kit, g, p, hookTop, [-hd[0], -hd[1]], 0.09);
  }
  const [p0, p1] = posts as [Vec3, Vec3];
  kit.beam(g, [p0[0] + hd[0] * 0.3, 0.05, p0[2] + hd[1] * 0.3], [p1[0] + hd[0] * 0.3, 0.05, p1[2] + hd[1] * 0.3], 0.06);
  kit.beam(g, [p0[0], 0.55, p0[2]], [p1[0], 0.55, p1[2]], 0.05);
  holes(kit, g, posts, 0.75, hookTop + 0.1);
  return { group: g, floor: posts.map((p) => [p[0], 0, p[2]] as Vec3) };
};
