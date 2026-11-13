/**
 * Moldes parametrizados: geram um clipe completo a partir de poucos números. Quatro famílias:
 * - curl: arco de um cotovelo (rosca, tríceps), em pé ou no banco inclinado, com halter ou polia;
 * - press: empurrar com a pegada num caminho (supino, desenvolvimento);
 * - row: puxar sentado com a pegada num caminho até a roldana (remada, puxada);
 * - squat: o agachamento resolvido pelo solver estático do Lab (tronco pelo equilíbrio), com a barra nas costas.
 *
 * Puro. Os parâmetros chegam do JSON (validados no teste pelo clipe gerado, que passa no schema `MotionClip`).
 */
import type { Angle, Equipment, Load, MotionClip, Reach, Tempo } from '@/data/schema/motion';
import { createSquatSolver } from '../exercises/squat';
import type { EngineSkeleton } from '../kinematics/types';
import type { Vec3 } from '../math/vec';
import type { PointMass } from '../statics/mass';

type View = MotionClip['view'];
type Base = Omit<MotionClip, 'id' | 'evidence'>;

/** Assento: ponto sob a pelve (tuberosidades, pose neutra) que encosta no assento. */
export const SEAT_POINT: Vec3 = [0, 0.775, -0.035];
/** Dorso (pose neutra, à altura das escápulas) que encosta no banco. */
export const BACK_POINT: Vec3 = [0, 1.3, -0.118];

/** Pés no chão à frente do assento. */
const feetOnFloor = (z: number, x = -0.13, pitch: Angle = 0): Reach => ({
  limb: 'leg',
  side: 'both',
  target: { kind: 'ball', point: [x, 0.012, z], pitch },
  pole: [0, 0.4, 1],
});

// ---- rosca / tríceps ----

export interface CurlParams {
  readonly support: 'standing' | 'incline';
  /** Graus que o tronco deita para trás (banco inclinado). */
  readonly recline?: number;
  /** Graus que o tronco inclina à frente (em pé, pelo quadril). */
  readonly lean?: number;
  /** Cotovelo de u = 0 a u = 1. */
  readonly elbow: readonly [number, number];
  /** Braço em relação à vertical do mundo (flexão, abdução, rotação). */
  readonly arm: {
    readonly flex: number;
    readonly abd: number;
    readonly rot?: number;
  };
  readonly pronation: number;
  readonly girdle?: number;
  readonly implement:
    | { readonly kind: 'dumbbell' }
    | {
        readonly kind: 'cable';
        readonly pulley: Vec3;
        readonly handle: 'bar' | 'rope' | 'v';
      };
  readonly tempo: Tempo;
  readonly view: View;
}

export function curlClip(p: CurlParams): Base {
  const pitch = p.support === 'incline' ? -(p.recline ?? 45) : (p.lean ?? 0);
  const equipment: Equipment[] =
    p.implement.kind === 'dumbbell'
      ? [{ kind: 'dumbbell' }]
      : [
          {
            kind: 'cable',
            pulley: p.implement.pulley,
            handle: p.implement.handle,
          },
        ];
  const hold: Record<string, number> = {
    // Braço na vertical com o tronco inclinado: inclinar à frente leva a mão para trás, então soma a inclinação.
    shoulder_flex: p.arm.flex + pitch,
    shoulder_abd: p.arm.abd,
    shoulder_rot: p.arm.rot ?? 0,
    forearm_pro: p.pronation,
    clav_elev: p.girdle ?? 0,
    scap_uprot: p.girdle ?? 0,
  };
  const load: Load = p.implement.kind === 'dumbbell' ? { kind: 'gravity' } : { kind: 'cable' };
  const tracks = [
    {
      dof: 'elbow_flex',
      keys: [
        { u: 0, deg: p.elbow[0] },
        { u: 1, deg: p.elbow[1] },
      ],
    },
  ];
  if (p.support === 'standing') {
    return {
      support: 'standing',
      root: { mode: 'plant' },
      hold: { ...hold, hip_flex: p.lean ?? 0, hip_abd: 3 },
      tracks,
      reach: [],
      equipment,
      load,
      tempo: p.tempo,
      view: p.view,
    };
  }
  // Banco inclinado: assento a 0,5 m, encosto pela inclinação, pés no chão.
  const r = ((p.recline ?? 45) * Math.PI) / 180;
  const seatY = 0.5;
  const back: Vec3 = [0, seatY + 0.06 + 0.36 * Math.cos(r), -0.17 - 0.36 * Math.sin(r) - 0.02];
  return {
    support: 'incline',
    root: {
      mode: 'pin',
      segment: 'pelvis',
      point: SEAT_POINT,
      at: [0, seatY, 0],
      pitch,
    },
    hold: { ...hold, hip_abd: 6, lumbar_flex: 0, neck_flex: 15 },
    tracks,
    reach: [feetOnFloor(0.62, -0.16)],
    equipment: [
      ...equipment,
      {
        kind: 'block',
        role: 'seat',
        center: [0, seatY - 0.04, 0.04],
        size: [0.34, 0.08, 0.36],
      },
      {
        kind: 'block',
        role: 'back',
        center: back,
        size: [0.32, 0.8, 0.07],
        pitch,
      },
      {
        kind: 'block',
        role: 'frame',
        center: [0, (seatY - 0.08) / 2, 0.02],
        size: [0.06, seatY - 0.08, 0.3],
      },
    ],
    load,
    tempo: p.tempo,
    view: p.view,
  };
}

// ---- empurrar ----

export interface PressParams {
  readonly support: 'standing' | 'supine';
  /** Meia largura da pegada (m, do meio da barra à mão). */
  readonly halfWidth: number;
  /** Pegada direita: altura e profundidade por u. */
  readonly path: readonly {
    readonly u: number;
    readonly y: number;
    readonly z: number;
  }[];
  readonly pole: Vec3;
  readonly plates: number;
  /** Carga para o equilíbrio (em pé). */
  readonly loadKg?: number;
  readonly benchTop?: number;
  readonly hold?: Readonly<Record<string, number>>;
  readonly tempo: Tempo;
  readonly view: View;
}

export function pressClip(p: PressParams): Base {
  const arms: Reach = {
    limb: 'arm',
    side: 'both',
    target: {
      kind: 'path',
      keys: p.path.map((k) => ({ u: k.u, p: [-p.halfWidth, k.y, k.z] })),
    },
    pole: p.pole,
  };
  const bar: Equipment = { kind: 'barbell', plates: p.plates };
  if (p.support === 'standing') {
    return {
      support: 'standing',
      root: { mode: 'plant' },
      hold: { hip_abd: 3, forearm_pro: 85, wrist_flex: -15, ...p.hold },
      tracks: [],
      reach: [arms],
      balance: { massKg: p.loadKg ?? 40, rangeDeg: [-12, 12] },
      equipment: [bar],
      load: { kind: 'gravity' },
      tempo: p.tempo,
      view: p.view,
    };
  }
  const top = p.benchTop ?? 0.44;
  return {
    support: 'supine',
    root: {
      mode: 'pin',
      segment: 'trunk',
      point: BACK_POINT,
      at: [0, top, 0],
      pitch: -90,
    },
    hold: { forearm_pro: 85, wrist_flex: -10, neck_flex: 0, ...p.hold },
    tracks: [],
    reach: [
      {
        limb: 'leg',
        side: 'both',
        target: { kind: 'ball', point: [-0.24, 0.012, 0.98] },
        pole: [-0.3, 1, 0.4],
      },
      arms,
    ],
    equipment: [
      bar,
      {
        kind: 'block',
        role: 'bench',
        center: [0, top - 0.04, 0.22],
        size: [0.29, 0.08, 1.22],
      },
      {
        kind: 'block',
        role: 'frame',
        center: [0, (top - 0.08) / 2, 0.22],
        size: [0.07, top - 0.08, 1.0],
      },
    ],
    load: { kind: 'gravity' },
    tempo: p.tempo,
    view: p.view,
  };
}

// ---- puxar sentado ----

export interface RowParams {
  readonly seatY: number;
  /** Inclinação do tronco (graus; + à frente) por u. */
  readonly pitch: Angle;
  readonly hipFlex: number;
  readonly halfWidth: number;
  readonly path: readonly {
    readonly u: number;
    readonly y: number;
    readonly z: number;
  }[];
  readonly pole: Vec3;
  readonly pulley: Vec3;
  readonly handle: 'bar' | 'rope' | 'v';
  readonly feet: { readonly point: Vec3; readonly pitch?: Angle };
  readonly hold?: Readonly<Record<string, number>>;
  readonly blocks?: readonly Equipment[];
  readonly tempo: Tempo;
  readonly view: View;
}

export function rowClip(p: RowParams): Base {
  return {
    support: 'seated',
    root: {
      mode: 'pin',
      segment: 'pelvis',
      point: SEAT_POINT,
      at: [0, p.seatY, 0],
      pitch: p.pitch,
    },
    hold: { hip_flex: p.hipFlex, ...p.hold },
    tracks: [],
    reach: [
      {
        limb: 'leg',
        side: 'both',
        target: {
          kind: 'ball',
          point: p.feet.point,
          ...(p.feet.pitch !== undefined && { pitch: p.feet.pitch }),
        },
        pole: [0, 0.6, 1],
      },
      {
        limb: 'arm',
        side: 'both',
        target: {
          kind: 'path',
          keys: p.path.map((k) => ({ u: k.u, p: [-p.halfWidth, k.y, k.z] })),
        },
        pole: p.pole,
      },
    ],
    equipment: [
      { kind: 'cable', pulley: p.pulley, handle: p.handle },
      {
        kind: 'block',
        role: 'seat',
        center: [0, p.seatY - 0.04, 0.02],
        size: [0.36, 0.08, 0.4],
      },
      ...(p.blocks ?? []),
    ],
    load: { kind: 'cable' },
    tempo: p.tempo,
    view: p.view,
  };
}

// ---- agachamento ----

export interface SquatParams {
  readonly depthDeg: number;
  readonly ankleMaxDeg: number;
  /** Barra (centro, pose neutra, no tronco). */
  readonly bar: Vec3;
  readonly halfWidth: number;
  readonly pole: Vec3;
  readonly plates: number;
  readonly loadKg: number;
  readonly hold?: Readonly<Record<string, number>>;
  readonly tempo: Tempo;
  readonly view: View;
}

export interface MoldContext {
  readonly sk: EngineSkeleton;
  readonly masses: readonly PointMass[];
}

/** O tronco sai do equilíbrio estático (o mesmo solver do Lab), amostrado em 9 pontos. */
export function squatClip(p: SquatParams, ctx: MoldContext): Base {
  const solve = createSquatSolver(
    { sk: ctx.sk, body: ctx.masses, hipLimitDeg: 125, lumbarLimitDeg: 30 },
    {
      depthDeg: p.depthDeg,
      ankleMaxDeg: p.ankleMaxDeg,
      heelWedgeDeg: 0,
      load: {
        segment: 'trunk',
        local: [p.bar[0], p.bar[1] - 1.1593, p.bar[2] + 0.011],
        mass: p.loadKg,
      },
      hold: {},
    },
  );
  const us = Array.from({ length: 9 }, (_, i) => i / 8);
  // u é a profundidade (0 em pé, 1 no fundo); o solver usa u como fração da profundidade.
  const frames = us.map((u) => ({ u, f: solve(u) }));
  const track = (dof: string, key: string) => ({
    dof,
    keys: frames.map(({ u, f }) => ({
      u,
      deg: Math.round((f.dofDeg[key] ?? 0) * 100) / 100,
    })),
  });
  return {
    support: 'standing',
    root: { mode: 'plant' },
    hold: { hip_abd: 6, hip_rot: -6, forearm_pro: 80, ...p.hold },
    tracks: [track('hip_flex', 'hip_flex_r'), track('knee_flex', 'knee_flex_r'), track('ankle_dorsi', 'ankle_dorsi_r'), track('lumbar_flex', 'lumbar_flex')],
    reach: [
      {
        limb: 'arm',
        side: 'both',
        target: {
          kind: 'attach',
          segment: 'trunk',
          point: [-p.halfWidth, p.bar[1], p.bar[2]],
        },
        pole: p.pole,
      },
    ],
    equipment: [{ kind: 'barbell', plates: p.plates }],
    load: { kind: 'gravity' },
    tempo: p.tempo,
    view: p.view,
  };
}

export type MoldId = 'curl' | 'press' | 'row' | 'squat';

/** Expande um molde. Os parâmetros vêm do JSON; o clipe gerado passa pelo schema no teste. */
export function expandMold(mold: MoldId, params: Readonly<Record<string, unknown>>, ctx: MoldContext): Base {
  switch (mold) {
    case 'curl':
      return curlClip(params as unknown as CurlParams);
    case 'press':
      return pressClip(params as unknown as PressParams);
    case 'row':
      return rowClip(params as unknown as RowParams);
    case 'squat':
      return squatClip(params as unknown as SquatParams, ctx);
  }
}
