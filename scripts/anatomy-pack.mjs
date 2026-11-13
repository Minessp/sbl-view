/**
 * Empacota o corpo anatômico (Z-Anatomy, CC BY-SA 4.0) no formato SBL5 (scripts/sbl5.mjs).
 * Roda à mão, depois de tools/anatomy/export.py; o resultado vai versionado em public/models/.
 *
 *   node scripts/anatomy-pack.mjs <pasta do export> [saída=public/models]
 *   node scripts/anatomy-pack.mjs <pasta do export> --landmarks     só imprime os centros articulares
 *
 * Etapas: coordenadas do SBL View (Y para cima, Z anterior, X para a esquerda do sujeito, pés em y = 0,
 * estatura 1,75 m pela pele, centro dos quadris em z = 0) → solda → marcos articulares → pesos → linha central
 * do músculo → dois níveis de detalhe → SBL5.
 *
 * Pesos: osso é rígido no seu segmento (src/data/anatomy.json). Pele, músculo, tendão e disco recebem pesos
 * pela distância à superfície óssea de cada segmento (inverso da 4ª potência), só entre o segmento mais
 * próximo e os vizinhos de até dois níveis na mesma cadeia (nunca o irmão: coxa direita não puxa a esquerda),
 * suavizados pela malha e simetrizados perto da linha média (a cópia espelhada fica idêntica em x = 0).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { packSBL5 } from './sbl5.mjs';
import { closeCracks, dropFolds, dropNonManifold, edgeCensus, edgeUse, fillHoles, fixTJunctions, orientationErrors, weld } from './mesh-tools.mjs';

const args = process.argv.slice(2);
const onlyLandmarks = args.includes('--landmarks');
const [dir, outDir = 'public/models'] = args.filter((a) => !a.startsWith('--'));
if (!dir) {
  console.error('uso: node scripts/anatomy-pack.mjs <pasta do export> [saída] [--landmarks]');
  process.exit(1);
}
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const anatomy = readJson('../src/data/anatomy.json');
const skeleton = readJson('../src/data/skeleton.json');
const muscleDefs = readJson('../src/data/muscles.json');
/** Malhas citadas pelo Atlas (parte ou caminho): só elas viram caminho do motor. */
const cited = new Set(muscleDefs.flatMap((m) => m.parts.flatMap((p) => [...p.mesh, ...(p.path ?? []).filter((x) => typeof x === 'string')])));
const STATURE = 1.75;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const vr4 = (v) => v.map(r4);

// --- Leitura e coordenadas -----------------------------------------------------------------------
const meta = JSON.parse(readFileSync(join(dir, 'raw.json'), 'utf8'));
const bin = readFileSync(join(dir, 'raw.bin'));
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const objects = new Map();
for (const o of meta.objects) {
  objects.set(o.name, {
    ...o,
    pos: new Float32Array(ab.slice(o.offset, o.offset + o.vertexCount * 12)),
    idx: new Uint32Array(ab.slice(o.offset + o.vertexCount * 12, o.offset + o.vertexCount * 12 + o.triangleCount * 12)),
  });
}
const skinNames = [...objects.values()]
  .filter((o) => o.kind === 'skin' && !anatomy.skinExclude.some((s) => o.name.includes(s)))
  .map((o) => o.name);
let floor = Infinity;
let top = -Infinity;
for (const n of skinNames) {
  const p = objects.get(n).pos;
  for (let i = 2; i < p.length; i += 3) {
    floor = Math.min(floor, p[i]);
    top = Math.max(top, p[i]);
  }
}
const K = STATURE / (top - floor);
// Blender (x, y, z) com rosto em −y → SBL (x, z − chão, −y), escala única. Rotação própria: não inverte triângulos.
for (const o of objects.values()) {
  const p = o.pos;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    p[i] = x * K;
    p[i + 1] = (z - floor) * K;
    p[i + 2] = -y * K;
  }
}

const used = new Set();
function obj(name) {
  const o = objects.get(name);
  if (!o) throw new Error(`objeto ausente no export: ${name}`);
  used.add(name);
  return o;
}
const isRightObj = (name) => name.endsWith('.r');

// --- Marcos articulares ---------------------------------------------------------------------------
const points = (name) => obj(name).pos;
function argBy(p, f) {
  let best = -Infinity, at = 0;
  for (let i = 0; i < p.length; i += 3) {
    const v = f(p[i], p[i + 1], p[i + 2]);
    if (v > best) (best = v), (at = i);
  }
  return [p[at], p[at + 1], p[at + 2]];
}
function centroid(p) {
  let x = 0, y = 0, z = 0;
  const n = p.length / 3;
  for (let i = 0; i < p.length; i += 3) (x += p[i]), (y += p[i + 1]), (z += p[i + 2]);
  return [x / n, y / n, z / n];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/** Esfera por mínimos quadrados (forma algébrica). */
function fitSphere(pts) {
  const A = Array.from({ length: 4 }, () => new Float64Array(5));
  for (const [x, y, z] of pts) {
    const row = [2 * x, 2 * y, 2 * z, 1, x * x + y * y + z * z];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) A[i][j] += row[i] * row[j];
  }
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j < 5; j++) A[r][j] -= f * A[c][j];
    }
  }
  const c = [A[0][4] / A[0][0], A[1][4] / A[1][1], A[2][4] / A[2][2]];
  const d = A[3][4] / A[3][3];
  return { center: c, radius: Math.sqrt(d + c[0] ** 2 + c[1] ** 2 + c[2] ** 2) };
}
/** Cabeça articular (fêmur, úmero): parte do ponto mais superomedial e refina a esfera. */
function articularHead(p, [rmin, rmax]) {
  const seed = argBy(p, (x, y) => y + 0.5 * x);
  const all = [];
  for (let i = 0; i < p.length; i += 3) all.push([p[i], p[i + 1], p[i + 2]]);
  let sel = all.filter((q) => dist(q, seed) < 0.03);
  let s = fitSphere(sel);
  for (let k = 0; k < 4; k++) {
    sel = all.filter((q) => {
      const d = dist(q, s.center);
      return d > 0.85 * s.radius && d < 1.12 * s.radius && dist(q, seed) < 0.05;
    });
    s = fitSphere(sel);
  }
  if (s.radius < rmin || s.radius > rmax) throw new Error(`esfera articular com raio ${s.radius}`);
  return s;
}
function epicondyleMid(p, band) {
  let minY = Infinity;
  for (let i = 1; i < p.length; i += 3) minY = Math.min(minY, p[i]);
  const sub = [];
  for (let i = 0; i < p.length; i += 3) if (p[i + 1] < minY + band) sub.push(p[i], p[i + 1], p[i + 2]);
  const lat = argBy(sub, (x) => -x);
  const med = argBy(sub, (x) => x);
  return mid(lat, med);
}
const lowest = (p) => argBy(p, (_, y) => -y);

function landmarks() {
  const femur = points('Femur.r');
  const humerus = points('Humerus.r');
  const hipS = articularHead(femur, [0.018, 0.032]);
  const shS = articularHead(humerus, [0.017, 0.03]);
  const clav = points('Clavicle.r');
  const foot = anatomy.segments.foot_r.map(points);
  const toe = foot.map((p) => argBy(p, (x, y, z) => z)).reduce((a, b) => (b[2] > a[2] ? b : a));
  const parietal = points('Parietal bone.r');
  const vertexPt = argBy(parietal, (x, y) => y);
  const L = {
    hip_r: hipS.center,
    knee_r: epicondyleMid(femur, 0.045),
    ankle_r: mid(lowest(points('Tibia.r')), lowest(points('Fibula.r'))),
    lmal_r: lowest(points('Fibula.r')),
    heel_r: argBy(points('Calcaneus.r'), (x, y, z) => -z),
    toe_r: toe,
    sc_r: argBy(clav, (x) => x),
    ac_r: argBy(clav, (x) => -x),
    shoulder_r: shS.center,
    elbow_r: epicondyleMid(humerus, 0.04),
    wrist_r: mid(lowest(points('Radius.r')), lowest(points('Ulna.r'))),
    met3_r: lowest(points('Third metacarpal bone.r')),
    finger_r: lowest(points('Distal phalanx of third finger of hand.r')),
    l5s1: centroid(points('Intervertebral disc L5-S1')),
    t12l1: centroid(points('Intervertebral disc T12-L1')),
    c7t1: centroid(points('Intervertebral disc C7-T1')),
    c1: centroid(points('Atlas (C1)')),
    vertex: [0, vertexPt[1], vertexPt[2]],
  };
  L.midhip = [0, L.hip_r[1], L.hip_r[2]];
  return { L, radii: { hip: hipS.radius, shoulder: shS.radius } };
}

const { L: L0, radii } = landmarks();
// Centro dos quadris em z = 0 (continuidade com o esqueleto v1 e com o Lab).
const zShift = L0.hip_r[2];
for (const o of objects.values()) for (let i = 2; i < o.pos.length; i += 3) o.pos[i] -= zShift;
const LM = Object.fromEntries(Object.entries(L0).map(([k, v]) => [k, vr4([v[0], v[1], v[2] - zShift])]));
if (onlyLandmarks) {
  console.log(JSON.stringify({ scale: K, radii, landmarks: LM }, null, 1));
  process.exit(0);
}

// --- Esqueleto (juntas do pacote = segmentos do motor, com o lado esquerdo) -------------------------
const mirrorId = (id) => id.replace(/_r$/, '_l');
const joints = [];
for (const s of skeleton.segments) {
  joints.push({ id: s.id, parent: s.parent, origin: s.origin });
  if (s.bilateral) {
    joints.push({ id: mirrorId(s.id), parent: s.parent === null ? null : mirrorId(s.parent), origin: [-s.origin[0], s.origin[1], s.origin[2]] });
  }
}
const J = joints.length;
const jIndex = new Map(joints.map((j, i) => [j.id, i]));
const jMirror = joints.map((j) => jIndex.get(j.id.endsWith('_r') ? mirrorId(j.id) : j.id.replace(/_l$/, '_r')) ?? jIndex.get(j.id));
const depth = joints.map((j) => {
  let d = 0;
  for (let p = j.parent; p !== null; p = joints[jIndex.get(p)].parent) d++;
  return d;
});
for (const seg of Object.keys(anatomy.segments)) if (!jIndex.has(seg)) throw new Error(`segmento ${seg} não está em skeleton.json`);
for (const s of skeleton.segments) if (!anatomy.segments[s.id]) throw new Error(`segmento ${s.id} sem ossos em anatomy.json`);
/** Candidatos de peso a partir do segmento mais próximo: ele, pai, avô, filhos e netos. */
const candidates = joints.map((j, i) => {
  const set = new Set([i]);
  const par = j.parent === null ? -1 : jIndex.get(j.parent);
  if (par >= 0) {
    set.add(par);
    const gp = joints[par].parent;
    if (gp !== null) set.add(jIndex.get(gp));
  }
  joints.forEach((c, ci) => {
    if (c.parent === j.id) {
      set.add(ci);
      joints.forEach((g, gi) => g.parent === c.id && set.add(gi));
    }
  });
  return [...set];
});

// --- Malhas ----------------------------------------------------------------------------------------
function merge(names) {
  const list = names.map(obj);
  const nv = list.reduce((a, o) => a + o.pos.length / 3, 0);
  const nt = list.reduce((a, o) => a + o.idx.length, 0);
  const pos = new Float32Array(nv * 3);
  const idx = new Uint32Array(nt);
  let v = 0, t = 0;
  for (const o of list) {
    pos.set(o.pos, v * 3);
    for (let i = 0; i < o.idx.length; i++) idx[t + i] = o.idx[i] + v;
    v += o.pos.length / 3;
    t += o.idx.length;
  }
  return weld({ pos, idx });
}
const parts = [];
const soft = anatomy.softBones;
for (const [seg, names] of Object.entries(anatomy.segments)) {
  const rigid = names.filter((n) => !soft.some((s) => n.startsWith(s)));
  const lateral = seg.endsWith('_r');
  const groups = lateral
    ? [[`bones_${seg}`, rigid, true]]
    : [
        [`bones_${seg}`, rigid.filter((n) => !isRightObj(n)), false],
        [`bones_${seg}_side`, rigid.filter(isRightObj), true],
      ];
  for (const [id, list, mirror] of groups) {
    if (list.length === 0) continue;
    parts.push({ id, kind: 'bone', segment: seg, mirror, names: list, mesh: merge(list) });
  }
}
const discNames = Object.values(anatomy.segments).flat().filter((n) => soft.some((s) => n.startsWith(s)));
parts.push({ id: 'intervertebral_discs', kind: 'cartilage', mirror: false, names: discNames, mesh: merge(discNames) });

const mapped = new Set();
for (const [id, m] of Object.entries(anatomy.muscles)) {
  for (const n of m.objects) mapped.add(n);
  parts.push({ id, kind: 'muscle', mirror: m.objects.some(isRightObj), names: m.objects, mesh: merge(m.objects) });
}
for (const [id, names] of Object.entries(anatomy.tendons)) {
  for (const n of names) mapped.add(n);
  parts.push({ id, kind: 'tendon', mirror: names.some(isRightObj), names, mesh: merge(names) });
}
const autoId = (name) =>
  name
    .replace(/\.r$/, '')
    .replace(/[()]/g, '')
    .toLowerCase()
    .replace(/\b(muscle|muscles|of|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
const ids = new Set(parts.map((p) => p.id));
for (const o of objects.values()) {
  if (o.kind !== 'muscle' || mapped.has(o.name) || anatomy.muscleExclude.some((s) => o.name.includes(s))) continue;
  const id = autoId(o.name);
  if (ids.has(id)) throw new Error(`id repetido: ${id}`);
  ids.add(id);
  parts.push({ id, kind: 'muscle', mirror: isRightObj(o.name), names: [o.name], mesh: merge([o.name]) });
}
{
  // Pele estanque: as regiões do Z-Anatomy viram uma superfície fechada (só a linha média fica aberta; a cópia
  // espelhada fecha). A região urogenital fica de fora (anatomy.json) e o buraco dela é tampado como os outros.
  let skin = closeCracks(merge(skinNames), 0.001);
  // Linha média exata: a cópia espelhada encosta sem fresta.
  for (let i = 0; i < skin.pos.length; i += 3) if (Math.abs(skin.pos[i]) < 5e-4) skin.pos[i] = 0;
  const onSeam = (v, P) => P[v * 3] === 0;
  skin = fixTJunctions(skin, 5e-4, onSeam);
  const nm = dropNonManifold(skin);
  const folds = dropFolds(nm.mesh);
  const filled = fillHoles(folds.mesh, { onSeam });
  skin = weld(filled.mesh);
  const census = edgeCensus(skin, onSeam);
  const flips = orientationErrors(skin.idx);
  console.log(
    `pele: ${nm.removed} triângulos em aresta não-variedade, ${folds.removed} em aba dobrada, ${filled.report.length} buracos tampados ` +
      `(${filled.report.reduce((n, r) => n + r.added, 0)} triângulos novos); borda fora da costura ${census.border.length}, não-variedade ${census.nonManifold}, orientação ${flips}`,
  );
  if (census.border.length || census.nonManifold || flips) throw new Error('pele não ficou estanque');
  parts.push({ id: 'skin', kind: 'skin', mirror: true, names: skinNames, mesh: skin });
}
for (const p of parts) {
  if (p.mirror) {
    let maxX = -Infinity;
    for (let i = 0; i < p.mesh.pos.length; i += 3) maxX = Math.max(maxX, p.mesh.pos[i]);
    // Pele precisa encostar exatamente; peças rígidas ou músculos que passam alguns mm só se sobrepõem.
    if (p.kind === 'skin' ? maxX > 5e-4 : maxX > 0.015) throw new Error(`${p.id}: parte espelhada cruza a linha média (x máx ${maxX})`);
  }
}

// --- Árvore k-d (vizinho mais próximo) -----------------------------------------------------------
function kdBuild(pts) {
  const n = pts.length / 3;
  const ord = new Uint32Array(n);
  for (let i = 0; i < n; i++) ord[i] = i;
  const select = (lo, hi, k, ax) => {
    while (hi - lo > 1) {
      const pv = pts[ord[(lo + hi) >> 1] * 3 + ax];
      let i = lo, j = hi - 1;
      while (i <= j) {
        while (pts[ord[i] * 3 + ax] < pv) i++;
        while (pts[ord[j] * 3 + ax] > pv) j--;
        if (i <= j) {
          const t = ord[i];
          ord[i] = ord[j];
          ord[j] = t;
          i++;
          j--;
        }
      }
      if (k <= j) hi = j + 1;
      else if (k >= i) lo = i;
      else return;
    }
  };
  const build = (lo, hi, d) => {
    if (hi - lo <= 1) return;
    const m = (lo + hi) >> 1;
    select(lo, hi, m, d % 3);
    build(lo, m, d + 1);
    build(m + 1, hi, d + 1);
  };
  build(0, n, 0);
  const sorted = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) sorted.set(pts.subarray(ord[i] * 3, ord[i] * 3 + 3), i * 3);
  return { pts: sorted, n, ord };
}
function kdNearest(tree, qx, qy, qz, maxD) {
  let best2 = maxD * maxD;
  const P = tree.pts;
  const q = [qx, qy, qz];
  const rec = (lo, hi, d) => {
    if (lo >= hi) return;
    const m = (lo + hi) >> 1;
    const dx = P[m * 3] - qx, dy = P[m * 3 + 1] - qy, dz = P[m * 3 + 2] - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best2) best2 = d2;
    const diff = q[d % 3] - P[m * 3 + (d % 3)];
    if (diff < 0) {
      rec(lo, m, d + 1);
      if (diff * diff < best2) rec(m + 1, hi, d + 1);
    } else {
      rec(m + 1, hi, d + 1);
      if (diff * diff < best2) rec(lo, m, d + 1);
    }
  };
  rec(0, tree.n, 0);
  return Math.sqrt(best2);
}

/** Índice (na entrada do kdBuild) do ponto mais próximo, ou -1 além de maxD. */
function kdNearestIndex(tree, qx, qy, qz, maxD) {
  let best2 = maxD * maxD, bi = -1;
  const P = tree.pts;
  const q = [qx, qy, qz];
  const rec = (lo, hi, d) => {
    if (lo >= hi) return;
    const m = (lo + hi) >> 1;
    const dx = P[m * 3] - qx, dy = P[m * 3 + 1] - qy, dz = P[m * 3 + 2] - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best2) (best2 = d2), (bi = m);
    const diff = q[d % 3] - P[m * 3 + (d % 3)];
    if (diff < 0) {
      rec(lo, m, d + 1);
      if (diff * diff < best2) rec(m + 1, hi, d + 1);
    } else {
      rec(m + 1, hi, d + 1);
      if (diff * diff < best2) rec(lo, m, d + 1);
    }
  };
  rec(0, tree.n, 0);
  return bi < 0 ? -1 : tree.ord[bi];
}

// Superfície óssea por segmento, com os dois lados.
const bonePts = joints.map(() => []);
for (const p of parts.filter((q) => q.kind === 'bone')) {
  const j = jIndex.get(p.segment);
  const P = p.mesh.pos;
  for (let i = 0; i < P.length; i += 3) bonePts[j].push(P[i], P[i + 1], P[i + 2]);
  if (p.mirror) for (let i = 0; i < P.length; i += 3) bonePts[jMirror[j]].push(-P[i], P[i + 1], P[i + 2]);
}
const trees = bonePts.map((a) => kdBuild(new Float32Array(a)));
const boxes = bonePts.map((a) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], a[i + k])), (hi[k] = Math.max(hi[k], a[i + k]));
  return { lo, hi };
});
const boxDist = (b, x, y, z) =>
  Math.hypot(Math.max(b.lo[0] - x, 0, x - b.hi[0]), Math.max(b.lo[1] - y, 0, y - b.hi[1]), Math.max(b.lo[2] - z, 0, z - b.hi[2]));

// --- Adjacência e suavização -------------------------------------------------------------------------
function adjacency(n, idx) {
  const deg = new Uint32Array(n + 1);
  for (let i = 0; i < idx.length; i++) deg[idx[i]] += 2;
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, n);
  const nb = new Uint32Array(start[n]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    nb[fill[a]++] = b;
    nb[fill[a]++] = c;
    nb[fill[b]++] = a;
    nb[fill[b]++] = c;
    nb[fill[c]++] = a;
    nb[fill[c]++] = b;
  }
  return { start, nb };
}
function meanEdge({ pos, idx }) {
  let s = 0;
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e] * 3, b = idx[t + ((e + 1) % 3)] * 3;
      s += Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
    }
  }
  return s / idx.length;
}

const SMOOTH = { skin: 0.07, cartilage: 0.01 };
/** Desvio da gaussiana do perfil de pesos ao longo do músculo (m). */
const PROFILE_SIGMA = 0.05;
const MIDBAND = 0.03;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Pesos densos (n × J) → 4 maiores, em u8 somando 255. Vértice na linha média de parte espelhada escolhe
 * juntas laterais aos pares (_r com _l), para a cópia espelhada ficar idêntica.
 */
function quantize(W, n, pos, mirror) {
  const out = new Uint8Array(n * 8);
  const order = new Array(J);
  for (let v = 0; v < n; v++) {
    for (let j = 0; j < J; j++) order[j] = j;
    order.sort((a, b) => W[v * J + b] - W[v * J + a] || a - b);
    let top = order.slice(0, 4);
    if (mirror && Math.abs(pos[v * 3]) < 1e-6) {
      top = [];
      for (const j of order) {
        if (top.includes(j)) continue;
        const m = jMirror[j];
        if (m === j) {
          if (top.length < 4) top.push(j);
        } else if (top.length <= 2) top.push(Math.min(j, m), Math.max(j, m));
        if (top.length === 4) break;
      }
      while (top.length < 4) top.push(order.find((j) => !top.includes(j) && jMirror[j] === j) ?? 0);
    }
    const sum = top.reduce((s, j) => s + W[v * J + j], 0);
    const raw = top.map((j) => (W[v * J + j] / sum) * 255);
    const q = raw.map(Math.floor);
    let rest = 255 - q.reduce((a, b) => a + b, 0);
    const frac = raw.map((r, i) => [r - q[i], i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; rest > 0; k++, rest--) q[frac[k % 4][1]]++;
    if (mirror && Math.abs(pos[v * 3]) < 1e-6) {
      // Par _r/_l com valores diferentes por arredondamento: a unidade extra vai para uma junta central.
      const central = top.findIndex((j) => jMirror[j] === j && q[top.indexOf(j)] > 0);
      for (let a = 0; a < 4 && central >= 0; a++) {
        const b = top.indexOf(jMirror[top[a]]);
        if (b > a && q[a] !== q[b]) {
          const hi = q[a] > q[b] ? a : b;
          q[hi]--;
          q[central]++;
        }
      }
    }
    for (let k = 0; k < 4; k++) {
      out[v * 8 + k] = q[k] > 0 ? top[k] : 0;
      out[v * 8 + 4 + k] = q[k];
    }
  }
  return out;
}

function rigidWeights(p) {
  const n = p.mesh.pos.length / 3;
  const W = new Float32Array(n * J);
  const j = jIndex.get(p.segment);
  for (let v = 0; v < n; v++) W[v * J + j] = 1;
  return W;
}
/** Pesos pela distância à superfície óssea de cada segmento (sem suavizar). */
function nearestWeights(p) {
  const { pos } = p.mesh;
  const n = pos.length / 3;
  const W = new Float32Array(n * J);
  const lb = new Float64Array(J);
  const ord = Array.from({ length: J }, (_, i) => i);
  const d = new Float64Array(J);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let j = 0; j < J; j++) lb[j] = boxDist(boxes[j], x, y, z);
    ord.sort((a, b) => lb[a] - lb[b]);
    let best = Infinity;
    d.fill(Infinity);
    for (const j of ord) {
      const lim = best * 2.5 + 0.02;
      if (lb[j] > lim) break;
      d[j] = kdNearest(trees[j], x, y, z, Math.min(lim, 1));
      best = Math.min(best, d[j]);
    }
    let N = 0;
    for (let j = 1; j < J; j++) if (d[j] < d[N]) N = j;
    let sum = 0;
    for (const j of candidates[N]) {
      if (!Number.isFinite(d[j])) continue;
      const w = 1 / (d[j] * d[j] + 2.5e-5) ** 2;
      W[v * J + j] = w;
      sum += w;
    }
    for (const j of candidates[N]) W[v * J + j] /= sum;
  }
  return W;
}
/** Difusão dos pesos pela malha até ~D metros (passos = 2 (D / aresta)²). */
function smoothWeights(p, W, D) {
  const { pos, idx } = p.mesh;
  const n = pos.length / 3;
  // Suavização pela malha (só nas juntas presentes na parte).
  const present = [];
  for (let j = 0; j < J; j++) {
    for (let v = 0; v < n; v++) {
      if (W[v * J + j] > 0) {
        present.push(j);
        break;
      }
    }
  }
  if (p.mirror) for (const j of [...present]) if (!present.includes(jMirror[j])) present.push(jMirror[j]);
  const e = meanEdge(p.mesh);
  const iters = Math.min(600, Math.max(0, Math.round(2 * (D / e) ** 2)));
  const { start, nb } = adjacency(n, idx);
  let A = new Float32Array(n * present.length);
  for (let v = 0; v < n; v++) present.forEach((j, k) => (A[v * present.length + k] = W[v * J + j]));
  let B = new Float32Array(A.length);
  const P = present.length;
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < n; v++) {
      const s0 = start[v], s1 = start[v + 1];
      const m = s1 - s0;
      for (let k = 0; k < P; k++) {
        if (m === 0) {
          B[v * P + k] = A[v * P + k];
          continue;
        }
        let acc = 0;
        for (let s = s0; s < s1; s++) acc += A[nb[s] * P + k];
        B[v * P + k] = 0.5 * A[v * P + k] + 0.5 * (acc / m);
      }
    }
    [A, B] = [B, A];
  }
  W.fill(0);
  for (let v = 0; v < n; v++) present.forEach((j, k) => (W[v * J + j] = A[v * P + k]));
  return iters;
}
/** Linha média: média com o espelho, que vale inteira em x = 0 (a cópia espelhada encosta sem fresta). */
function symmetrize(p, W, band) {
  const { pos } = p.mesh;
  const n = pos.length / 3;
  let maxX = -Infinity;
  for (let v = 0; v < n; v++) maxX = Math.max(maxX, pos[v * 3]);
  // Só quem encosta na linha média (pele, reto do abdome, trapézio…). Músculo que só chega perto fica como está.
  if (maxX > -0.002) {
    const row = new Float32Array(J);
    for (let v = 0; v < n; v++) {
      const t = smoothstep(0, band, -pos[v * 3]);
      if (t >= 1) continue;
      for (let j = 0; j < J; j++) row[j] = 0.5 * (W[v * J + j] + W[v * J + jMirror[j]]);
      for (let j = 0; j < J; j++) W[v * J + j] = row[j] + t * (W[v * J + j] - row[j]);
    }
  }
}
/**
 * Músculo e tendão: o peso depende só da posição ao longo da linha central. O perfil sai da média, por fatia,
 * dos pesos de distância ao osso, suavizado ao longo do comprimento: a seção transversal move junta, a
 * transição entre origem e inserção se espalha pelo músculo (sem cisalhar o ventre).
 */
function profileWeights(p, W0, t, length) {
  const n = t.length;
  const B = 64;
  const prof = new Float64Array(B * J);
  const cnt = new Float64Array(B);
  for (let v = 0; v < n; v++) {
    const k = Math.min(B - 1, Math.floor(t[v] * B));
    cnt[k]++;
    for (let j = 0; j < J; j++) prof[k * J + j] += W0[v * J + j];
  }
  for (let k = 0; k < B; k++) if (cnt[k] > 0) for (let j = 0; j < J; j++) prof[k * J + j] /= cnt[k];
  // Fatias vazias herdam a vizinha mais próxima.
  for (let k = 0; k < B; k++) {
    if (cnt[k] > 0) continue;
    let d = 1;
    while (!(cnt[k - d] > 0) && !(cnt[k + d] > 0)) d++;
    const s = cnt[k - d] > 0 ? k - d : k + d;
    for (let j = 0; j < J; j++) prof[k * J + j] = prof[s * J + j];
  }
  const sigma = Math.max(1, Math.min(0.2, PROFILE_SIGMA / Math.max(length, 1e-3)) * B);
  const R = Math.ceil(3 * sigma);
  const sm = new Float64Array(B * J);
  for (let k = 0; k < B; k++) {
    let ws = 0;
    for (let d = -R; d <= R; d++) {
      const s = Math.min(B - 1, Math.max(0, k + d));
      const w = Math.exp(-(d * d) / (2 * sigma * sigma));
      ws += w;
      for (let j = 0; j < J; j++) sm[k * J + j] += w * prof[s * J + j];
    }
    for (let j = 0; j < J; j++) sm[k * J + j] /= ws;
  }
  const W = new Float32Array(n * J);
  for (let v = 0; v < n; v++) {
    const x = Math.min(B - 1, Math.max(0, t[v] * B - 0.5));
    const k0 = Math.floor(x), k1 = Math.min(B - 1, k0 + 1), f = x - k0;
    for (let j = 0; j < J; j++) W[v * J + j] = sm[k0 * J + j] * (1 - f) + sm[k1 * J + j] * f;
  }
  return W;
}

// --- Linha central do músculo ---------------------------------------------------------------------
const SLICES = 16;
/** Vértices de pele (lado direito) sob os quais a parte é a primeira camada mole: a partir daqui, superficial. */
const LAYER_HITS = 10;
function muscleAxis(p, W) {
  const { pos } = p.mesh;
  const n = pos.length / 3;
  const c = centroid(pos);
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let v = 0; v < n; v++) {
    const d = [pos[v * 3] - c[0], pos[v * 3 + 1] - c[1], pos[v * 3 + 2] - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j];
  }
  let a = [0.3, 1, 0.2];
  for (let k = 0; k < 60; k++) {
    const b = [0, 1, 2].map((i) => C[i * 3] * a[0] + C[i * 3 + 1] * a[1] + C[i * 3 + 2] * a[2]);
    const l = Math.hypot(...b);
    a = b.map((x) => x / l);
  }
  const s = new Float64Array(n);
  let smin = Infinity, smax = -Infinity;
  for (let v = 0; v < n; v++) {
    s[v] = (pos[v * 3] - c[0]) * a[0] + (pos[v * 3 + 1] - c[1]) * a[1] + (pos[v * 3 + 2] - c[2]) * a[2];
    smin = Math.min(smin, s[v]);
    smax = Math.max(smax, s[v]);
  }
  // Centróide por fatia ao longo do eixo principal.
  const acc = Array.from({ length: SLICES }, () => [0, 0, 0, 0]);
  for (let v = 0; v < n; v++) {
    const k = Math.min(SLICES - 1, Math.floor(((s[v] - smin) / (smax - smin)) * SLICES));
    acc[k][0] += pos[v * 3];
    acc[k][1] += pos[v * 3 + 1];
    acc[k][2] += pos[v * 3 + 2];
    acc[k][3]++;
  }
  let line = acc.map((q, k) =>
    q[3] > 0 ? [q[0] / q[3], q[1] / q[3], q[2] / q[3]] : [0, 1, 2].map((i) => c[i] + a[i] * (smin + ((k + 0.5) / SLICES) * (smax - smin))),
  );
  for (let pass = 0; pass < 2; pass++) {
    line = line.map((q, k) => (k === 0 || k === SLICES - 1 ? q : [0, 1, 2].map((i) => 0.25 * line[k - 1][i] + 0.5 * q[i] + 0.25 * line[k + 1][i])));
  }
  // Projeção de cada vértice na polilinha (parâmetro por comprimento de arco).
  const segLen = line.slice(1).map((q, k) => dist(q, line[k]));
  const total = segLen.reduce((x, y) => x + y, 0);
  const cum = [0];
  for (const l of segLen) cum.push(cum[cum.length - 1] + l);
  const t = new Float32Array(n);
  const radial = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const q = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    let bestD = Infinity, bestT = 0, bestP = line[0];
    for (let k = 0; k < SLICES - 1; k++) {
      const A0 = line[k], B0 = line[k + 1];
      const ab = [B0[0] - A0[0], B0[1] - A0[1], B0[2] - A0[2]];
      const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
      const u = Math.min(1, Math.max(0, ((q[0] - A0[0]) * ab[0] + (q[1] - A0[1]) * ab[1] + (q[2] - A0[2]) * ab[2]) / L2));
      const pr = [A0[0] + ab[0] * u, A0[1] + ab[1] * u, A0[2] + ab[2] * u];
      const dd = dist(q, pr);
      if (dd < bestD) (bestD = dd), (bestT = (cum[k] + u * segLen[k]) / total), (bestP = pr);
    }
    t[v] = bestT;
    radial.set([q[0] - bestP[0], q[1] - bestP[1], q[2] - bestP[2]], v * 3);
  }
  // Origem = ponta presa ao segmento mais proximal (empate: a mais alta).
  const endJoint = (lo, hi) => {
    const acc2 = new Float64Array(J);
    for (let v = 0; v < n; v++) if (t[v] >= lo && t[v] <= hi) for (let j = 0; j < J; j++) acc2[j] += W[v * J + j];
    let b = 0;
    for (let j = 1; j < J; j++) if (acc2[j] > acc2[b]) b = j;
    return b;
  };
  let e0 = endJoint(0, 0.12), e1 = endJoint(0.88, 1);
  const flip = depth[e0] > depth[e1] || (depth[e0] === depth[e1] && line[0][1] < line[SLICES - 1][1]);
  if (flip) {
    for (let v = 0; v < n; v++) t[v] = 1 - t[v];
    line = line.reverse();
    [e0, e1] = [e1, e0];
  }
  let rmax = 1e-6;
  const section = new Float64Array(SLICES);
  const cnt = new Float64Array(SLICES);
  for (let v = 0; v < n; v++) {
    const r = Math.hypot(radial[v * 3], radial[v * 3 + 1], radial[v * 3 + 2]);
    rmax = Math.max(rmax, r);
    const k = Math.min(SLICES - 1, Math.floor(t[v] * SLICES));
    section[k] += r;
    cnt[k]++;
  }
  const attr = new Uint8Array(n * 4);
  const i8 = new Int8Array(attr.buffer);
  for (let v = 0; v < n; v++) {
    attr[v * 4] = Math.round(t[v] * 255);
    for (let i = 0; i < 3; i++) i8[v * 4 + 1 + i] = Math.round((radial[v * 3 + i] / rmax) * 127);
  }
  return {
    attr,
    centerline: line.map(vr4),
    section: [...section].map((s, k) => r4(cnt[k] ? s / cnt[k] : 0)),
    rmax: r4(rmax),
    ends: [joints[e0].id, joints[e1].id],
    t,
    length: total,
  };
}

// --- Profundidade sob a pele (mediana, mm). A classificação em camadas fica para o runtime. ----------
const skinPart = parts.find((p) => p.id === 'skin');
const skinTree = (() => {
  const { pos, idx } = skinPart.mesh;
  const pts = Array.from(pos);
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e] * 3, b = idx[t + ((e + 1) % 3)] * 3;
      pts.push((pos[a] + pos[b]) / 2, (pos[a + 1] + pos[b + 1]) / 2, (pos[a + 2] + pos[b + 2]) / 2);
    }
  }
  return kdBuild(new Float32Array(pts));
})();
function skinDepth(p) {
  const P = p.mesh.pos;
  const d = [];
  for (let v = 0; v < P.length; v += 3) d.push(kdNearest(skinTree, P[v], P[v + 1], P[v + 2], 0.3));
  d.sort((x, y) => x - y);
  return Math.round(d[d.length >> 1] * 1000);
}

// --- Processa ------------------------------------------------------------------------------------
const t0 = Date.now();
for (const p of parts) {
  if (p.kind === 'bone') p.W = rigidWeights(p);
  else if (p.kind === 'muscle' || p.kind === 'tendon') {
    const W0 = nearestWeights(p);
    Object.assign(p, muscleAxis(p, W0));
    p.W = profileWeights(p, W0, p.t, p.length);
    if (p.mirror) symmetrize(p, p.W, 0.01);
    p.skinDepth = skinDepth(p);
  } else {
    p.W = nearestWeights(p);
    smoothWeights(p, p.W, SMOOTH[p.kind]);
    if (p.mirror) symmetrize(p, p.W, MIDBAND);
  }
  p.skin = quantize(p.W, p.mesh.pos.length / 3, p.mesh.pos, p.mirror);
}
console.log(`pesos e linhas centrais: ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// --- Pontas: o peso suavizado pode errar o segmento da inserção; anatomy.json corrige (`ends`). -----------
for (const p of parts) {
  const fix = anatomy.muscles[p.id]?.ends;
  if (p.centerline && fix) p.ends = fix;
}

// --- Camada: superficial = músculo que é o mais próximo da pele em algum trecho ----------------------
// Distância à pele sozinha erra (glúteo máximo fica fundo sob a gordura); aqui conta a área de pele
// sob a qual a parte é a primeira camada mole.
{
  const soft = parts.filter((p) => p.kind === 'muscle' || p.kind === 'tendon');
  const owner = [];
  const pts = [];
  soft.forEach((p, i) => {
    const P = p.mesh.pos;
    for (let v = 0; v < P.length; v += 3) pts.push(P[v], P[v + 1], P[v + 2]), owner.push(i);
  });
  const tree = kdBuild(new Float32Array(pts));
  const hits = new Float64Array(soft.length);
  const S = skinPart.mesh.pos;
  for (let v = 0; v < S.length; v += 3) {
    const i = kdNearestIndex(tree, S[v], S[v + 1], S[v + 2], 0.12);
    if (i >= 0) hits[owner[i]] += S[v] === 0 ? 0.5 : 1;
  }
  const total = S.length / 3;
  soft.forEach((p, i) => {
    p.skinShare = r4(hits[i] / total);
    p.layer = anatomy.muscles[p.id]?.layer ?? (hits[i] >= LAYER_HITS ? 'superficial' : 'deep');
  });
  console.log(`camada superficial: ${soft.filter((p) => p.layer === 'superficial').map((p) => `${p.id}=${Math.round(hits[soft.indexOf(p)])}`).join(' ')}`);
  console.log(`camada profunda (vértices de pele mais próximos): ${soft.filter((p) => p.layer === 'deep').map((p) => `${p.id}=${Math.round(hits[soft.indexOf(p)])}`).join(' ')}`);
}

// --- Caminhos musculares do motor (src/data/muscle-paths.json) --------------------------------------
{
  const out = {};
  for (const p of parts) {
    if (!p.centerline || !cited.has(p.id)) continue;
    out[p.id] = { ends: p.ends, layer: p.layer, line: p.centerline };
  }
  const missing = [...cited].filter((id) => !out[id]);
  if (missing.length) throw new Error(`malhas citadas em muscles.json sem linha central: ${missing.join(', ')}`);
  const file = new URL('../src/data/muscle-paths.json', import.meta.url);
  const note = 'Gerado por scripts/anatomy-pack.mjs a partir da linha central de cada malha (Z-Anatomy): 16 pontos na pose neutra (m, lado direito), da origem (ends[0]) à inserção (ends[1]). O motor reparte os pontos entre os segmentos (src/engine/muscle/resolve.ts). Não editar à mão.';
  const lines = Object.entries(out).map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v)}`);
  const body = ['{', ` "note": ${JSON.stringify(note)},`, ' "parts": {', lines.join(',\n'), ' }', '}', ''].join('\n');
  writeFileSync(file, body);
}


// --- Níveis de detalhe e pacote ----------------------------------------------------------------------
await MeshoptSimplifier.ready;
const LOD = {
  hi: { bone: [0.3, 300], cartilage: [0.3, 60], muscle: [0.3, 160], tendon: [0.3, 60], skin: [1, 0] },
  lo: { bone: [0.11, 120], cartilage: [0.12, 30], muscle: [0.11, 60], tendon: [0.12, 30], skin: [0.5, 0] },
};
function simplifyIdx(p, ratio, min) {
  const { pos, idx } = p.mesh;
  const target = Math.min(idx.length, Math.max(min * 3, Math.round((idx.length * ratio) / 3) * 3));
  if (target >= idx.length) return idx;
  if (p.kind === 'skin') {
    // O colapso de arestas às vezes amassa paredes muito próximas (entrada do canal auditivo, entre os dedos do pé) e
    // deixa aresta com três triângulos. A pele tem de continuar estanque: trava os vértices a 1,5 cm do defeito e refaz.
    const n = pos.length / 3;
    const lock = new Uint8Array(n);
    const none = new Float32Array(n);
    for (let attempt = 0; attempt < 8; attempt++) {
      const [out] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, none, 1, [0], lock, target, 0.05, ['LockBorder']);
      const c = edgeCensus({ pos, idx: out }, (v, P) => P[v * 3] === 0);
      const bad = new Set();
      for (const [e, k] of edgeUse(out)) if (k > 2) bad.add(Math.floor(e / 4294967296)).add(e % 4294967296);
      const dir = new Map();
      for (let t = 0; t < out.length; t += 3)
        for (let e = 0; e < 3; e++) {
          const key = `${out[t + e]},${out[t + ((e + 1) % 3)]}`;
          if (dir.has(key)) bad.add(out[t + e]).add(out[t + ((e + 1) % 3)]);
          dir.set(key, 1);
        }
      for (const [a2, b2] of c.border) bad.add(a2).add(b2);
      if (bad.size === 0) return out;
      for (let v = 0; v < n; v++)
        for (const u of bad)
          if (Math.hypot(pos[v * 3] - pos[u * 3], pos[v * 3 + 1] - pos[u * 3 + 1], pos[v * 3 + 2] - pos[u * 3 + 2]) < 0.015) lock[v] = 1;
    }
    throw new Error('pele simplificada não ficou estanque');
  }
  let [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.05, []);
  if (out.length > target * 1.4 && p.kind !== 'skin') [out] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, 0.05);
  return out;
}

const bbLo = [Infinity, Infinity, Infinity], bbHi = [-Infinity, -Infinity, -Infinity];
for (const p of parts) {
  const P = p.mesh.pos;
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) (bbLo[k] = Math.min(bbLo[k], P[i + k])), (bbHi[k] = Math.max(bbHi[k], P[i + k]));
}
const offset = vr4(bbLo.map((x) => x - 1e-4));
const scale = vr4(bbHi.map((x, k) => x + 1e-4 - offset[k]));

mkdirSync(outDir, { recursive: true });
for (const [lod, spec] of Object.entries(LOD)) {
  const packed = [];
  let tris = 0;
  for (const p of parts) {
    const [ratio, min] = spec[p.kind];
    const idx = simplifyIdx(p, ratio, min);
    // Compacta: só os vértices usados, com os atributos.
    const remap = new Int32Array(p.mesh.pos.length / 3).fill(-1);
    const keep = [];
    const out = new Uint32Array(idx.length);
    for (let i = 0; i < idx.length; i++) {
      if (remap[idx[i]] < 0) {
        remap[idx[i]] = keep.length;
        keep.push(idx[i]);
      }
      out[i] = remap[idx[i]];
    }
    const q = new Int16Array(keep.length * 3);
    const skin = new Uint8Array(keep.length * 8);
    const muscle = p.attr ? new Uint8Array(keep.length * 4) : undefined;
    keep.forEach((v, i) => {
      for (let k = 0; k < 3; k++) q[i * 3 + k] = Math.round(((p.mesh.pos[v * 3 + k] - offset[k]) / scale[k]) * 32767);
      skin.set(p.skin.subarray(v * 8, v * 8 + 8), i * 8);
      if (muscle) muscle.set(p.attr.subarray(v * 4, v * 4 + 4), i * 4);
    });
    tris += out.length / 3;
    const metaPart = {
      id: p.id,
      kind: p.kind,
      mirror: p.mirror,
      objects: p.names,
      ...(p.segment && { segment: p.segment }),
      ...(p.skinDepth !== undefined && { skinDepth: p.skinDepth }),
      ...(p.layer && { layer: p.layer }),
      ...(p.centerline && { ends: p.ends, centerline: p.centerline, section: p.section, rmax: p.rmax }),
    };
    packed.push({ meta: metaPart, q, idx: out, skin, muscle });
  }
  const header = {
    format: 'SBL5',
    lod,
    stature: STATURE,
    source: anatomy.source,
    joints,
    landmarks: LM,
    offset,
    scale,
  };
  const buf = await packSBL5({ header, parts: packed });
  const file = join(outDir, `anatomy-${lod}.bin`);
  writeFileSync(file, buf);
  console.log(`${file}: ${parts.length} partes, ${tris} triângulos (lado direito + linha média), ${(buf.length / 1024).toFixed(0)} KB`);
}
const unused = [...objects.values()].filter((o) => !used.has(o.name) && o.kind === 'bone').map((o) => o.name);
console.log(`ossos do export fora do pacote: ${unused.join(', ')}`);
console.log(`profundidade sob a pele (mm): ${parts.filter((p) => p.skinDepth !== undefined).map((p) => `${p.id}=${p.skinDepth}`).join(' ')}`);
