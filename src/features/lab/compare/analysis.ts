/**
 * Lab de comparação: exercícios do mesmo alvo e suas variações, medidos no mesmo corpo. Sem three.js (página, cena e
 * testes usam o mesmo).
 *
 * Por exercício, ao longo da repetição (u = 0 alongado → u = 1 encurtado):
 * - comprimento do alvo (% em relação a em pé, média das partes do lado direito, caminho do Atlas);
 * - a articulação que mais muda o comprimento do alvo no clipe (entre as ações modeladas do músculo) e o ângulo dela;
 * - braço de momento do músculo nessa articulação (−dL/dθ; + = ajuda a concêntrica);
 * - braço da carga na mesma articulação (trabalho virtual, `engine/motion/resistance.ts`; + = resiste à concêntrica),
 *   em cm por unidade de força, e o perfil normalizado pelo pico.
 */
import variationsJson from '@/data/exercises/variations.json';
import { musclePathDefs } from '@/data/paths';
import type { LibraryExercise } from '@/data/schema/exercise';
import type { LabVariation } from '@/data/schema/lab';
import type { MotionClip } from '@/data/schema/motion';
import { sidedDof } from '@/data/movement';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { at } from '@/engine/math/arr';
import { DEG } from '@/engine/math/vec';
import { compileClip, evaluateClip, type CompiledClip, type MotionFrame } from '@/engine/motion/evaluate';
import { applyPatches } from '@/engine/motion/patch';
import { loadAttachment, loadMoment } from '@/engine/motion/resistance';
import { momentArm } from '@/engine/muscle/momentArm';
import { buildMusclePaths, mtuLength, type MusclePath } from '@/engine/muscle/paths';
import { STANDING } from '@/scene/body/poses';
import { clipEntries, expandEntry, motionMasses, motionSkeleton } from '@/features/library/motion';
import { exerciseById, library, movementById, movements, muscleById } from '@/features/library/catalog';

export const variations = variationsJson as unknown as LabVariation[];

/** Escolha de um exercício na comparação: id e a opção de cada variação dele (ausente = a do clipe da biblioteca). */
export interface CompareSpec {
  readonly exercise: string;
  readonly options: Readonly<Record<string, string>>;
}

export const variationsFor = (exercise: string): LabVariation[] => variations.filter((v) => v.exercise === exercise);

const baseOption = (v: LabVariation) => v.options.find((o) => o.base) ?? v.options[0];

/** Opção escolhida de cada variação do exercício (padrão = a base). */
export function chosenOptions(spec: CompareSpec): { variation: LabVariation; option: LabVariation['options'][number] }[] {
  return variationsFor(spec.exercise).flatMap((v) => {
    const o = v.options.find((x) => x.id === spec.options[v.id]) ?? baseOption(v);
    return o ? [{ variation: v, option: o }] : [];
  });
}

export const specKey = (s: CompareSpec): string =>
  [s.exercise, ...chosenOptions(s).filter((c) => !c.option.base).map((c) => `${c.variation.id}=${c.option.id}`)].join('|');

/** Clipe do exercício com as opções aplicadas (remendo antes de expandir o molde). */
export function clipOf(spec: CompareSpec): MotionClip {
  const entry = clipEntries.find((e) => e.id === spec.exercise);
  if (!entry) throw new Error(`Exercício sem clipe: ${spec.exercise}`);
  const patches = chosenOptions(spec).flatMap((c) => c.option.patches);
  return expandEntry(patches.length ? applyPatches(entry, patches) : entry);
}

const clipCache = new Map<string, CompiledClip>();
export function compiledFor(spec: CompareSpec): CompiledClip {
  const k = specKey(spec);
  let c = clipCache.get(k);
  if (!c) {
    c = compileClip(clipOf(spec), motionSkeleton, motionMasses);
    if (clipCache.size > 40) clipCache.clear();
    clipCache.set(k, c);
  }
  return c;
}

/** Vista sugerida pelo clipe do exercício (a mesma do player). */
export function clipView(exercise: string): 'side' | 'front' | 'back' | 'diagonal' {
  const e = clipEntries.find((c) => c.id === exercise);
  const v = !e ? 'side' : 'mold' in e ? (e.params.view as string | undefined) : e.view;
  return v === 'front' || v === 'back' || v === 'diagonal' ? v : 'side';
}

// ---- Alvos ----

let pathsCache: MusclePath[] | null = null;
const rightPaths = (): MusclePath[] => (pathsCache ??= buildMusclePaths(motionSkeleton, musclePathDefs).filter((p) => p.side === 'r'));
const pathsOf = (muscle: string) => rightPaths().filter((p) => p.muscleId === muscle);

/** Exercícios que têm o músculo como alvo. */
export const exercisesTargeting = (muscle: string): LibraryExercise[] =>
  library.filter((e) => e.targets.some((t) => t.muscle === muscle && t.role === 'alvo'));

/** Músculos com caminho no modelo que são alvo de pelo menos dois exercícios (dá para comparar), na ordem da biblioteca. */
export function comparableTargets(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of library)
    for (const t of e.targets) {
      if (t.role !== 'alvo' || seen.has(t.muscle)) continue;
      seen.add(t.muscle);
      if (exercisesTargeting(t.muscle).length >= 2 && pathsOf(t.muscle).length) out.push(t.muscle);
    }
  return out;
}

// ---- Análise ----

export interface Analysis {
  readonly key: string;
  readonly spec: CompareSpec;
  readonly muscle: string;
  /** DOF (com lado) da articulação analisada; null = nenhuma ação modelada do alvo muda no clipe. */
  readonly dof: string | null;
  /** Movimento da concêntrica nessa articulação ("Flexão do cotovelo"). */
  readonly motion: string | null;
  readonly u: readonly number[];
  /** Ângulo do DOF (graus). */
  readonly angle: readonly number[];
  /** Comprimento do alvo, % em relação a em pé. */
  readonly length: readonly number[];
  /** Braço de momento do alvo (cm; + = encurtar ajuda a concêntrica). */
  readonly arm: readonly number[];
  /** Braço da carga (cm por unidade de força; + = resiste à concêntrica). */
  readonly load: readonly number[];
  /** Carga em relação ao pico da repetição (1 = pico). */
  readonly profile: readonly number[];
  /** Carga no ponto mais alongado do alvo, em relação ao pico. */
  readonly loadAtLongest: number;
  /** Comprimento do alvo onde a carga é máxima (%). */
  readonly lengthAtPeak: number;
}

const N = 41;

const radOf = (f: MotionFrame): Record<string, number> => Object.fromEntries(Object.entries(f.deg).map(([k, v]) => [k, v * DEG]));

function lengthPct(f: MotionFrame, parts: readonly MusclePath[], rest: ReadonlyMap<string, number>): number {
  let s = 0;
  for (const p of parts) s += mtuLength(f.pose, p) / (rest.get(p.key) ?? 1) - 1;
  return (s / parts.length) * 100;
}

function armOf(sk: CompiledClip['sk'], f: MotionFrame, parts: readonly MusclePath[], dof: string): number {
  const base = radOf(f);
  let s = 0;
  for (const p of parts) s += momentArm(sk, p, base, dof, f.deg[dof] ?? 0);
  return s / parts.length;
}

/** DOFs das ações modeladas do músculo (lado direito). */
function actionDofs(muscle: string): string[] {
  const m = muscleById(muscle);
  if (!m) return [];
  const ids = new Set(motionSkeleton.segments.flatMap((s) => s.dofs.map((d) => d.id)));
  const out = new Set<string>();
  for (const a of m.actions) {
    if (a.unmodeled) continue;
    const mv = movementById(a.movement);
    if (mv?.dof) out.add(sidedDof(mv.dof, ids));
  }
  return [...out].filter((d) => ids.has(d));
}

/** A articulação que mais explica a mudança de comprimento do alvo no clipe: maior |Σ r·Δθ|. */
function mainDof(c: CompiledClip, parts: readonly MusclePath[], muscle: string, frames: readonly MotionFrame[]): string | null {
  let best: string | null = null;
  let score = 0.002; // 2 mm de excursão: abaixo disso a articulação não conta
  const step = Math.max(1, Math.floor((frames.length - 1) / 10));
  for (const dof of actionDofs(muscle)) {
    let s = 0;
    for (let i = step; i < frames.length; i += step) {
      const a = at(frames, i - step), b = at(frames, i);
      const d = ((b.deg[dof] ?? 0) - (a.deg[dof] ?? 0)) * DEG;
      if (Math.abs(d) < 1e-6) continue;
      s += armOf(c.sk, a, parts, dof) * d;
    }
    if (Math.abs(s) > score) {
      score = Math.abs(s);
      best = dof;
    }
  }
  return best;
}

function motionLabel(dof: string, sign: number): string | null {
  const base = dof.replace(/_[rl]$/, '');
  return movements.find((m) => m.dof === base && m.sign === sign && !m.base)?.label ?? movements.find((m) => m.dof === base && m.sign === sign)?.label ?? null;
}

const analysisCache = new Map<string, Analysis | null>();

/** Análise de um exercício (com as variações) para um músculo-alvo. null = músculo sem caminho no modelo. */
export function analyze(spec: CompareSpec, muscle: string): Analysis | null {
  const key = `${specKey(spec)}#${muscle}`;
  if (analysisCache.has(key)) return analysisCache.get(key) ?? null;
  const parts = pathsOf(muscle);
  let out: Analysis | null = null;
  if (parts.length) {
    const c = compiledFor(spec);
    const u = Array.from({ length: N }, (_, i) => i / (N - 1));
    const frames = u.map((x) => evaluateClip(c, x));
    const stand = forwardKinematics(c.sk, STANDING);
    const rest = new Map(parts.map((p) => [p.key, mtuLength(stand, p)]));
    const length = frames.map((f) => lengthPct(f, parts, rest));
    const dof = mainDof(c, parts, muscle, frames);
    let angle: number[] = [], arm: number[] = [], load: number[] = [], motion: string | null = null;
    if (dof) {
      angle = frames.map((f) => f.deg[dof] ?? 0);
      const s = Math.sign(at(angle, N - 1) - at(angle, 0)) || 1;
      motion = motionLabel(dof, s);
      arm = frames.map((f) => s * armOf(c.sk, f, parts, dof) * 100);
      const attach = loadAttachment(c);
      load = frames.map((f) => -s * loadMoment(c, f, dof, attach) * 100);
    }
    const peak = Math.max(1e-9, ...load.map(Math.abs));
    const profile = load.map((v) => v / peak);
    const iLong = length.indexOf(Math.max(...length));
    const iPeak = load.length ? load.indexOf(Math.max(...load)) : -1;
    out = {
      key,
      spec,
      muscle,
      dof,
      motion,
      u,
      angle,
      length,
      arm,
      load,
      profile,
      loadAtLongest: profile[iLong] ?? 0,
      lengthAtPeak: iPeak >= 0 ? at(length, iPeak) : 0,
    };
  }
  if (analysisCache.size > 60) analysisCache.clear();
  analysisCache.set(key, out);
  return out;
}

/** Nome do exercício + opções fora da base ("Rosca inclinada · encosto a 65°"). */
export function specLabel(spec: CompareSpec): string {
  const name = exerciseById(spec.exercise)?.name ?? spec.exercise;
  const extra = chosenOptions(spec)
    .filter((c) => !c.option.base)
    .map((c) => `${c.variation.label.toLowerCase()} ${c.option.label}`);
  return [name, ...extra].join(' · ');
}

