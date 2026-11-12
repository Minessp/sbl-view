import { must } from '../math/arr';
import { DEG, mirrorX, sub, type Vec3 } from '../math/vec';
import type { EngineDof, EngineSegment, EngineSkeleton } from './types';

/** Formato mínimo que o motor aceita (o JSON validado satisfaz isto). */
export interface SkeletonInput {
  readonly stature: number;
  readonly segments: readonly {
    readonly id: string;
    readonly parent: string | null;
    readonly origin: readonly [number, number, number];
    readonly tip: readonly [number, number, number];
    readonly bilateral: boolean;
    readonly dofs: readonly {
      readonly id: string;
      readonly axis: 'x' | 'y' | 'z';
      readonly sign: 1 | -1;
      readonly romDeg: readonly [number, number];
    }[];
  }[];
}

const AXES: Record<'x' | 'y' | 'z', Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** Troca o sufixo de lado. Só mexe em `_r` no fim do id. */
export const mirrorId = (id: string): string => id.replace(/_r$/, '_l');

interface FlatSeg {
  id: string;
  parent: string | null;
  origin: Vec3;
  tip: Vec3;
  dofs: EngineDof[];
}

/**
 * Constrói o esqueleto do motor a partir do dado autorado.
 * - Segmentos bilaterais geram o lado esquerdo por espelhamento em X.
 * - Espelhar inverte o sentido das rotações em Y e Z; rotação em X se preserva.
 * - Graus → radianos acontece aqui, uma vez.
 */
export function buildSkeleton(input: SkeletonInput, stature = input.stature): EngineSkeleton {
  const k = stature / input.stature;
  const flat: FlatSeg[] = [];

  for (const s of input.segments) {
    const base: FlatSeg = {
      id: s.id,
      parent: s.parent,
      origin: [s.origin[0] * k, s.origin[1] * k, s.origin[2] * k],
      tip: [s.tip[0] * k, s.tip[1] * k, s.tip[2] * k],
      dofs: s.dofs.map((d) => ({
        id: d.id,
        axis: AXES[d.axis],
        sign: d.sign,
        min: d.romDeg[0] * DEG,
        max: d.romDeg[1] * DEG,
      })),
    };
    flat.push(base);
    if (s.bilateral) {
      flat.push({
        id: mirrorId(s.id),
        parent: s.parent === null ? null : mirrorId(s.parent),
        origin: mirrorX(base.origin),
        tip: mirrorX(base.tip),
        dofs: base.dofs.map((d) => ({
          ...d,
          id: mirrorId(d.id),
          // Eixo X: d.axis[0] === 1. Rotação em X se preserva no espelho; Y e Z invertem.
          sign: (d.axis[0] === 1 ? d.sign : -d.sign) as 1 | -1,
        })),
      });
    }
  }

  const neutralOrigin = new Map<string, Vec3>(flat.map((s) => [s.id, s.origin]));
  const segments: EngineSegment[] = [];
  const byId = new Map<string, EngineSegment>();

  for (const s of flat) {
    if (byId.has(s.id)) throw new Error(`Segmento duplicado: ${s.id}`);
    if (s.parent !== null && !byId.has(s.parent)) {
      throw new Error(`Pai ${s.parent} de ${s.id} não definido antes`);
    }
    const parentOrigin = s.parent === null ? s.origin : must(neutralOrigin, s.parent, 'segmento');
    const seg: EngineSegment = {
      id: s.id,
      parent: s.parent,
      // Na pose neutra todos os frames são paralelos ao mundo: offset = diferença de origens.
      jointOffset: s.parent === null ? [0, 0, 0] : sub(s.origin, parentOrigin),
      tip: sub(s.tip, s.origin),
      dofs: s.dofs,
    };
    segments.push(seg);
    byId.set(seg.id, seg);
  }

  return { stature, segments, byId, neutralOrigin };
}

/** Converte ângulos em graus (forma do JSON e da UI) para radianos. */
export function degToAngles(deg: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(deg)) out[id] = v * DEG;
  return out;
}

/** Aplica o mesmo valor aos dois lados: `{ knee_flex: 90 }` → `knee_flex_r`, `knee_flex_l`. */
export function bilateral(deg: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(deg)) {
    out[`${id}_r`] = v;
    out[`${id}_l`] = v;
  }
  return out;
}
