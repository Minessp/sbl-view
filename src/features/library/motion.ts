/**
 * Clipes de movimento da biblioteca: expande os moldes e compila para o motor. Sem three.js (player, rota de
 * desenvolvimento e testes usam o mesmo).
 */
import anthropometry from '@/data/anthropometry.json';
import clipsJson from '@/data/exercises/clips.json';
import { skeletonDef } from '@/data';
import type { ClipEntry, MotionClip } from '@/data/schema/motion';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import { compileClip, type CompiledClip } from '@/engine/motion/evaluate';
import { expandMold } from '@/engine/motion/molds';
import { segmentMasses, type AnthropometryInput } from '@/engine/statics/mass';

export const motionSkeleton = buildSkeleton(skeletonDef);
/** Corpo de referência para o equilíbrio: 80 kg (o mesmo padrão do Lab). */
export const motionMasses = segmentMasses(motionSkeleton, anthropometry as unknown as AnthropometryInput, 80);

export const clipEntries = clipsJson as unknown as ClipEntry[];

export function expandEntry(e: ClipEntry): MotionClip {
  if ('mold' in e)
    return {
      id: e.id,
      ...expandMold(e.mold, e.params, {
        sk: motionSkeleton,
        masses: motionMasses,
      }),
      evidence: e.evidence,
    };
  return e;
}

const cache = new Map<string, CompiledClip>();

export function compiledClip(id: string): CompiledClip | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const e = clipEntries.find((c) => c.id === id);
  if (!e) return null;
  const c = compileClip(expandEntry(e), motionSkeleton, motionMasses);
  cache.set(id, c);
  return c;
}

/** Compila um clipe avulso (rota de desenvolvimento: o clipe em edição). */
export const compileLoose = (clip: MotionClip): CompiledClip => compileClip(clip, motionSkeleton, motionMasses);
