/**
 * Máquinas: estrutura de tubo, eixo onde a articulação gira, braço que acompanha o movimento, carga (pilha ou anilhas) e
 * pegadores sob as mãos. Tudo sai das peças e da pose do próprio clipe (assento, encosto, rolos, trilhos, braço pendular),
 * então o eixo cai no joelho, no ombro ou no quadril do corpo de 1,75 m sem coordenada repetida.
 * - `leg_extension`, `leg_curl_seated`, `leg_curl_lying`: torre até o cubo da alavanca no joelho (a alavanca é do rolo).
 * - `hack_squat`, `pendulum`, `leg_press`: trenó nos trilhos ou braço no eixo de trás, ombreiras, chifres de anilha.
 * - `calf_standing`, `calf_seated`: carro das ombreiras nas guias com pilha; alavanca do rolo da coxa com anilhas.
 * - `hip_abductor` (abdução, adução, inclinada), `pec_deck` (e o inverso), `chest_press`, `shoulder_press`.
 */
import { Group, Matrix4, type Mesh, Vector3 } from 'three';
import { skeletonDef } from '@/data';
import { jointPosition, pointToWorld } from '@/engine/kinematics/fk';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { MotionFrame } from '@/engine/motion/evaluate';
import { add, cross, dot, length, lerp, normalize, rotate, scale, sub, type Vec3 } from '@/engine/math/vec';
import { orient, placeBeam, stretch, type GearKit } from '../kit';
import { ball, padGeometry, plateGeometry, rod, rollerGeometry, sheaveGeometry } from '../parts';
import { weightStack } from '../stack';
import { blocks, flatBench, foot, toWorld } from './bench';
import type { StationBuilder, StationView } from './index';

type Eq = MotionFrame['equipment'][number];
type Block = Extract<Eq, { kind: 'block' }>;
type Rail = Extract<Eq, { kind: 'rail' }>;
type Side = 'r' | 'l';

/** Altura do eixo das vigas de chão. */
const F = 0.04;
const X: Vec3 = [1, 0, 0];
const SIDES: readonly Side[] = ['r', 'l'];
/** Lado direito do sujeito = −X. */
const sx = (s: Side) => (s === 'r' ? -1 : 1);

const find = <K extends Eq['kind']>(f: MotionFrame | undefined, kind: K) => f?.equipment.find((e): e is Extract<Eq, { kind: K }> => e.kind === kind);
const movingBlock = (f: MotionFrame, role: string) => f.equipment.find((e): e is Block => e.kind === 'block' && e.moving && e.role === role);
const joint = (f: MotionFrame, seg: string) => jointPosition(f.pose, seg);
const handAxis = (f: MotionFrame, s: Side): Vec3 => {
  const h = f.pose.world.get(`hand_${s}`);
  return h ? rotate(h.rotation, X) : X;
};

let tips: Record<Side, Vec3> | null = null;
/** Cabeça dos metatarsos (ponta do pé) no mundo: onde o pé encosta na plataforma do leg press. */
function footTip(f: MotionFrame, s: Side): Vec3 {
  if (!tips) {
    const sk = buildSkeleton(skeletonDef);
    tips = { r: sk.byId.get('foot_r')?.tip ?? [0, 0, 0.15], l: sk.byId.get('foot_l')?.tip ?? [0, 0, 0.15] };
  }
  return pointToWorld(f.pose, `foot_${s}`, tips[s]);
}

// ---- Peças ----

/** Viga que anda: criada uma vez, reposta a cada quadro. */
function mover(kit: GearKit, g: Group, w = 0.06, finish: 'steel' | 'chrome' = 'steel') {
  const m = kit.beam(g, [0, 0, 0], [0, 1, 0], w, finish);
  return (a: Vec3, b: Vec3) => placeBeam(m, a, b, w);
}

/** Pegador de borracha centrado na pegada, ao longo do eixo da palma; devolve as pontas. */
function handle(kit: GearKit, g: Group) {
  const grip = kit.tube(g, 'rubber');
  const caps = [kit.mesh(kit.geo(ball(0.021)), kit.mat('steel'), g), kit.mesh(kit.geo(ball(0.021)), kit.mat('steel'), g)];
  return (p: Vec3, axis: Vec3): [Vec3, Vec3] => {
    const a = add(p, scale(axis, -0.07));
    const b = add(p, scale(axis, 0.07));
    stretch(grip, a, b, 0.017);
    caps[0]?.position.set(a[0], a[1], a[2]);
    caps[1]?.position.set(b[0], b[1], b[2]);
    return [a, b];
  };
}

/** Ponta do pegador por onde ele prende: a de cima se ele está em pé, senão a de fora. */
const mount = ([a, b]: [Vec3, Vec3], s: Side): Vec3 => {
  const up = Math.abs(a[1] - b[1]) > 0.7 * length(sub(a, b));
  if (up) return a[1] > b[1] ? a : b;
  return a[0] * sx(s) > b[0] * sx(s) ? a : b;
};

/** Chifre de anilha saindo de `at` na direção `dir`, com anilha e trava. */
function horn(kit: GearKit, g: Group) {
  const r = kit.tube(g, 'chrome');
  const plate = kit.mesh(kit.geo(plateGeometry(0.36, 0.035)), kit.mat('iron'), g);
  const collar = kit.tube(g, 'steel');
  return (at: Vec3, dir: Vec3) => {
    stretch(r, at, add(at, scale(dir, 0.24)), 0.025);
    orient(plate, add(at, scale(dir, 0.09)), dir);
    stretch(collar, add(at, scale(dir, 0.115)), add(at, scale(dir, 0.145)), 0.034);
  };
}

/** Cubo do eixo (cilindro curto ao longo de `axis`). */
function hub(kit: GearKit, g: Group, c: Vec3, axis: Vec3, r = 0.05, len = 0.08) {
  orient(kit.mesh(kit.geo(rod(r, len, 28)), kit.mat('chrome'), g), c, axis);
}

/** Travessa no chão com pés de borracha nas pontas. */
function cross_(kit: GearKit, g: Group, x: number, z: number, half: number) {
  kit.beam(g, [x - half, 0.03, z], [x + half, 0.03, z], 0.05);
  foot(kit, g, x - half, z);
  foot(kit, g, x + half, z);
}

/** Pino de regulagem com manopla, saindo para fora do lado direito. */
function pinKnob(kit: GearKit, g: Group, p: Vec3) {
  kit.rod(g, p, [p[0] - 0.05, p[1], p[2]], 0.007, 'chrome');
  kit.mesh(kit.geo(ball(0.016)), kit.mat('rubber'), g).position.set(p[0] - 0.06, p[1], p[2]);
}

/**
 * Cadeira da máquina: longarina no chão, coluna do assento com pino, coluna do encosto (ou do apoio do peito) e espinha
 * na chapa do encosto. Devolve as pontas da longarina.
 */
function chair(kit: GearKit, g: Group, seat: Block, back?: Block) {
  const x = seat.center[0];
  const [, sh, sd] = seat.size;
  const z = seat.center[2];
  const low = seat.center[1] - sh / 2 - 0.012;
  let rear = z - sd / 2 + 0.04;
  let front = z + sd / 2 - 0.04;
  kit.beam(g, [x, low, z], [x, F, z], 0.07);
  kit.beam(g, [x, low - 0.02, z - sd * 0.35], [x, low - 0.02, z + sd * 0.35], 0.05);
  pinKnob(kit, g, [x - 0.035, (low + F) / 2, z]);
  if (back) {
    const [, bh, bd] = back.size;
    const lo = toWorld(back, [0, -bh / 2 + 0.06, -bd / 2 - 0.02]);
    const hi = toWorld(back, [0, bh / 2 - 0.08, -bd / 2 - 0.02]);
    const mid = toWorld(back, [0, -bh * 0.1, -bd / 2 - 0.03]);
    kit.beam(g, lo, hi, 0.05);
    kit.beam(g, mid, [x, F, mid[2]], 0.07);
    rear = Math.min(rear, mid[2]);
    front = Math.max(front, mid[2]);
  }
  kit.beam(g, [x, F, rear - 0.06], [x, F, front + 0.06], 0.08);
  cross_(kit, g, x, rear - 0.02, 0.26);
  cross_(kit, g, x, front + 0.02, 0.26);
  return { x, rear, front, low };
}

/** Pegadores parados nas mãos (quadro 0), com haste até o ponto de apoio de cada lado. */
function fixedHandles(kit: GearKit, g: Group, f: MotionFrame, to: (s: Side, end: Vec3) => Vec3) {
  for (const s of SIDES) {
    const ends = handle(kit, g)(f.grips[s], handAxis(f, s));
    const m = mount(ends, s);
    kit.beam(g, m, to(s, m), 0.03);
  }
}

/** Pilha com capa, numa base no chão; a parte presa sobe `lift`. `yaw` vira a capa para longe da pessoa. */
function stackAt(kit: GearKit, g: Group, at: Vec3, yaw: number, guideTop = 1.7) {
  const s = weightStack(kit, g, guideTop);
  s.root.position.set(at[0], 0, at[2]);
  s.root.rotation.y = yaw;
  const base = kit.mesh(kit.geo(padGeometry(0.42, 0.04, 0.36, 0.01)), kit.mat('steel'), g);
  base.position.set(at[0], 0.02, at[2]);
  const sheave = kit.mesh(kit.geo(sheaveGeometry(0.04, 0.02)), kit.mat('chrome'), g);
  sheave.rotation.z = Math.PI / 2;
  sheave.rotation.y = yaw;
  const top: Vec3 = [at[0], guideTop + 0.06, at[2]];
  sheave.position.set(top[0], top[1], top[2]);
  const up = kit.tube(g, 'cable');
  const out = kit.tube(g, 'cable');
  return {
    /** Sobe a pilha e estica o cabo do topo da pilha à roldana e dela até `to`. */
    set(lift: number, to: Vec3) {
      const m = Math.max(0, Math.min(0.42, lift));
      s.lift(m);
      stretch(up, [at[0], s.top + m, at[2]], [top[0], top[1] - 0.04, top[2]], 0.0032);
      stretch(out, [top[0], top[1] + 0.04, top[2]], to, 0.0032);
    },
  };
}

/** Torre até o cubo da alavanca do rolo (por dentro do braço da alavanca, que corre a 0,22 m do eixo). */
function leverTower(kit: GearKit, g: Group, f: MotionFrame, toward: Vec3) {
  const pad = find(f, 'pad');
  const p = pad?.pivot;
  if (!p) return null;
  const lever = p[0] - 0.22;
  const tx = lever + 0.065;
  const c: Vec3 = [tx, p[1], p[2]];
  kit.beam(g, [tx, p[1] + 0.06, p[2]], [tx, F, p[2]], 0.07);
  kit.beam(g, [tx, F, p[2]], [toward[0], F, toward[2]], 0.07);
  cross_(kit, g, tx, p[2], 0.16);
  kit.rod(g, [lever + 0.02, p[1], p[2]], [tx + 0.045, p[1], p[2]], 0.02, 'chrome');
  // Disco de amplitude com o pino de regulagem.
  hub(kit, g, [tx + 0.04, p[1], p[2]], X, 0.075, 0.012);
  kit.mesh(kit.geo(ball(0.014)), kit.mat('rubber'), g).position.set(tx + 0.055, p[1] + 0.055, p[2] - 0.03);
  return c;
}

// ---- Extensora e flexoras ----

export const legExtension: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f = frames[0];
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  if (!f || !seat) return { group: g };
  const ch = chair(kit, g, seat, all.find((e) => e.role === 'back'));
  leverTower(kit, g, f, [ch.x, F, seat.center[2]]);
  fixedHandles(kit, g, f, (s, m) => [sx(s) * 0.17, ch.low - 0.02, m[2]]);
  return { group: g };
};

export const legCurlSeated: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f = frames[0];
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  if (!f || !seat) return { group: g };
  const ch = chair(kit, g, seat, all.find((e) => e.role === 'back'));
  const tower = leverTower(kit, g, f, [ch.x, F, seat.center[2]]);
  // Rolo que trava as coxas logo atrás do joelho, preso por uma alavanca curta à torre.
  const hip = joint(f, 'thigh_r');
  const knee = joint(f, 'shank_r');
  const at = lerp(hip, knee, 0.8);
  const c: Vec3 = [0, at[1] + 0.135, at[2]];
  const roll = kit.mesh(kit.geo(rollerGeometry(0.05, 0.42)), kit.mat('pad'), g);
  orient(roll, c, X);
  const end: Vec3 = [-0.25, c[1], c[2]];
  kit.rod(g, end, [0.25, c[1], c[2]], 0.012, 'chrome');
  if (tower) {
    kit.beam(g, [tower[0], c[1], c[2]], end, 0.045);
    kit.beam(g, [tower[0], c[1], c[2]], [tower[0], tower[1] + 0.06, tower[2]], 0.05);
    pinKnob(kit, g, [tower[0] - 0.03, (c[1] + tower[1]) / 2, (c[2] + tower[2]) / 2]);
  }
  fixedHandles(kit, g, f, (s) => [sx(s) * 0.25, c[1], c[2]]);
  return { group: g };
};

export const legCurlLying: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f = frames[0];
  const bench = blocks(frames).find((e) => e.role === 'bench');
  if (!f || !bench) return { group: g };
  g.add(flatBench({ frames, kit }, {}).group);
  const zEnd = bench.center[2] - bench.size[2] / 2 + 0.14;
  leverTower(kit, g, f, [0, F, zEnd]);
  const under = bench.center[1] - bench.size[1] / 2 - 0.02;
  fixedHandles(kit, g, f, (s, m) => [sx(s) * 0.12, under, m[2]]);
  return { group: g };
};

// ---- Panturrilha ----

export const calfStanding: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f0 = frames[0];
  const pad = find(f0, 'pad');
  const step = blocks(frames).find((e) => e.role === 'step');
  if (!f0 || !pad || pad.centers.length < 2) return { group: g };
  const c0 = pad.centers[0] ?? [0, 1.5, 0];
  const zU = c0[2] - 0.3;
  const W = 0.32;
  const H = 2.15;
  for (const s of [-1, 1]) {
    kit.beam(g, [s * W, F, zU], [s * W, H, zU], 0.08);
    kit.beam(g, [s * W, F, zU - 0.3], [s * W, F, (step?.center[2] ?? c0[2]) + 0.12], 0.08);
  }
  kit.beam(g, [-W, H, zU], [W, H, zU], 0.08);
  kit.beam(g, [-W, 0.25, zU], [W, 0.25, zU], 0.06);
  cross_(kit, g, 0, zU - 0.3, W + 0.04);
  if (step) cross_(kit, g, 0, step.center[2] + 0.12, W + 0.04);
  // Pilha atrás, ligada ao carro por uma haste rígida: sobe junto com as ombreiras.
  const zS = zU - 0.32;
  const stack = weightStack(kit, g, 1.6);
  stack.root.position.set(0, 0, zS);
  stack.root.rotation.y = Math.PI;
  const link = mover(kit, g, 0.05);
  const stem = mover(kit, g, 0.02, 'chrome');
  const carriage = mover(kit, g, 0.07);
  const sleeves = SIDES.map(() => kit.mesh(kit.geo(padGeometry(0.12, 0.16, 0.12, 0.01)), kit.mat('steel'), g));
  const arms = SIDES.map(() => mover(kit, g, 0.05));
  const stems = SIDES.map(() => mover(kit, g, 0.03));
  const grips = SIDES.map(() => handle(kit, g));
  return {
    group: g,
    update(f) {
      const p = find(f, 'pad');
      if (!p) return;
      const y = (p.centers[0] ?? c0)[1];
      carriage([-W - 0.05, y, zU], [W + 0.05, y, zU]);
      const lift = Math.max(0, y - c0[1]);
      stack.lift(lift);
      link([0, y, zU], [0, y, zS]);
      stem([0, y, zS], [0, stack.top + lift, zS]);
      SIDES.forEach((s, i) => {
        const c = p.centers[i] ?? c0;
        sleeves[i]?.position.set(sx(s) * W, y, zU);
        const outer: Vec3 = [c[0] + sx(s) * 0.1, c[1], c[2]];
        const from: Vec3 = [sx(s) * W, y, zU];
        arms[i]?.(from, outer);
        const ends = grips[i]?.(f.grips[s], handAxis(f, s));
        if (ends) stems[i]?.(mount(ends, s), lerp(from, outer, 0.6));
      });
    },
  };
};

export const calfSeated: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f0 = frames[0];
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  const step = all.find((e) => e.role === 'step');
  const pad = find(f0, 'pad');
  if (!f0 || !seat || !step || !pad) return { group: g };
  const ch = chair(kit, g, seat);
  const W = 0.27;
  const zP = step.center[2] + step.size[2] / 2 + 0.2;
  const yP = 0.3;
  kit.beam(g, [ch.x, F, ch.front], [ch.x, F, zP + 0.08], 0.08);
  kit.beam(g, [ch.x, F, step.center[2]], [ch.x, step.center[1], step.center[2]], 0.06);
  for (const s of [-1, 1]) {
    kit.beam(g, [s * W, yP + 0.05, zP], [s * W, F, zP], 0.07);
    hub(kit, g, [s * (W + 0.05), yP, zP], X);
  }
  kit.beam(g, [-W, F, zP], [W, F, zP], 0.07);
  cross_(kit, g, 0, zP + 0.08, W + 0.06);
  const levers = SIDES.map(() => mover(kit, g, 0.06));
  const horns = SIDES.map(() => horn(kit, g));
  const bar = kit.tube(g, 'chrome');
  const grips = SIDES.map(() => handle(kit, g));
  const stems = SIDES.map(() => mover(kit, g, 0.03));
  return {
    group: g,
    update(f) {
      const p = find(f, 'pad');
      const c = p?.centers[0];
      if (!c) return;
      stretch(bar, [-W - 0.03, c[1], c[2]], [W + 0.03, c[1], c[2]], 0.016);
      SIDES.forEach((s, i) => {
        const q: Vec3 = [sx(s) * (W + 0.05), c[1], c[2]];
        levers[i]?.([sx(s) * (W + 0.05), yP, zP], q);
        horns[i]?.(add(q, [sx(s) * 0.03, 0.02, 0.02]), [sx(s), 0, 0]);
        const ends = grips[i]?.(f.grips[s], handAxis(f, s));
        if (ends) stems[i]?.(mount(ends, s), [f.grips[s][0], c[1], c[2]]);
      });
    },
  };
};

// ---- Abdutora ----

export const hipAbductor: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f0 = frames[0];
  const fl = frames[frames.length - 1];
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  if (!f0 || !fl || !seat) return { group: g };
  const ch = chair(kit, g, seat, all.find((e) => e.role === 'back'));
  // Abdução: o joelho abre de u = 0 para u = 1 e o apoio fica por fora; adução, por dentro.
  const abd = Math.abs(joint(fl, 'shank_r')[0]) > Math.abs(joint(f0, 'shank_r')[0]);
  const yA = ch.low - 0.07;
  const hips = SIDES.map((s) => joint(f0, `thigh_${s}`));
  for (const h of hips) {
    kit.rod(g, [h[0], yA - 0.06, h[2]], [h[0], ch.low, h[2]], 0.03, 'chrome');
    hub(kit, g, [h[0], yA, h[2]], [0, 1, 0], 0.045, 0.06);
  }
  kit.beam(g, [hips[0]?.[0] ?? -0.1, ch.low - 0.01, hips[0]?.[2] ?? 0], [hips[1]?.[0] ?? 0.1, ch.low - 0.01, hips[1]?.[2] ?? 0], 0.06);
  // Pegadores: ao lado do assento, ou num quadro à frente (inclinada).
  fixedHandles(kit, g, f0, (s, m) => (m[2] > seat.center[2] + seat.size[2] ? [m[0], F, m[2] + 0.02] : [sx(s) * 0.17, ch.low - 0.02, m[2]]));
  const lean = f0.grips.r[2] > seat.center[2] + seat.size[2];
  if (lean) {
    kit.beam(g, [-Math.abs(f0.grips.r[0]), F, f0.grips.r[2] + 0.02], [Math.abs(f0.grips.r[0]), F, f0.grips.r[2] + 0.02], 0.06);
    kit.beam(g, [ch.x, F, ch.front], [ch.x, F, f0.grips.r[2] + 0.02], 0.08);
  }
  const zS = ch.rear - 0.32;
  const stack = stackAt(kit, g, [0, 0, zS], Math.PI, 1.3);
  const pads = SIDES.map(() => kit.mesh(kit.geo(padGeometry(0.06, 0.2, 0.17, 0.025)), kit.mat('pad', 3, 1, [0.06, 0.2, 0.17]), g));
  const plates = SIDES.map(() => kit.mesh(kit.geo(padGeometry(0.012, 0.17, 0.14, 0.004)), kit.mat('steel'), g));
  const arms = SIDES.map(() => mover(kit, g, 0.05));
  const posts = SIDES.map(() => mover(kit, g, 0.045));
  const struts = SIDES.map(() => mover(kit, g, 0.035));
  const pegs = SIDES.map(() => kit.tube(g, 'rubber'));
  const k0 = joint(f0, 'shank_r');
  return {
    group: g,
    update(f) {
      SIDES.forEach((s, i) => {
        const h = joint(f, `thigh_${s}`);
        const k = joint(f, `shank_${s}`);
        const d = normalize(sub(k, h));
        // Lado de fora do joelho, no plano horizontal.
        const out = normalize(cross([0, 1, 0], d));
        const o = dot(out, [sx(s), 0, 0]) >= 0 ? out : scale(out, -1);
        const side = abd ? o : scale(o, -1);
        const c = add(add(h, scale(d, length(sub(k, h)) * 0.86)), scale(side, abd ? 0.1 : 0.088));
        const yaw = Math.atan2(d[0], d[2]);
        const pd = pads[i];
        const pl = plates[i];
        if (pd && pl) {
          pd.position.set(c[0], c[1], c[2]);
          pd.rotation.set(0, yaw, 0);
          const back = add(c, scale(side, 0.036));
          pl.position.set(back[0], back[1], back[2]);
          pl.rotation.set(0, yaw, 0);
        }
        const behind = add(c, scale(side, 0.05));
        const elbow: Vec3 = [behind[0], yA, behind[2]];
        const hp = hips[i] ?? h;
        arms[i]?.([hp[0], yA, hp[2]], elbow);
        posts[i]?.(elbow, behind);
        // Apoio do pé no braço, sob a ponta do pé.
        const a = joint(f, `foot_${s}`);
        const peg: Vec3 = [a[0], a[1] - 0.095, a[2] + 0.07];
        struts[i]?.(elbow, add(peg, scale(side, 0.07)));
        const pg = pegs[i];
        if (pg) stretch(pg, add(peg, scale(side, 0.07)), add(peg, scale(side, -0.06)), 0.02);
      });
      const k = joint(f, 'shank_r');
      stack.set(Math.hypot(k[0] - k0[0], k[2] - k0[2]) * 0.8, [0, ch.low - 0.04, ch.rear]);
    },
  };
};

// ---- Peitoral ----

/** Centro do círculo que passa por três pontos no plano XZ (eixo vertical do braço da voadora). */
function circleXZ(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const d = 2 * (a[0] * (b[2] - c[2]) + b[0] * (c[2] - a[2]) + c[0] * (a[2] - b[2]));
  if (Math.abs(d) < 1e-6) return null;
  const A = a[0] ** 2 + a[2] ** 2;
  const B = b[0] ** 2 + b[2] ** 2;
  const C = c[0] ** 2 + c[2] ** 2;
  return [(A * (b[2] - c[2]) + B * (c[2] - a[2]) + C * (a[2] - b[2])) / d, 0, (A * (c[0] - b[0]) + B * (a[0] - c[0]) + C * (b[0] - a[0])) / d];
}

export const pecDeck: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f0 = frames[0];
  const fm = frames[Math.floor(frames.length / 2)];
  const fl = frames[frames.length - 1];
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  const back = all.find((e) => e.role === 'back');
  if (!f0 || !fm || !fl || !seat || !back) return { group: g };
  const ch = chair(kit, g, seat, back);
  const TOP = 1.8;
  const pivots = SIDES.map((s) => {
    const c = circleXZ(f0.grips[s], fm.grips[s], fl.grips[s]);
    const sh = joint(f0, `upperarm_${s}`);
    return c && Math.hypot(c[0] - sh[0], c[2] - sh[2]) < 0.25 ? ([c[0], TOP, c[2]] as Vec3) : ([sh[0], TOP, sh[2]] as Vec3);
  });
  // Coluna atrás do encosto (ou à frente do apoio do peito, no inverso), topo até os eixos sobre os ombros.
  const post = toWorld(back, [0, 0, -back.size[2] / 2 - 0.12]);
  const away = Math.sign(post[2] - seat.center[2]) || -1;
  const zC = post[2];
  for (const s of [-1, 1]) {
    kit.beam(g, [s * 0.12, F, zC], [s * 0.12, TOP + 0.08, zC], 0.08);
  }
  kit.beam(g, [-0.16, TOP + 0.08, zC], [0.16, TOP + 0.08, zC], 0.08);
  kit.beam(g, [ch.x, F, ch.rear], [ch.x, F, zC], 0.08);
  cross_(kit, g, 0, zC, 0.3);
  for (const [i, p] of pivots.entries()) {
    const s = SIDES[i] ?? 'r';
    kit.beam(g, [sx(s) * 0.12, TOP + 0.08, zC], [p[0], TOP + 0.08, p[2]], 0.07);
    orient(kit.mesh(kit.geo(rod(0.045, 0.1, 24)), kit.mat('chrome'), g), p, [0, 1, 0]);
  }
  const pR = pivots[0] ?? [0, TOP, 0];
  const pL = pivots[1] ?? [0, TOP, 0];
  kit.beam(g, [pR[0], TOP + 0.08, pR[2]], [pL[0], TOP + 0.08, pL[2]], 0.06);
  const zS = zC + away * 0.32;
  const stack = stackAt(kit, g, [0, 0, zS], away < 0 ? Math.PI : 0, 1.6);
  const arms = SIDES.map(() => mover(kit, g, 0.06));
  const drops = SIDES.map(() => mover(kit, g, 0.045));
  const grips = SIDES.map(() => handle(kit, g));
  const ang = (f: MotionFrame) => Math.atan2(f.grips.r[0] - pR[0], f.grips.r[2] - pR[2]);
  const a0 = ang(f0);
  return {
    group: g,
    update(f) {
      SIDES.forEach((s, i) => {
        const p = pivots[i] ?? pR;
        const ends = grips[i]?.(f.grips[s], handAxis(f, s));
        if (!ends) return;
        const m = mount(ends, s);
        const q: Vec3 = [m[0], TOP - 0.02, m[2]];
        arms[i]?.([p[0], TOP - 0.02, p[2]], q);
        drops[i]?.(q, m);
      });
      stack.set(Math.abs(ang(f) - a0) * 0.22, [0, TOP + 0.05, zC]);
    },
  };
};

export const chestPress: StationBuilder = ({ frames, kit }, params) => {
  const g = new Group();
  const f0 = frames[0];
  const fl = frames[frames.length - 1];
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  const back = all.find((e) => e.role === 'back');
  if (!f0 || !fl || !seat || !back) return { group: g };
  const ch = chair(kit, g, seat, back);
  // Alavancas penduradas num eixo alto à frente, sobre o meio do curso: a pegada anda quase em linha reta.
  const pY = params.pivotY ?? 2.15;
  const pZ = params.pivotZ ?? (f0.grips.r[2] + fl.grips.r[2]) / 2;
  const half = Math.abs(f0.grips.r[0]) + 0.07;
  const zB = toWorld(back, [0, back.size[1] / 2, -back.size[2] / 2])[2] - 0.12;
  for (const s of [-1, 1]) {
    kit.beam(g, [s * half, F, zB], [s * half, pY + 0.06, zB], 0.09);
    kit.beam(g, [s * half, pY + 0.06, zB], [s * (half + 0.05), pY + 0.06, pZ], 0.08);
    hub(kit, g, [s * (half + 0.05), pY, pZ], X, 0.055, 0.1);
    cross_(kit, g, s * half, zB, 0.12);
  }
  kit.beam(g, [-half, pY + 0.1, zB], [half, pY + 0.1, zB], 0.08);
  kit.beam(g, [-half - 0.05, pY + 0.1, pZ], [half + 0.05, pY + 0.1, pZ], 0.07);
  kit.beam(g, [-half, F, zB], [half, F, zB], 0.07);
  kit.beam(g, [ch.x, F, ch.rear], [ch.x, F, zB], 0.08);
  // Pilha atrás do encosto, cabo até o meio do eixo alto.
  const stack = stackAt(kit, g, [0, 0, zB - 0.3], Math.PI, 1.7);
  const levers = SIDES.map(() => mover(kit, g, 0.06));
  const links = SIDES.map(() => mover(kit, g, 0.04));
  const grips = SIDES.map(() => handle(kit, g));
  return {
    group: g,
    update(f) {
      SIDES.forEach((s, i) => {
        const ends = grips[i]?.(f.grips[s], handAxis(f, s));
        if (!ends) return;
        const m = mount(ends, s);
        const top: Vec3 = [sx(s) * (half + 0.05), pY, pZ];
        const elbow: Vec3 = [sx(s) * (half + 0.05), m[1] + 0.06, m[2]];
        levers[i]?.(top, elbow);
        links[i]?.(elbow, m);
      });
      stack.set(length(sub(f.grips.r, f0.grips.r)) * 0.6, [0, pY + 0.1, pZ]);
    },
  };
};

export const shoulderPress: StationBuilder = ({ frames, kit }, params) => {
  const g = new Group();
  const f0 = frames[0];
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  const back = all.find((e) => e.role === 'back');
  if (!f0 || !seat || !back) return { group: g };
  const ch = chair(kit, g, seat, back);
  // Eixo atrás do encosto, na altura das mãos embaixo: as alavancas passam por fora dos ombros.
  const pY = params.pivotY ?? f0.grips.r[1];
  const pZ = params.pivotZ ?? -1.05;
  const half = Math.abs(f0.grips.r[0]) + 0.06;
  for (const s of [-1, 1]) {
    kit.beam(g, [s * half, F, pZ], [s * half, pY + 0.05, pZ], 0.09);
    hub(kit, g, [s * (half + 0.02), pY, pZ], X, 0.055, 0.1);
    cross_(kit, g, s * half, pZ, 0.12);
  }
  kit.beam(g, [-half, pY - 0.2, pZ], [half, pY - 0.2, pZ], 0.08);
  kit.beam(g, [-half, F, pZ], [half, F, pZ], 0.07);
  kit.beam(g, [ch.x, F, ch.rear], [ch.x, F, pZ], 0.08);
  const levers = SIDES.map(() => mover(kit, g, 0.06));
  const links = SIDES.map(() => mover(kit, g, 0.04));
  const horns = SIDES.map(() => horn(kit, g));
  const grips = SIDES.map(() => handle(kit, g));
  return {
    group: g,
    update(f) {
      SIDES.forEach((s, i) => {
        const ends = grips[i]?.(f.grips[s], handAxis(f, s));
        if (!ends) return;
        const m = mount(ends, s);
        const out: Vec3 = [m[0] + sx(s) * 0.07, m[1], m[2]];
        const p: Vec3 = [sx(s) * (half + 0.02), pY, pZ];
        levers[i]?.(p, out);
        links[i]?.(out, m);
        horns[i]?.(lerp(p, out, 0.22), [sx(s), 0, 0]);
      });
    },
  };
};

// ---- Agachamentos e leg press ----

/** Ombreiras ligadas a um ponto do trenó/braço, com os pegadores logo à frente delas. */
function shoulderPads(kit: GearKit, g: Group) {
  const arms = SIDES.map(() => mover(kit, g, 0.05));
  const stems = SIDES.map(() => mover(kit, g, 0.03));
  const grips = SIDES.map(() => handle(kit, g));
  return (f: MotionFrame, from: (s: Side) => Vec3) => {
    const p = find(f, 'pad');
    if (!p) return;
    SIDES.forEach((s, i) => {
      const c = p.centers[i];
      if (!c) return;
      const outer: Vec3 = [c[0] + sx(s) * 0.1, c[1], c[2]];
      const a = from(s);
      arms[i]?.(a, outer);
      const ends = grips[i]?.(f.grips[s], handAxis(f, s));
      if (ends) stems[i]?.(mount(ends, s), lerp(a, outer, 0.7));
    });
  };
}

/** Quatro patins num par de trilhos: `t` = posição do centro ao longo do trilho (m desde `from`). */
function sled(kit: GearKit, g: Group, r: Rail) {
  const n = normalize(sub(r.to, r.from));
  const shoes = Array.from({ length: 4 }, () => kit.mesh(kit.geo(padGeometry(0.075, 0.14, 0.075, 0.012)), kit.mat('steel'), g));
  const bars = [mover(kit, g, 0.055), mover(kit, g, 0.055)];
  return {
    n,
    at: (t: number, k = 0): Vec3 => add(r.from, scale(n, t + k)),
    set(t: number) {
      [-0.18, 0.18].forEach((k, j) => {
        const c = add(r.from, scale(n, t + k));
        const a = add(c, [-r.gauge / 2, 0, 0]);
        const b = add(c, [r.gauge / 2, 0, 0]);
        orient(shoes[j * 2] as Mesh, a, n);
        orient(shoes[j * 2 + 1] as Mesh, b, n);
        bars[j]?.(a, b);
      });
    },
  };
}

export const hackSquat: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f0 = frames[0];
  const rail = find(f0, 'rail');
  if (!f0 || !rail) return { group: g };
  const s = sled(kit, g, rail);
  const struts = [mover(kit, g, 0.06), mover(kit, g, 0.06)];
  const horns = SIDES.map(() => horn(kit, g));
  const hornArms = SIDES.map(() => mover(kit, g, 0.05));
  const pads = shoulderPads(kit, g);
  return {
    group: g,
    update(f) {
      const back = movingBlock(f, 'back');
      if (!back) return;
      const [, bh, bd] = back.size;
      const lo = toWorld(back, [0, -bh * 0.3, -bd / 2]);
      const hi = toWorld(back, [0, bh * 0.3, -bd / 2]);
      const mid = lerp(lo, hi, 0.5);
      const t = dot(sub(mid, rail.from), s.n);
      s.set(t);
      struts[0]?.(lo, s.at(t, -0.18));
      struts[1]?.(hi, s.at(t, 0.18));
      // Chifres no alto do trenó, por fora das ombreiras.
      SIDES.forEach((sd, i) => {
        hornArms[i]?.(add(s.at(t, 0.3), [sx(sd) * (rail.gauge / 2), 0, 0]), add(s.at(t, 0.3), [sx(sd) * 0.31, 0, 0]));
        horns[i]?.(add(s.at(t, 0.3), [sx(sd) * 0.3, 0, 0]), [sx(sd), 0, 0]);
      });
      pads(f, (sd) => add(s.at(t, 0.3), [sx(sd) * (rail.gauge / 2), 0, 0]));
    },
  };
};

export const pendulum: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f0 = frames[0];
  const sw = find(f0, 'swing');
  const plate = blocks(frames).find((e) => e.role === 'platform');
  if (!f0 || !sw) return { group: g };
  // Base: duas longarinas do eixo até a plataforma, plataforma em pés.
  const zF = plate ? plate.center[2] + plate.size[2] / 2 : 0.6;
  for (const s of [-1, 1]) kit.beam(g, [s * 0.26, F, sw.pivot[2]], [s * 0.26, F, zF], 0.08);
  kit.beam(g, [-0.3, F, zF], [0.3, F, zF], 0.07);
  cross_(kit, g, 0, zF, 0.32);
  if (plate) {
    for (const [x, z] of [[-0.25, -0.4], [0.25, -0.4], [-0.25, 0.4], [0.25, 0.4]] as const) {
      const p = toWorld(plate, [x, -plate.size[1] / 2, z * plate.size[2]]);
      kit.beam(g, p, [p[0], F, p[2]], 0.05);
    }
  }
  const bar = mover(kit, g, 0.07);
  const strut = mover(kit, g, 0.06);
  const horns = SIDES.map(() => horn(kit, g));
  const pads = shoulderPads(kit, g);
  return {
    group: g,
    update(f) {
      const w = find(f, 'swing');
      if (!w) return;
      bar(add(w.end, [-0.25, 0, 0]), add(w.end, [0.25, 0, 0]));
      const back = movingBlock(f, 'back');
      if (back) strut(w.end, toWorld(back, [0, 0, -back.size[2] / 2]));
      const k = lerp([w.pivot[0], w.pivot[1] + 0.06, w.pivot[2]], w.end, 0.2);
      SIDES.forEach((s, i) => horns[i]?.(add(k, [sx(s) * 0.3, 0, 0]), [sx(s), 0, 0]));
      pads(f, (s) => add(w.end, [sx(s) * 0.25, 0, 0]));
    },
  };
};

/**
 * Leg press: a chapa dos pés fica de frente para os trilhos, encostada na ponta dos pés, e o carro corre neles; dos dois
 * lados, chifres de anilha. Serve o leg press e a panturrilha nele (a chapa só anda o que a ponta do pé empurra).
 */
export const legPress: StationBuilder = ({ frames, kit }) => {
  const g = new Group();
  const f0 = frames[0];
  const rail = find(f0, 'rail');
  const all = blocks(frames);
  const seat = all.find((e) => e.role === 'seat');
  if (!f0 || !rail || !seat) return { group: g };
  const ch = chair(kit, g, seat, all.find((e) => e.role === 'back'));
  kit.beam(g, [ch.x, F, ch.front], [ch.x, F, Math.min(rail.from[2], rail.to[2])], 0.08);
  fixedHandles(kit, g, f0, (s, m) => [sx(s) * 0.17, ch.low - 0.02, m[2]]);
  const s = sled(kit, g, rail);
  const n = s.n;
  const m = normalize(cross(X, n));
  const up = m[1] >= 0 ? m : scale(m, -1);
  const tipAlong = (f: MotionFrame) => Math.max(dot(footTip(f, 'r'), n), dot(footTip(f, 'l'), n));
  const h = dot(sub(footTip(f0, 'r'), rail.from), up);
  const T = 0.035;
  const chapa = new Group();
  g.add(chapa);
  chapa.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(...X), new Vector3(...up), new Vector3(...n)));
  kit.mesh(kit.geo(padGeometry(0.74, 0.62, T, 0.006)), kit.mat('steel', 2, 0.03), chapa);
  for (const sd of [-1, 1]) kit.mesh(kit.geo(padGeometry(0.03, 0.62, 0.06, 0.006)), kit.mat('steel'), chapa).position.set(sd * 0.37, 0, 0.02);
  const legs = [mover(kit, g, 0.06), mover(kit, g, 0.06)];
  const horns = SIDES.map(() => horn(kit, g));
  const hornArms = SIDES.map(() => mover(kit, g, 0.05));
  return {
    group: g,
    update(f) {
      // Face da chapa = sola sob a ponta do pé (1,2 cm).
      const face = tipAlong(f) + 0.012;
      const t = face + T / 2 - dot(rail.from, n);
      const c = add(add(rail.from, scale(n, t)), scale(up, h - 0.06));
      chapa.position.set(c[0], c[1], c[2]);
      const tr = t + 0.08;
      s.set(tr);
      [-1, 1].forEach((sd, j) => legs[j]?.(add(c, add(scale(n, T), [sd * 0.25, 0, 0])), add(s.at(tr), [sd * (rail.gauge / 2), 0, 0])));
      // Chifres atrás da chapa, por fora dela: a anilha não cobre os pés.
      SIDES.forEach((sd, i) => {
        const base = add(s.at(tr, 0.12), scale(up, 0.1));
        hornArms[i]?.(add(base, [sx(sd) * 0.2, 0, 0]), add(base, [sx(sd) * 0.4, 0, 0]));
        horns[i]?.(add(base, [sx(sd) * 0.39, 0, 0]), [sx(sd), 0, 0]);
      });
    },
  } satisfies StationView;
};
