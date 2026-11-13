/**
 * Converte o BodyParts3D 4.0 (OBJ, mm, Z para cima) no pacote binário do Atlas anatômico.
 * Roda à mão, uma vez por mudança de mapeamento; o resultado vai versionado em public/models/.
 *
 *   node scripts/bp3d.mjs <pasta com os .obj e as listas *_element_parts.txt> [saída]
 *
 * Baixe isa_BP3D_4.0_obj_99.zip, partof_BP3D_4.0_obj_99.zip, isa_element_parts.txt e
 * partof_element_parts.txt de https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
 * e extraia tudo numa pasta vazia. O mapeamento músculo → conceito FMA está em src/data/bodyparts3d.json.
 *
 * Formato: SBL4 (scripts/sbl4.mjs). Sistema do SBL View: Y para cima, Z anterior,
 * X para a esquerda do sujeito, estatura 1,75 m, pés em y = 0.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { packSBL4 } from './sbl4.mjs';

const [dir, out = 'public/models/bp3d.bin'] = process.argv.slice(2);
if (!dir) {
  console.error('uso: node scripts/bp3d.mjs <pasta> [saída]');
  process.exit(1);
}
const map = JSON.parse(readFileSync(new URL('../src/data/bodyparts3d.json', import.meta.url), 'utf8'));
const STATURE = 1.75;
/** Elemento com centro além disto (mm, +X = esquerda) é do lado esquerdo e fica de fora. */
const MID_MM = 15;

// --- Listas: conceito FMA → arquivos de elemento -------------------------------------------
const concept = new Map();
for (const f of ['isa_element_parts.txt', 'partof_element_parts.txt']) {
  const text = readFileSync(join(dir, f), 'utf8');
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [id, , fj] = line.split('\t');
    if (!id || !fj) continue;
    if (!concept.has(id)) concept.set(id, new Set());
    concept.get(id).add(fj.trim());
  }
}
const elementsOf = (ids) => [...new Set(ids.flatMap((id) => [...(concept.get(id) ?? [])]))];

const objPath = new Map();
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.obj')) objPath.set(basename(f, '.obj'), p);
  }
})(dir);

// --- OBJ ----------------------------------------------------------------------------------
function readObj(fj) {
  const p = objPath.get(fj);
  if (!p) throw new Error(`arquivo ${fj}.obj não encontrado`);
  const pos = [];
  const idx = [];
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/);
      pos.push(+x, +y, +z);
    } else if (line.startsWith('f ')) {
      const vs = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1);
      for (let i = 1; i + 1 < vs.length; i++) idx.push(vs[0], vs[i], vs[i + 1]);
    }
  }
  return { pos, idx };
}

function centerX(mesh) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < mesh.pos.length; i += 3) {
    lo = Math.min(lo, mesh.pos[i]);
    hi = Math.max(hi, mesh.pos[i]);
  }
  return (lo + hi) / 2;
}

/** Junta elementos numa malha só, soldando vértices coincidentes. */
function merge(meshes) {
  const key = new Map();
  const pos = [];
  const idx = [];
  for (const m of meshes) {
    const remap = new Uint32Array(m.pos.length / 3);
    for (let i = 0; i < remap.length; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
      const k = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
      let j = key.get(k);
      if (j === undefined) {
        j = pos.length / 3;
        key.set(k, j);
        pos.push(x, y, z);
      }
      remap[i] = j;
    }
    for (const v of m.idx) idx.push(remap[v]);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

/** Simplifica até `tris` triângulos (erro até 3% do tamanho da peça; se não chegar, modo "sloppy"). */
function simplify(mesh, tris) {
  const target = Math.min(mesh.idx.length, tris * 3);
  let [idx] = MeshoptSimplifier.simplify(mesh.idx, mesh.pos, 3, target, 0.03);
  if (idx.length > target * 1.3) [idx] = MeshoptSimplifier.simplifySloppy(mesh.idx, mesh.pos, 3, null, target, 0.03);
  // Compacta: só os vértices usados.
  const remap = new Int32Array(mesh.pos.length / 3).fill(-1);
  const pos = [];
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    if (remap[v] < 0) {
      remap[v] = pos.length / 3;
      pos.push(mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]);
    }
    out[i] = remap[v];
  }
  return { pos: new Float32Array(pos), idx: out };
}

// --- Partes ---------------------------------------------------------------------------------
await MeshoptSimplifier.ready;
const load = (fjs, keep = () => true) => fjs.map(readObj).filter(keep);
const rightOrMid = (m) => centerX(m) <= MID_MM;
const isRight = (m) => centerX(m) < -MID_MM;

/** Músculos grandes ou de várias peças ganham mais triângulos. */
const MUSCLE_TRIS = { erector_spinae: 3000, trapezius: 2600, external_oblique: 2400, forearm_flexors: 2400, forearm_extensors: 2000, gluteus_maximus: 2200 };
const parts = [];
for (const [muscleId, ids] of Object.entries(map.muscles)) {
  const meshes = load(elementsOf(ids));
  if (meshes.length === 0) throw new Error(`${muscleId}: nenhum elemento`);
  parts.push({ key: muscleId, kind: 'muscle', muscleId, mirror: true, mesh: merge(meshes), tris: MUSCLE_TRIS[muscleId] ?? 1800 });
}
parts.push({ key: 'context', kind: 'context', mirror: true, mesh: merge(load(elementsOf(map.context))), tris: 12000 });

const bones = load(elementsOf([map.boneClass]), rightOrMid);
parts.push({ key: 'bones_r', kind: 'bone', mirror: true, mesh: merge(bones.filter(isRight)), tris: 14000 });
parts.push({ key: 'bones_mid', kind: 'bone', mirror: false, mesh: merge(bones.filter((m) => !isRight(m))), tris: 12000 });
parts.push({ key: 'skin', kind: 'skin', mirror: false, mesh: merge(load(elementsOf([map.skin]))), tris: 7000 });

for (const p of parts) p.mesh = simplify(p.mesh, p.tris);

// --- Transformação para o sistema do SBL View ---------------------------------------------------
const skin = parts.find((p) => p.key === 'skin').mesh;
const mid = parts.find((p) => p.key === 'bones_mid').mesh;
const bounds = (pos, k) => {
  let lo = Infinity, hi = -Infinity;
  for (let i = k; i < pos.length; i += 3) {
    lo = Math.min(lo, pos[i]);
    hi = Math.max(hi, pos[i]);
  }
  return [lo, hi];
};
const [zLo, zHi] = bounds(skin.pos, 2);
const [yLo, yHi] = bounds(skin.pos, 1);
const [mxLo, mxHi] = bounds(mid.pos, 0);
const s = STATURE / (zHi - zLo);
const mx = (mxLo + mxHi) / 2;
const my = (yLo + yHi) / 2;
// (x, y, z)_BP3D → (x, z, −y): rotação própria (det = +1), mantém o sentido dos triângulos.
for (const p of parts) {
  const a = p.mesh.pos;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    a[i] = (x - mx) * s;
    a[i + 1] = (z - zLo) * s;
    a[i + 2] = -(y - my) * s;
  }
}

const lo = [Infinity, Infinity, Infinity];
const hi = [-Infinity, -Infinity, -Infinity];
for (const p of parts)
  for (let i = 0; i < p.mesh.pos.length; i++) {
    const k = i % 3;
    lo[k] = Math.min(lo[k], p.mesh.pos[i]);
    hi[k] = Math.max(hi[k], p.mesh.pos[i]);
  }
const offset = lo.map((l, k) => (l + hi[k]) / 2);
const scale = lo.map((l, k) => (hi[k] - l) / 2);

// --- Escrita (SBL4, ver scripts/sbl4.mjs) ---------------------------------------------------
const { buf, header } = await packSBL4({
  offset,
  scale,
  parts: parts.map((p) => {
    const q = new Int16Array(p.mesh.pos.length);
    for (let i = 0; i < q.length; i++) q[i] = Math.round(((p.mesh.pos[i] - offset[i % 3]) / scale[i % 3]) * 32767);
    return { key: p.key, kind: p.kind, muscleId: p.muscleId, mirror: p.mirror, q, idx: Uint32Array.from(p.mesh.idx) };
  }),
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);

let tris = 0;
for (const p of header.parts) {
  tris += p.indexCount / 3;
  console.log(`${p.key.padEnd(22)} ${String(p.indexCount / 3).padStart(6)} triângulos`);
}
console.log(`total ${tris} triângulos, ${(buf.length / 1024).toFixed(0)} KB, escala ${s.toFixed(4)}`);
