import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import anatomyJson from '@/data/anatomy.json';
import musclesJson from '@/data/muscles.json';
import musclePathsJson from '@/data/muscle-paths.json';
import { skeletonDef as skeletonJson } from '@/data';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { buildSkeleton, degToAngles } from '@/engine/kinematics/skeleton';
import { skinMatrices, skinPositions } from '@/engine/kinematics/skinning';
import { parseAnatomyPack, type AnatomyPack, type AnatomyPart } from './pack';
import { REFERENCE_POSES } from './poses';

const read = async (lod: 'hi' | 'lo') => {
  const url = new URL(`../../../public/models/anatomy-${lod}.bin`, import.meta.url);
  const file = readFileSync(url);
  return { pack: await parseAnatomyPack(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)), bytes: statSync(url).size };
};
const packs = { hi: await read('hi'), lo: await read('lo') };
const sk = buildSkeleton(skeletonJson);

/** Razão entre o comprimento de cada aresta posada e o de ligação (direito e cópia espelhada). */
function edgeStretch(pack: AnatomyPack, part: AnatomyPart, deg: Record<string, number>): Float64Array {
  const pose = forwardKinematics(sk, degToAngles(deg));
  const M = skinMatrices(sk, pose, pack.joints.map((j) => j.id));
  const copies = part.mirror ? [undefined, pack.jointMirror] : [undefined];
  const I = part.indices;
  const P = part.positions;
  const out = new Float64Array(I.length * copies.length);
  let o = 0;
  for (const mirror of copies) {
    const Q = skinPositions(part, M, mirror);
    for (let t = 0; t < I.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = (I[t + e] ?? 0) * 3, b = (I[t + ((e + 1) % 3)] ?? 0) * 3;
        const rest = Math.hypot((P[a] ?? 0) - (P[b] ?? 0), (P[a + 1] ?? 0) - (P[b + 1] ?? 0), (P[a + 2] ?? 0) - (P[b + 2] ?? 0));
        const now = Math.hypot((Q[a] ?? 0) - (Q[b] ?? 0), (Q[a + 1] ?? 0) - (Q[b + 1] ?? 0), (Q[a + 2] ?? 0) - (Q[b + 2] ?? 0));
        out[o++] = rest > 1e-7 ? now / rest : 1;
      }
    }
  }
  return out;
}
const quantile = (a: Float64Array, q: number) => {
  const s = Float64Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
};

describe.each(['hi', 'lo'] as const)('pacote anatômico SBL5 (%s)', (lod) => {
  const { pack, bytes } = packs[lod];

  it('cabe no orçamento (celular ≤ 1,2 MB; desktop ≤ 3 MB)', () => {
    expect(bytes).toBeLessThanOrEqual(lod === 'lo' ? 1.2e6 : 3e6);
  });

  it('tem todo músculo do Atlas, toda parte mapeada, ossos de todo segmento e pele', () => {
    const ids = new Set(pack.parts.map((p) => p.id));
    for (const id of [...Object.keys(anatomyJson.muscles), ...Object.keys(anatomyJson.tendons)]) expect(ids, id).toContain(id);
    for (const m of musclesJson) for (const part of m.parts) for (const id of part.mesh) expect(ids, `${m.id}: ${id}`).toContain(id);
    for (const p of pack.parts.filter((q) => q.kind === 'muscle' || q.kind === 'tendon')) expect(['superficial', 'deep'], p.id).toContain(p.layer);
    for (const s of skeletonJson.segments) expect(pack.parts.some((p) => p.kind === 'bone' && p.segment === s.id), s.id).toBe(true);
    expect(pack.parts.filter((p) => p.kind === 'skin')).toHaveLength(1);
  });

  it('no sistema do SBL View: pés em y = 0, estatura 1,75 m, lado direito em −X, rosto para +Z', () => {
    const skin = pack.parts.find((p) => p.kind === 'skin');
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < (skin?.positions.length ?? 0); i += 3) {
      lo = Math.min(lo, skin?.positions[i] ?? 0);
      hi = Math.max(hi, skin?.positions[i] ?? 0);
    }
    expect(lo).toBeCloseTo(0, 3);
    expect(hi).toBeCloseTo(1.75, 3);
    for (const p of pack.parts.filter((q) => q.mirror)) {
      let maxX = -Infinity;
      for (let i = 0; i < p.positions.length; i += 3) maxX = Math.max(maxX, p.positions[i] ?? 0);
      expect(maxX, p.id).toBeLessThan(p.kind === 'skin' ? 1e-4 : 0.016);
    }
    const tip = pack.landmarks.toe_r, heel = pack.landmarks.heel_r;
    expect(tip && heel && tip[2] > heel[2]).toBe(true);
  });

  it('juntas = segmentos do motor, na pose de ligação do skeleton.json; marcos = centros articulares', () => {
    expect(pack.joints.map((j) => j.id)).toEqual(sk.segments.map((s) => s.id));
    for (const j of pack.joints) {
      const o = sk.neutralOrigin.get(j.id);
      for (let k = 0; k < 3; k++) expect(j.origin[k]).toBeCloseTo(o?.[k] ?? NaN, 4);
    }
    const L = pack.landmarks;
    const origin = (id: string) => sk.neutralOrigin.get(id);
    const pairs: [string, string][] = [
      ['hip_r', 'thigh_r'], ['knee_r', 'shank_r'], ['ankle_r', 'foot_r'], ['shoulder_r', 'upperarm_r'], ['elbow_r', 'forearm_r'],
      ['wrist_r', 'hand_r'], ['sc_r', 'clavicle_r'], ['ac_r', 'scapula_r'], ['l5s1', 'lumbar'], ['t12l1', 'trunk'], ['c7t1', 'neck'], ['c1', 'head'],
    ];
    for (const [lm, seg] of pairs) for (let k = 0; k < 3; k++) expect(origin(seg)?.[k], `${lm} → ${seg}`).toBeCloseTo(L[lm]?.[k] ?? NaN, 3);
  });

  it('pesos: 4 por vértice, somam 1, juntas válidas; osso rígido no seu segmento', () => {
    for (const p of pack.parts) {
      const n = p.positions.length / 3;
      for (let v = 0; v < n; v++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          s += p.weights[v * 4 + k] ?? 0;
          expect(p.joints[v * 4 + k] ?? 99).toBeLessThan(pack.joints.length);
        }
        if (Math.abs(s - 1) > 1e-6) throw new Error(`${p.id}: soma ${s}`);
      }
      if (p.kind === 'bone') {
        const j = pack.joints.findIndex((q) => q.id === p.segment);
        for (let v = 0; v < n; v++) if (p.joints[v * 4] !== j || p.weights[v * 4] !== 1) throw new Error(`${p.id} não é rígido`);
      }
    }
  });

  it('músculo e tendão: linha central da origem à inserção, t em [0, 1], vetor radial', () => {
    for (const p of pack.parts.filter((q) => q.kind === 'muscle' || q.kind === 'tendon')) {
      expect(p.centerline?.length, p.id).toBe(16);
      expect(p.ends?.length).toBe(2);
      expect(p.along?.length).toBe(p.positions.length / 3);
      expect(p.radial?.length).toBe(p.positions.length);
    }
    const gas = pack.parts.find((p) => p.id === 'gastrocnemius_medial');
    // A malha do gastrocnêmio acaba no ventre; o tendão do calcâneo é parte própria e leva ao pé.
    expect(gas?.ends).toEqual(['thigh_r', 'shank_r']);
    expect(pack.parts.find((p) => p.id === 'calcaneal_tendon')?.ends).toEqual(['shank_r', 'foot_r']);
    const bic = pack.parts.find((p) => p.id === 'biceps_brachii_long');
    expect(bic?.ends?.[1]).toBe('forearm_r');
  });
});

describe('linhas centrais do motor (muscle-paths.json) = as do pacote', () => {
  it.each(['hi', 'lo'] as const)('%s', (lod) => {
    const byId = new Map(packs[lod].pack.parts.map((p) => [p.id, p]));
    const lines = Object.entries(musclePathsJson.parts);
    expect(lines.length).toBeGreaterThan(70);
    for (const [id, c] of lines) {
      const p = byId.get(id);
      expect(p?.ends, id).toEqual(c.ends);
      expect(p?.layer, id).toBe(c.layer);
      c.line.forEach((q, k) => q.forEach((x, i) => expect(p?.centerline?.[k]?.[i], `${id}[${k}]`).toBeCloseTo(x, 4)));
    }
  });
});

describe('deformação do corpo inteiro nas poses de referência (critério da Fase 7)', () => {
  const { pack } = packs.hi;
  const soft = pack.parts.filter((p) => p.kind !== 'bone');

  it.each(REFERENCE_POSES.filter((p) => p.id !== 'neutral'))('$label: sem NaN, sem estiramento explosivo', ({ deg }) => {
    for (const p of soft) {
      const r = edgeStretch(pack, p, deg);
      for (const x of r) if (!Number.isFinite(x)) throw new Error(`${p.id}: NaN`);
      // Skinning linear: dobras fundas (axila, virilha) estiram e colapsam um pouco; o limite pega explosão
      // (peso errado, junta trocada), não a deformação normal do LBS. Pele: casca contínua, mais exigente.
      if (p.kind === 'skin') {
        expect(quantile(r, 1), p.id).toBeLessThan(12);
        expect(quantile(r, 0.999), p.id).toBeLessThan(3.5);
        expect(quantile(r, 0.0005), p.id).toBeGreaterThan(0.15);
      } else {
        expect(quantile(r, 1), p.id).toBeLessThan(25);
        expect(quantile(r, 0.99), p.id).toBeLessThan(6);
      }
    }
  });

  it('pele: as duas metades continuam coladas na linha média em pose assimétrica', () => {
    const skin = pack.parts.find((p) => p.kind === 'skin');
    if (!skin) throw new Error('sem pele');
    const deg = REFERENCE_POSES.find((p) => p.id === 'overhead')?.deg ?? {};
    const pose = forwardKinematics(sk, degToAngles(deg));
    const M = skinMatrices(sk, pose, pack.joints.map((j) => j.id));
    const right = skinPositions(skin, M);
    const left = skinPositions(skin, M, pack.jointMirror);
    let worst = 0;
    let seam = 0;
    for (let v = 0; v < skin.positions.length / 3; v++) {
      if (skin.positions[v * 3] !== 0) continue;
      seam++;
      worst = Math.max(worst, Math.hypot((right[v * 3] ?? 0) - (left[v * 3] ?? 0), (right[v * 3 + 1] ?? 0) - (left[v * 3 + 1] ?? 0), (right[v * 3 + 2] ?? 0) - (left[v * 3 + 2] ?? 0)));
    }
    expect(seam).toBeGreaterThan(100);
    expect(worst).toBeLessThan(0.001);
  });
});
