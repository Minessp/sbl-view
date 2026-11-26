import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import anatomyJson from '@/data/anatomy.json';
import musclesJson from '@/data/muscles.json';
import musclePathsJson from '@/data/muscle-paths.json';
import { skeletonDef as skeletonJson } from '@/data';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { buildSkeleton, degToAngles } from '@/engine/kinematics/skeleton';
import { skinMatrices, skinPositions } from '@/engine/kinematics/skinning';
import { LODS, type AnatomyLod } from './lod';
import { parseAnatomyPack, type AnatomyPack, type AnatomyPart } from './pack';
import { REFERENCE_POSES } from './poses';

const read = async (lod: AnatomyLod) => {
  const url = new URL(`../../../public/models/anatomy-${lod}.bin`, import.meta.url);
  const file = readFileSync(url);
  return { pack: await parseAnatomyPack(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)), bytes: statSync(url).size };
};
const packs = { lo: await read('lo'), mid: await read('mid'), hi: await read('hi'), ultra: await read('ultra') };
const sk = buildSkeleton(skeletonJson);

/**
 * Razão entre o comprimento de cada aresta posada e o de ligação (direito e cópia espelhada). `maxGrowth`: o maior
 * alongamento absoluto de uma aresta (m); vértice que explode (peso errado) estica dezenas de centímetros. `area`:
 * comprimento de ligação ao quadrado, para quantis por área (a mesma dobra pesa igual em qualquer nível).
 */
function edgeStretch(pack: AnatomyPack, part: AnatomyPart, deg: Record<string, number>, info: { maxGrowth: number; area?: Float64Array } = { maxGrowth: 0 }): Float64Array {
  const pose = forwardKinematics(sk, degToAngles(deg));
  const M = skinMatrices(sk, pose, pack.joints.map((j) => j.id));
  const copies = part.mirror ? [undefined, pack.jointMirror] : [undefined];
  const I = part.indices;
  const P = part.positions;
  const out = new Float64Array(I.length * copies.length);
  const area = new Float64Array(out.length);
  info.area = area;
  let o = 0;
  for (const mirror of copies) {
    const Q = skinPositions(part, M, mirror);
    for (let t = 0; t < I.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = (I[t + e] ?? 0) * 3, b = (I[t + ((e + 1) % 3)] ?? 0) * 3;
        const rest = Math.hypot((P[a] ?? 0) - (P[b] ?? 0), (P[a + 1] ?? 0) - (P[b + 1] ?? 0), (P[a + 2] ?? 0) - (P[b + 2] ?? 0));
        const now = Math.hypot((Q[a] ?? 0) - (Q[b] ?? 0), (Q[a + 1] ?? 0) - (Q[b + 1] ?? 0), (Q[a + 2] ?? 0) - (Q[b + 2] ?? 0));
        // Aresta abaixo de 1 mm não aparece: razão não se aplica.
        area[o] = rest * rest;
        out[o++] = rest > 1e-3 ? now / rest : 1;
        info.maxGrowth = Math.max(info.maxGrowth, now - rest);
      }
    }
  }
  return out;
}
/** Quantil ponderado (histograma logarítmico de 0,01 a 100, 4000 faixas: erro < 0,25%). */
function areaQuantile(r: Float64Array, w: Float64Array, q: number): number {
  const B = 4000;
  const h = new Float64Array(B);
  let total = 0;
  for (let i = 0; i < r.length; i++) {
    const b = Math.min(B - 1, Math.max(0, Math.floor(((Math.log10(r[i] ?? 1) + 2) / 4) * B)));
    h[b] = (h[b] ?? 0) + (w[i] ?? 0);
    total += w[i] ?? 0;
  }
  let acc = 0;
  for (let b = 0; b < B; b++) {
    acc += h[b] ?? 0;
    if (acc >= q * total) return 10 ** (((b + 0.5) / B) * 4 - 2);
  }
  return 100;
}
const quantile = (a: Float64Array, q: number) => {
  const s = Float64Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
};

/** Tamanho medido de cada nível com folga: crescer sem querer falha aqui. */
const BUDGET: Record<AnatomyLod, number> = { lo: 1.2e6, mid: 2.6e6, hi: 7e6, ultra: 12e6 };

describe.each(LODS)('pacote anatômico SBL5 (%s)', (lod) => {
  const { pack, bytes } = packs[lod];

  it('cabe no orçamento do nível (celular sempre no leve)', () => {
    expect(bytes).toBeLessThanOrEqual(BUDGET[lod]);
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
          // Sem expect por vértice: o nível ultra tem mais de um milhão deles.
          if ((p.joints[v * 4 + k] ?? 99) >= pack.joints.length) throw new Error(`${p.id}: junta inválida`);
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
  it.each(LODS)('%s', (lod) => {
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

  // Nenhuma malha muscular do pacote fica sem músculo (seleção, nome, ações e fonte vêm do muscles.json).
  it('toda malha muscular do pacote pertence a uma parte do muscles.json', () => {
    const owned = new Set(musclesJson.flatMap((m) => m.parts.flatMap((p) => p.mesh)));
    const orphans = packs.lo.pack.parts.filter((p) => p.kind === 'muscle' && !owned.has(p.id)).map((p) => p.id);
    expect(orphans).toEqual([]);
  });
});

// mid: malhas originais simplificadas; ultra: densificadas, com pesos interpolados.
describe.each(['mid', 'ultra'] as const)('deformação do corpo inteiro nas poses de referência (%s)', (lod) => {
  const { pack } = packs[lod];
  const soft = pack.parts.filter((p) => p.kind !== 'bone');

  it.each(REFERENCE_POSES.filter((p) => p.id !== 'neutral'))('$label: sem NaN, sem estiramento explosivo', ({ deg }) => {
    for (const p of soft) {
      const info: { maxGrowth: number; area?: Float64Array } = { maxGrowth: 0 };
      const r = edgeStretch(pack, p, deg, info);
      for (const x of r) if (!Number.isFinite(x)) throw new Error(`${p.id}: NaN`);
      // Skinning linear: dobras fundas (axila, virilha) estiram e colapsam um pouco; o limite pega explosão
      // (peso errado, junta trocada), não a deformação normal do LBS. Pele: casca contínua, mais exigente.
      // A razão máxima depende do tamanho da aresta (a malha densificada tem arestas curtas na mesma dobra): vale só
      // nas malhas originais; o alongamento absoluto máximo vale em todo nível (medido: pele 37 mm no mid, 28 no ultra;
      // adutor magno 91 e 72 mm). Quantis por área: a densificação põe mais arestas nas dobras (a axila tinha
      // triângulos grandes), e a contagem simples puniria o nível denso pela mesma deformação.
      const original = lod === 'mid';
      if (p.kind === 'skin') {
        if (original) expect(quantile(r, 1), p.id).toBeLessThan(12);
        expect(info.maxGrowth, p.id).toBeLessThan(0.05);
        expect(areaQuantile(r, info.area ?? r, 0.999), p.id).toBeLessThan(3.5);
        // Compressão nas dobras fundas (joelho a 140°, axila com o braço acima, virilha): 0,13 a 0,15 medido; abaixo
        // disso a coxa volta a seguir o braço (peso da mão na coxa) e estica em vez de dobrar.
        expect(areaQuantile(r, info.area ?? r, 0.0005), p.id).toBeGreaterThan(0.12);
      } else {
        if (original) expect(quantile(r, 1), p.id).toBeLessThan(25);
        expect(info.maxGrowth, p.id).toBeLessThan(0.12);
        expect(areaQuantile(r, info.area ?? r, 0.99), p.id).toBeLessThan(6);
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

/** Arestas da pele: quantos triângulos usam cada uma, e em que sentido. */
function skinEdges(part: AnatomyPart) {
  const I = part.indices;
  const P = part.positions;
  const n = P.length / 3;
  const use = new Map<number, number>();
  const directed = new Map<number, number>();
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = I[t + e] ?? 0, b = I[t + ((e + 1) % 3)] ?? 0;
      const k = a < b ? a * n + b : b * n + a;
      use.set(k, (use.get(k) ?? 0) + 1);
      directed.set(a * n + b, (directed.get(a * n + b) ?? 0) + 1);
    }
  }
  const onSeam = (v: number) => P[v * 3] === 0;
  let border = 0, seam = 0, nonManifold = 0, flipped = 0;
  for (const [k, c] of use) {
    if (c > 2) nonManifold++;
    if (c !== 1) continue;
    if (onSeam(Math.floor(k / n)) && onSeam(k % n)) seam++;
    else border++;
  }
  for (const c of directed.values()) if (c > 1) flipped += c - 1;
  return { border, seam, nonManifold, flipped };
}

describe.each(LODS)('pele estanque (%s)', (lod) => {
  const skin = packs[lod].pack.parts.find((p) => p.kind === 'skin');
  if (!skin) throw new Error('pacote sem pele');
  const e = skinEdges(skin);

  it('nenhuma aresta de borda fora da linha média (a cópia espelhada fecha a costura)', () => {
    // Sem aberturas permitidas: olhos, boca, orelha e a região urogenital também são tampados no empacotamento.
    expect(e.border).toBe(0);
    expect(e.seam).toBeGreaterThan(100);
  });

  it('sem aresta não-variedade e com orientação coerente', () => {
    expect(e.nonManifold).toBe(0);
    expect(e.flipped).toBe(0);
  });
});

describe('sem genitália (região urogenital fora da pele, buraco tampado)', () => {
  it.each(LODS)('%s: a pele da virilha não se projeta à frente do púbis', (lod) => {
    const skin = packs[lod].pack.parts.find((p) => p.kind === 'skin');
    const P = skin?.positions ?? new Float32Array();
    let zMax = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i] ?? 0, y = P[i + 1] ?? 0, z = P[i + 2] ?? 0;
      if (x > -0.04 && y > 0.72 && y < 0.84) zMax = Math.max(zMax, z);
    }
    // Com a região original a ponta chegava a 11,8 cm à frente; o púbis fica em ~8 cm.
    expect(zMax).toBeLessThan(0.09);
  });
});

describe('níveis de detalhe', () => {
  const sig = (p: AnatomyPack) => p.parts.map((q) => [q.id, q.kind, q.mirror, q.layer, q.ends?.join('>'), q.objects.length].join(':')).join(',');

  it('mesmas partes, na mesma ordem, com as mesmas linhas centrais: a troca de nível só muda a malha', () => {
    for (const lod of LODS) {
      expect(sig(packs[lod].pack), lod).toBe(sig(packs.lo.pack));
      packs[lod].pack.parts.forEach((p, i) => expect(p.centerline, `${lod} ${p.id}`).toEqual(packs.lo.pack.parts[i]?.centerline));
    }
  });

  it('cada nível tem mais triângulos que o anterior', () => {
    const tris = LODS.map((l) => packs[l].pack.parts.reduce((n, p) => n + p.indices.length / 3, 0));
    for (let i = 1; i < tris.length; i++) expect(tris[i], LODS[i]).toBeGreaterThan(1.5 * (tris[i - 1] ?? 0));
  });

  /** Quantis do comprimento das arestas da pele (m). */
  const skinEdgeQ = (lod: AnatomyLod, q: number) => {
    const skin = packs[lod].pack.parts.find((p) => p.kind === 'skin');
    const P = skin?.positions ?? new Float32Array();
    const I = skin?.indices ?? new Uint32Array();
    const L = new Float64Array(I.length);
    for (let t = 0; t < I.length; t += 3)
      for (let e = 0; e < 3; e++) {
        const a = (I[t + e] ?? 0) * 3, b = (I[t + ((e + 1) % 3)] ?? 0) * 3;
        L[t + e] = Math.hypot((P[a] ?? 0) - (P[b] ?? 0), (P[a + 1] ?? 0) - (P[b + 1] ?? 0), (P[a + 2] ?? 0) - (P[b + 2] ?? 0));
      }
    return quantile(L, q);
  };

  it('pele densificada: arestas até o limite do nível (hi 5 mm, ultra 3,3 mm); a original passa de 18 mm', () => {
    expect(skinEdgeQ('mid', 0.9)).toBeGreaterThan(0.015);
    // A suavização dos vértices novos estica algumas arestas além do limite da divisão: p99 no limite, máximo com folga.
    expect(skinEdgeQ('hi', 0.99)).toBeLessThanOrEqual(0.005);
    expect(skinEdgeQ('hi', 1)).toBeLessThanOrEqual(0.0075);
    expect(skinEdgeQ('ultra', 0.99)).toBeLessThanOrEqual(0.0033);
    expect(skinEdgeQ('ultra', 1)).toBeLessThanOrEqual(0.005);
  });

  it('densificar preserva a forma: todo vértice da pele original continua na densificada', () => {
    const key = (P: Float32Array, v: number) => `${Math.round((P[v * 3] ?? 0) * 1e4)},${Math.round((P[v * 3 + 1] ?? 0) * 1e4)},${Math.round((P[v * 3 + 2] ?? 0) * 1e4)}`;
    const orig = packs.mid.pack.parts.find((p) => p.kind === 'skin')?.positions ?? new Float32Array();
    for (const lod of ['hi', 'ultra'] as const) {
      const P = packs[lod].pack.parts.find((p) => p.kind === 'skin')?.positions ?? new Float32Array();
      const have = new Set(Array.from({ length: P.length / 3 }, (_, v) => key(P, v)));
      let missing = 0;
      for (let v = 0; v < orig.length / 3; v++) if (!have.has(key(orig, v))) missing++;
      expect(missing, lod).toBe(0);
    }
  });
});
