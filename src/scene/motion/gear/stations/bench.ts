/**
 * Bancos: a estrutura sob o estofado que o clipe já tem. `flat_bench`: longarina, duas pernas em T com borracha.
 * `adjustable_bench`: assento e encosto com regulagem à vista (escada de dentes, escora do encosto, pino do assento),
 * longarina no chão, rodízios na frente e alça atrás. `preacher_bench` (Scott): assento numa coluna, almofada inclinada
 * noutra à frente, apoio da barra acima da ponta alta da almofada.
 */
import { Group } from 'three';
import type { MotionFrame } from '@/engine/motion/evaluate';
import type { Vec3 } from '@/engine/math/vec';
import type { GearKit } from '../kit';
import { ball, padGeometry, rod } from '../parts';
import type { StationBuilder } from './index';

type Block = Extract<MotionFrame['equipment'][number], { kind: 'block' }>;

const PAD_H = 0.08;
const DEG = Math.PI / 180;

export function blocks(frames: readonly MotionFrame[]): Block[] {
  return (frames[0]?.equipment ?? []).filter((e): e is Block => e.kind === 'block' && !e.moving);
}

/** Ponto local da peça (centro, inclinação em X) no mundo. */
export function toWorld(b: Block, l: Vec3): Vec3 {
  const a = b.pitch * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [b.center[0] + l[0], b.center[1] + l[1] * c - l[2] * s, b.center[2] + l[1] * s + l[2] * c];
}

function foot(kit: GearKit, g: Group, x: number, z: number, w = 0.07) {
  const f = kit.mesh(kit.geo(padGeometry(w, 0.02, 0.06, 0.006)), kit.mat('rubber'), g);
  f.position.set(x, 0.01, z);
}

/** Perna em T: coluna da longarina ao chão e travessa no chão com borracha nas pontas. */
export function tLeg(kit: GearKit, g: Group, x: number, z: number, top: number, half = 0.24) {
  kit.beam(g, [x, top, z], [x, 0.045, z], 0.06);
  kit.beam(g, [x - half, 0.03, z], [x + half, 0.03, z], 0.05);
  foot(kit, g, x - half, z);
  foot(kit, g, x + half, z);
}

export const flatBench: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const b = blocks(frames).find((e) => e.role === 'bench' && Math.abs(e.pitch) < 10 && e.size[2] > e.size[1]);
  if (!b) return { group: g };
  const [w, h, L] = b.size;
  const spine = b.center[1] + h / 2 - Math.min(h, PAD_H) - 0.045;
  const z0 = b.center[2] - L / 2 + 0.14;
  const z1 = b.center[2] + L / 2 - 0.14;
  kit.beam(g, [b.center[0], spine, z0 - 0.06], [b.center[0], spine, z1 + 0.06], 0.07);
  for (const z of [z0, z1]) tLeg(kit, g, b.center[0], z, spine, Math.max(0.2, w * 0.8));
  // Alça de carregar na ponta de trás.
  kit.rod(g, [b.center[0], spine, z0 - 0.06], [b.center[0], spine - 0.02, z0 - 0.16], 0.012, 'chrome');
  return { group: g };
};

export const adjustableBench: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  const back = all.find((e) => (e.role === 'back' || e.role === 'bench') && e !== seat);
  if (!seat || !back) return flatBench({ frames, kit }, {});
  const x = seat.center[0];
  const [, sh, sd] = seat.size;
  const [, bh, bd] = back.size;
  // Ponta de baixo do encosto (dobradiça) e ponta de cima, atrás da espuma.
  const hinge = toWorld(back, [0, -bh / 2 + 0.03, -bd / 2 - 0.03]);
  const upper = toWorld(back, [0, bh * 0.05, -bd / 2 - 0.02]);
  const tip = toWorld(back, [0, bh / 2, -bd / 2]);
  const yS = 0.1;
  const front = seat.center[2] + sd / 2 + 0.18;
  const rear = Math.min(tip[2], hinge[2]) - 0.12;
  const dir = Math.sign(front - rear) || 1;
  kit.beam(g, [x, yS, front], [x, yS, rear], 0.07);
  // Frente: travessa com rodízios; trás: travessa com borracha e alça.
  kit.beam(g, [x - 0.26, 0.05, front], [x + 0.26, 0.05, front], 0.055);
  for (const s of [-1, 1]) {
    const wheel = kit.mesh(kit.geo(rod(0.038, 0.03, 24)), kit.mat('rubber'), g);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x + s * 0.3, 0.038, front + dir * 0.02);
    const hub = kit.mesh(kit.geo(rod(0.012, 0.034, 12)), kit.mat('chrome'), g);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(wheel.position);
  }
  kit.beam(g, [x - 0.24, 0.03, rear], [x + 0.24, 0.03, rear], 0.05);
  foot(kit, g, x - 0.24, rear);
  foot(kit, g, x + 0.24, rear);
  kit.rod(g, [x, yS, rear], [x, 0.34, rear - dir * 0.12], 0.014, 'chrome');
  // Assento: coluna até a longarina, pino de regulagem com manopla.
  const seatLow = seat.center[1] - sh / 2 - 0.012;
  kit.beam(g, [x, seatLow, seat.center[2]], [x, yS, seat.center[2]], 0.06);
  kit.beam(g, [x, seatLow - 0.02, seat.center[2] - sd * 0.35], [x, seatLow - 0.02, seat.center[2] + sd * 0.35], 0.05);
  const pinY = (seatLow + yS) / 2;
  kit.rod(g, [x - 0.03, pinY, seat.center[2]], [x - 0.075, pinY, seat.center[2]], 0.007, 'chrome');
  const knob = kit.mesh(kit.geo(ball(0.016)), kit.mat('rubber'), g);
  knob.position.set(x - 0.085, pinY, seat.center[2]);
  // Encosto: dobradiça com eixo, coluna à longarina; escada de dentes atrás e escora até o dente.
  kit.rod(g, [x - 0.05, hinge[1], hinge[2]], [x + 0.05, hinge[1], hinge[2]], 0.014, 'chrome');
  kit.beam(g, [x, hinge[1], hinge[2]], [x, yS, hinge[2]], 0.06);
  const l0 = hinge[2] - dir * 0.06;
  const l1 = rear + dir * 0.08;
  const ladderY = yS + 0.06;
  kit.beam(g, [x, ladderY, l0], [x, ladderY, l1], 0.045);
  const n = Math.max(3, Math.floor(Math.abs(l1 - l0) / 0.045));
  for (let i = 0; i <= n; i++) {
    const tooth = kit.mesh(kit.geo(padGeometry(0.05, 0.018, 0.012, 0.003)), kit.mat('iron'), g);
    tooth.position.set(x, ladderY + 0.03, l0 + ((l1 - l0) * i) / n);
  }
  // A escora desce da chapa do encosto até o dente que fica sob ela (o mais perto na escada).
  const notch = Math.min(Math.max(upper[2] - dir * 0.05, Math.min(l0, l1)), Math.max(l0, l1));
  for (const s of [-1, 1]) kit.beam(g, [x + s * 0.035, upper[1], upper[2]], [x + s * 0.035, ladderY + 0.035, notch], 0.022);
  kit.rod(g, [x - 0.05, ladderY + 0.035, notch], [x + 0.05, ladderY + 0.035, notch], 0.008, 'chrome');
  return { group: g };
};

export const preacherBench: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  const pad = all.find((e) => e.role === 'bench' && Math.abs(e.pitch) >= 15);
  if (!seat || !pad) return { group: g };
  const x = pad.center[0];
  const [w, h, d] = pad.size;
  // Chapa sob a almofada, com o suporte no meio; ponta alta (lado da pessoa) leva o apoio da barra.
  const under = toWorld(pad, [0, -h / 2 - 0.03, 0]);
  const high = toWorld(pad, [0, h / 2, -d / 2]);
  const yS = 0.06;
  const zSeat = seat.center[2];
  const zBack = zSeat - 0.22;
  const zFront = under[2] + 0.18;
  kit.beam(g, [x, yS, zBack], [x, yS, zFront], 0.07);
  for (const z of [zBack, zFront]) {
    kit.beam(g, [x - 0.28, 0.03, z], [x + 0.28, 0.03, z], 0.05);
    foot(kit, g, x - 0.28, z);
    foot(kit, g, x + 0.28, z);
  }
  // Assento: coluna com pino de regulagem.
  const seatLow = seat.center[1] - seat.size[1] / 2 - 0.012;
  kit.beam(g, [seat.center[0], seatLow, zSeat], [seat.center[0], yS, zSeat], 0.06);
  const pinY = (seatLow + yS) / 2;
  kit.rod(g, [seat.center[0] - 0.03, pinY, zSeat], [seat.center[0] - 0.075, pinY, zSeat], 0.007, 'chrome');
  const knob = kit.mesh(kit.geo(ball(0.016)), kit.mat('rubber'), g);
  knob.position.set(seat.center[0] - 0.085, pinY, zSeat);
  // Almofada: coluna até a chapa, com mão-francesa para a base.
  kit.beam(g, [x, yS, under[2]], [x, under[1], under[2]], 0.07);
  kit.beam(g, [x, yS, zFront], [x, (yS + under[1]) / 2, under[2]], 0.045);
  // Apoio da barra: dois braços da coluna até acima da ponta alta, cada um com um gancho em U por fora da almofada.
  const restY = high[1] + 0.06;
  const restZ = high[2] + 0.07;
  const fork = (sx: number) => {
    const rx = x + sx * (w / 2 + 0.04);
    kit.beam(g, [x + sx * 0.05, under[1] - 0.05, under[2]], [rx, restY - 0.03, restZ], 0.035);
    kit.rod(g, [rx, restY - 0.03, restZ - 0.035], [rx, restY - 0.03, restZ + 0.035], 0.012, 'chrome');
    for (const dz of [-0.035, 0.035]) kit.rod(g, [rx, restY - 0.03, restZ + dz], [rx, restY + 0.02, restZ + dz], 0.008, 'chrome');
  };
  fork(-1);
  fork(1);
  return { group: g };
};
