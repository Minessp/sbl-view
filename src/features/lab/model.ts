/**
 * Liga os dados ao motor para o Lab. Sem three.js: usado pelos gráficos, pela cena e pelos testes.
 */
import anthropometry from '@/data/anthropometry.json';
import capacityJson from '@/data/capacity.json';
import squatJson from '@/data/exercises/squat.json';
import { skeletonDef } from '@/data';
import { musclePathDefs } from '@/data/paths';
import type { CapacityCurve, Exercise, ExerciseVariant } from '@/data/schema/exercise';
import { createSquatSolver, sampleSquat, type SquatFrame } from '@/engine/exercises/squat';
import { scaleSegmentLength, stretchLocal } from '@/engine/kinematics/scale';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { EngineSkeleton } from '@/engine/kinematics/types';
import { must } from '@/engine/math/arr';
import { sub, type Vec3 } from '@/engine/math/vec';
import { relativeCapacity } from '@/engine/muscle/capacity';
import { buildMusclePaths, mtuLength, type MusclePath } from '@/engine/muscle/paths';
import { segmentMasses, type AnthropometryInput, type PointMass } from '@/engine/statics/mass';

export const squat = squatJson as unknown as Exercise;
export const capacityCurves = capacityJson as unknown as CapacityCurve[];

export interface LabSettings {
  bodyMass: number;
  loadMass: number;
  stature: number;
  /** Fator de comprimento da coxa (1 = proporção de referência). */
  thighScale: number;
  /** Abertura dos joelhos (graus de abdução do quadril). Na análise sagital, encurta a projeção da coxa por cos(abertura). */
  stanceDeg: number;
  /** Flexão de joelho no fundo (graus); null = padrão de cada variação. */
  depthDeg: number | null;
  /** Ajuste somado à dorsiflexão máxima da variação (graus). */
  ankleDeltaDeg: number;
}

export const DEFAULT_SETTINGS: LabSettings = {
  bodyMass: 80,
  loadMass: 100,
  stature: 1.75,
  thighScale: 1,
  stanceDeg: 20,
  depthDeg: null,
  ankleDeltaDeg: 0,
};

/** Músculos acompanhados no gráfico de comprimento (lado direito). */
export const TRACKED_MUSCLES: { key: string; label: string; latin: string; biarticular: boolean }[] = [
  { key: 'vastus_lateralis_r', label: 'Vastos', latin: 'Vasti', biarticular: false },
  { key: 'rectus_femoris_r', label: 'Reto femoral', latin: 'Rectus femoris', biarticular: true },
  { key: 'gluteus_maximus_r', label: 'Glúteo máximo', latin: 'Gluteus maximus', biarticular: false },
  { key: 'adductor_magnus_r', label: 'Adutor magno', latin: 'Adductor magnus', biarticular: false },
  { key: 'semimembranosus_r', label: 'Isquiotibiais', latin: 'Hamstrings', biarticular: true },
  { key: 'soleus_r', label: 'Sóleo', latin: 'Soleus', biarticular: false },
];

export interface LabBody {
  sk: EngineSkeleton;
  /** Esqueleto antes de escalar a coxa (geometria autorada mapeia contra ele). */
  base: EngineSkeleton;
  paths: MusclePath[];
  masses: PointMass[];
}

/** Corpo para as configurações dadas (estatura, coxa, massa). Memoize por chave na UI. */
export function buildLabBody(settings: Pick<LabSettings, 'stature' | 'thighScale' | 'bodyMass' | 'stanceDeg'>): LabBody {
  const thighs = ['thigh_r', 'thigh_l'];
  // Projeção sagital da coxa: comprimento × cos(abertura dos joelhos).
  const s = { ...settings, thighScale: settings.thighScale * Math.cos((settings.stanceDeg * Math.PI) / 180) };
  const base = buildSkeleton(skeletonDef, s.stature);
  const sk = scaleSegmentLength(base, thighs, s.thighScale);
  const stretchOn = (seg: string, v: Vec3) => (thighs.includes(seg) ? stretchLocal(v, s.thighScale) : v);
  const paths = buildMusclePaths(base, musclePathDefs).map((p) => ({
    ...p,
    points: p.points.map((pt) => ({ segment: pt.segment, local: stretchOn(pt.segment, pt.local) })),
    wrap: p.wrap ? { ...p.wrap, center: stretchOn(p.wrap.segment, p.wrap.center) } : null,
  }));
  const masses = segmentMasses(base, anthropometry as unknown as AnthropometryInput, s.bodyMass).map((m) => ({ ...m, local: stretchOn(m.segment, m.local) }));
  return { sk, base, paths, masses };
}

export function variantById(id: string): ExerciseVariant {
  const v = squat.variants.find((x) => x.id === id);
  if (!v) throw new Error(`Variação desconhecida: ${id}`);
  return v;
}

function holdBilateral(hold: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(hold)) {
    out[`${k}_r`] = v;
    out[`${k}_l`] = v;
  }
  return out;
}

export function makeSolver(body: LabBody, variant: ExerciseVariant, s: LabSettings) {
  if (variant.trajectory.kind !== 'squat' || variant.resistance.kind !== 'gravity') throw new Error('Variação sem solver de agachamento');
  const k = s.stature / 1.75;
  const r = variant.resistance;
  const world: Vec3 = [r.point[0] * k, r.point[1] * k, r.point[2] * k];
  return createSquatSolver(
    { sk: body.sk, body: body.masses, hipLimitDeg: 125, lumbarLimitDeg: 30 },
    {
      depthDeg: s.depthDeg ?? variant.trajectory.depthDeg,
      ankleMaxDeg: Math.max(0, variant.trajectory.ankleMaxDeg + s.ankleDeltaDeg),
      heelWedgeDeg: variant.trajectory.heelWedgeDeg,
      load: { segment: r.segment, local: sub(world, must(body.sk.neutralOrigin, r.segment, 'segmento')), mass: s.loadMass },
      hold: holdBilateral(variant.holdDeg),
    },
  );
}

export interface VariantSeries {
  variant: ExerciseVariant;
  frames: SquatFrame[];
  /** Comprimento relativo ao início (0 = em pé), por músculo acompanhado. */
  lengths: Record<string, number[]>;
  capacity: { knee: number[]; hip: number[] };
}

export function seriesFor(body: LabBody, variant: ExerciseVariant, s: LabSettings, n = 49): VariantSeries {
  const frames = sampleSquat(makeSolver(body, variant, s), n);
  const lengths: Record<string, number[]> = {};
  for (const m of TRACKED_MUSCLES) {
    const path = body.paths.find((p) => p.key === m.key);
    if (!path) continue;
    const L = frames.map((f) => mtuLength(f.pose, path));
    const L0 = L[0] ?? 1;
    lengths[m.key] = L.map((l) => l / L0 - 1);
  }
  const knee = capacityCurves.find((c) => c.joint === 'knee');
  const hip = capacityCurves.find((c) => c.joint === 'hip');
  return {
    variant,
    frames,
    lengths,
    capacity: {
      knee: frames.map((f) => (knee ? relativeCapacity(knee, f.angles.knee) : 1)),
      hip: frames.map((f) => (hip ? relativeCapacity(hip, f.angles.hip) : 1)),
    },
  };
}

const bodyCache = new Map<string, LabBody>();
/** Corpo memoizado pelas configurações que mudam a geometria ou as massas. */
export function getLabBody(s: Pick<LabSettings, 'stature' | 'thighScale' | 'bodyMass' | 'stanceDeg'>): LabBody {
  const key = `${s.stature}|${s.thighScale}|${s.bodyMass}|${s.stanceDeg}`;
  let b = bodyCache.get(key);
  if (!b) {
    b = buildLabBody(s);
    if (bodyCache.size > 8) bodyCache.clear();
    bodyCache.set(key, b);
  }
  return b;
}
