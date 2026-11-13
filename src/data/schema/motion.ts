/**
 * Clipe de movimento: uma repetição de um exercício como dado. O motor (`engine/motion/`) avalia o clipe em u ∈ [0, 1]
 * (0 = posição inicial, 1 = a outra ponta) e o tempo da repetição vai e volta: início → fim → início.
 *
 * Convenções (iguais às do esqueleto): graus; DOF sem sufixo de lado vale para os dois lados; pontos do corpo são dados na
 * pose neutra (mundo, 1,75 m) do lado direito, e o esquerdo sai por espelhamento em X.
 */
import { z } from 'zod';
import { Evidence } from './evidence';

const Vec3 = z.tuple([z.number(), z.number(), z.number()]).readonly();
const Dof = z.string().regex(/^[a-z_]+$/);

/** Valores por quadro-chave em u (graus). Interpolação monótona: não passa dos valores dados. */
export const DegKeys = z.array(z.object({ u: z.number().min(0).max(1), deg: z.number() })).min(2);
export type DegKeys = z.infer<typeof DegKeys>;

/** Trilha de um DOF. Mesmo formato de `KeyTrajectory` (exercise.ts), com u no lugar de t. */
export const MotionTrack = z.object({ dof: Dof, keys: DegKeys });

/** Ponto fixo (mundo) ou caminho por quadros-chave em u. */
const Place = z.union([Vec3, z.array(z.object({ u: z.number().min(0).max(1), p: Vec3 })).min(1)]);
export type Place = z.infer<typeof Place>;

/** Graus fixos ou por quadro-chave. */
const Angle = z.union([z.number(), DegKeys]);
export type Angle = z.infer<typeof Angle>;

export const Support = z.enum(['standing', 'seated', 'supine', 'prone', 'incline', 'hanging', 'kneeling']);
export type Support = z.infer<typeof Support>;

/**
 * Onde o corpo se apoia.
 * - plant: pés no chão (o pé direito fica na transformação neutra; a pose é simétrica, então o esquerdo também).
 * - pin: um ponto do corpo fica preso a um ponto do mundo (assento, banco, degrau) ou segue um caminho em u (barra fixa,
 *   trenó do hack); a raiz gira por `pitch` (graus em X: + = inclina para a frente, −90 = deitado de costas, +90 = de bruços).
 */
export const RootSpec = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('plant') }),
  z.object({
    mode: z.literal('pin'),
    segment: z.string(),
    point: Vec3,
    at: Place,
    pitch: Angle.optional(),
  }),
]);
export type RootSpec = z.infer<typeof RootSpec>;

/**
 * Alvo de uma cadeia de dois ossos (braço: ombro + cotovelo, ponta = pegada na mão; perna: quadril + joelho, ponta =
 * tornozelo).
 * - path: caminho no mundo por quadros-chave (lado direito).
 * - attach: ponto de outro segmento (barra nas costas, barra no quadril).
 * - hang: braço solto na vertical, abaixo do ombro.
 * - ball: perna com a cabeça dos metatarsos presa num ponto (ou num caminho: plataforma do leg press) e o pé com inclinação
 *   dada (0 = apoiado, + = calcanhar sobe).
 */
export const ReachTarget = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('path'),
    keys: z.array(z.object({ u: z.number().min(0).max(1), p: Vec3 })).min(1),
  }),
  z.object({ kind: z.literal('attach'), segment: z.string(), point: Vec3 }),
  z.object({ kind: z.literal('hang') }),
  z.object({ kind: z.literal('ball'), point: Place, pitch: Angle.optional() }),
]);
export type ReachTarget = z.infer<typeof ReachTarget>;

/**
 * `side: 'l'` = só o membro esquerdo, com o alvo dado no lado direito (espelhado em X), como todo ponto do clipe: avanço
 * (perna de trás), apoio da mão no banco.
 */
export const Reach = z.object({
  limb: z.enum(['arm', 'leg']),
  side: z.enum(['both', 'r', 'l']),
  target: ReachTarget,
  /** Para onde aponta o cotovelo/joelho (mundo, lado direito). */
  pole: Vec3,
});
export type Reach = z.infer<typeof Reach>;

/** Equilíbrio: o tornozelo ajusta para o centro de massa (corpo + carga) ficar sobre o meio do pé. Só com `plant`. */
export const Balance = z.object({
  massKg: z.number().min(0),
  rangeDeg: z.tuple([z.number(), z.number()]),
});

export const Equipment = z.discriminatedUnion('kind', [
  /** Barra entre as duas pegadas. */
  z.object({
    kind: z.literal('barbell'),
    plates: z.number().int().min(0).max(4),
  }),
  /** Halter em cada mão, ou só na direita (`hands: 'r'`). */
  z.object({ kind: z.literal('dumbbell'), hands: z.enum(['both', 'r']).optional() }),
  /**
   * Cabo da pegada (média das mãos) até a roldana. `single` = pegador de uma mão (só a direita). `mirror` = um cabo por
   * mão, cada um na sua roldana (a esquerda espelhada): crucifixo, cross-over.
   */
  z.object({
    kind: z.literal('cable'),
    pulley: Vec3,
    handle: z.enum(['bar', 'rope', 'v', 'single']),
    mirror: z.boolean().optional(),
  }),
  /**
   * Peça: banco, assento, encosto, degrau, plataforma. Caixa com inclinação em X (graus). Com `segment`, a peça anda com o
   * segmento (centro dado na pose neutra; inclinação somada à do segmento): plataforma do leg press, trenó do hack.
   */
  z.object({
    kind: z.literal('block'),
    role: z.enum(['bench', 'seat', 'back', 'step', 'platform', 'frame']),
    center: Vec3,
    size: Vec3,
    pitch: z.number().optional(),
    segment: z.string().optional(),
  }),
  /**
   * Rolo preso a um segmento (ponto na pose neutra). `lever`: o braço da máquina gira na articulação proximal do
   * segmento (joelho, no rolo da perna). `both`: um rolo de cada lado (ombreiras).
   */
  z.object({
    kind: z.literal('pad'),
    segment: z.string(),
    point: Vec3,
    lever: z.boolean(),
    both: z.boolean(),
  }),
]);
export type Equipment = z.infer<typeof Equipment>;

/**
 * Vetor da carga (o que o músculo-alvo enfrenta).
 * - gravity: peso na pegada (ou num ponto de segmento).
 * - cable: da pegada para a roldana.
 * - lever: no rolo com alavanca, perpendicular ao braço da máquina, contra a fase concêntrica.
 * - guided: máquina de trilho ou de braço (hack, leg press, supino máquina, abdutora): contra o caminho do ponto (pegada ou
 *   ponto de segmento) na fase concêntrica.
 */
export const Load = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('gravity'),
    segment: z.string().optional(),
    point: Vec3.optional(),
  }),
  z.object({ kind: z.literal('cable') }),
  z.object({ kind: z.literal('lever') }),
  z.object({
    kind: z.literal('guided'),
    segment: z.string().optional(),
    point: Vec3.optional(),
  }),
]);
export type Load = z.infer<typeof Load>;

/** Segundos: ir até u = 1, pausa, voltar, pausa. `concentric` diz qual perna é a concêntrica. */
export const Tempo = z.object({
  out: z.number().positive(),
  hold: z.number().min(0),
  back: z.number().positive(),
  rest: z.number().min(0),
  concentric: z.enum(['out', 'back']),
});
export type Tempo = z.infer<typeof Tempo>;

export const MotionClip = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  support: Support,
  root: RootSpec,
  /** Pose fixa (graus). */
  hold: z.record(Dof, z.number()),
  tracks: z.array(MotionTrack),
  reach: z.array(Reach),
  balance: Balance.optional(),
  /** Ponto de pegada na mão (pose neutra, lado direito). Padrão: centro da palma (`engine/motion/evaluate.ts`). */
  grip: Vec3.optional(),
  equipment: z.array(Equipment),
  load: Load,
  tempo: Tempo,
  /** Câmera inicial do player. */
  view: z.enum(['front', 'side', 'back', 'diagonal']),
  evidence: Evidence,
});
export type MotionClip = z.infer<typeof MotionClip>;

/** Arquivo: clipe completo ou molde parametrizado (expandido pelo motor, `engine/motion/molds.ts`). */
export const ClipEntry = z.union([
  MotionClip,
  z.object({
    id: z.string().regex(/^[a-z_]+$/),
    mold: z.enum(['curl', 'press', 'row', 'squat']),
    params: z.record(z.string(), z.unknown()),
    evidence: Evidence,
  }),
]);
export type ClipEntry = z.infer<typeof ClipEntry>;
export const ClipFile = z.array(ClipEntry);
