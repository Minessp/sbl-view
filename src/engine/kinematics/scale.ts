import type { Vec3 } from '../math/vec';
import type { EngineSegment, EngineSkeleton } from './types';

/**
 * Muda o comprimento de um segmento ao longo do seu eixo longo (−Y local), mantendo os filhos
 * presos à extremidade. Usado para explorar proporções (ex.: fêmur longo).
 * Retorna um esqueleto novo; o original não muda.
 */
export function scaleSegmentLength(sk: EngineSkeleton, segmentIds: readonly string[], k: number): EngineSkeleton {
  if (k === 1) return sk;
  const target = new Set(segmentIds);
  const stretch = (v: Vec3): Vec3 => [v[0], v[1] * k, v[2]];
  const segments: EngineSegment[] = sk.segments.map((s) => {
    const parentScaled = s.parent !== null && target.has(s.parent);
    return {
      ...s,
      tip: target.has(s.id) ? stretch(s.tip) : s.tip,
      jointOffset: parentScaled ? stretch(s.jointOffset) : s.jointOffset,
    };
  });
  const byId = new Map(segments.map((s) => [s.id, s]));
  const neutralOrigin = new Map<string, Vec3>();
  for (const s of segments) {
    const o: Vec3 =
      s.parent === null
        ? (sk.neutralOrigin.get(s.id) ?? [0, 0, 0])
        : (() => {
            const p = neutralOrigin.get(s.parent) ?? [0, 0, 0];
            return [p[0] + s.jointOffset[0], p[1] + s.jointOffset[1], p[2] + s.jointOffset[2]] as Vec3;
          })();
    neutralOrigin.set(s.id, o);
  }
  return { stature: sk.stature, segments, byId, neutralOrigin };
}

/** Estica, no mesmo fator, pontos locais presos ao segmento escalado. */
export const stretchLocal = (v: Vec3, k: number): Vec3 => [v[0], v[1] * k, v[2]];
