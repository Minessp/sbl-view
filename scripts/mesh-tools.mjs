/**
 * Operações de malha do pipeline anatômico (scripts/anatomy-pack.mjs): solda, frestas, bordas, buracos, normais.
 * Malha = { pos: Float32Array (x, y, z), idx: Uint32Array (triângulos) }. Sem dependência de three.
 */

const PAIR = 4294967296;
const edgeKey = (a, b) => (a < b ? a * PAIR + b : b * PAIR + a);

/** Solda vértices a menos de 0,02 mm e remove triângulos degenerados e repetidos. */
export function weld({ pos, idx }) {
  const key = new Map();
  const out = [];
  const remap = new Uint32Array(pos.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const k = `${Math.round(pos[i * 3] * 5e4)},${Math.round(pos[i * 3 + 1] * 5e4)},${Math.round(pos[i * 3 + 2] * 5e4)}`;
    let j = key.get(k);
    if (j === undefined) {
      j = out.length / 3;
      key.set(k, j);
      out.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
    remap[i] = j;
  }
  const tri = [];
  const seen = new Set();
  for (let i = 0; i < idx.length; i += 3) {
    const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]];
    if (a === b || b === c || a === c) continue;
    const s = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(s)) continue;
    seen.add(s);
    tri.push(a, b, c);
  }
  return { pos: new Float32Array(out), idx: new Uint32Array(tri) };
}

/** Quantos triângulos usam cada aresta (chave = par ordenado). */
export function edgeUse(idx) {
  const count = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(idx[t + e], idx[t + ((e + 1) % 3)]);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  return count;
}

/**
 * Arestas de borda (1 triângulo) e não-variedade (3 ou m+). `onSeam(v)`: vértice na linha média (borda permitida,
 * a cópia espelhada fecha). Devolve as arestas de borda fora da costura.
 */
export function edgeCensus({ pos, idx }, onSeam = () => false) {
  const border = [];
  let seam = 0, nonManifold = 0;
  for (const [k, c] of edgeUse(idx)) {
    if (c > 2) nonManifold++;
    if (c !== 1) continue;
    const a = Math.floor(k / PAIR), b = k % PAIR;
    if (onSeam(a, pos) && onSeam(b, pos)) seam++;
    else border.push([a, b]);
  }
  return { border, seam, nonManifold };
}

/** Bordas orientadas (como aparecem no triângulo) agrupadas em laços. Laço = lista de vértices em ordem. */
export function boundaryLoops({ idx }, onSeam = () => false, pos) {
  const use = edgeUse(idx);
  const next = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + ((e + 1) % 3)];
      if (use.get(edgeKey(a, b)) !== 1) continue;
      if (pos && onSeam(a, pos) && onSeam(b, pos)) continue;
      // Borda do triângulo vai a → b; o laço do buraco anda ao contrário (b → a) para o tampo sair com a mesma orientação.
      if (!next.has(b)) next.set(b, []);
      next.get(b).push(a);
    }
  }
  const loops = [];
  const used = new Set();
  for (const start of next.keys()) {
    for (const first of next.get(start)) {
      const k0 = `${start}>${first}`;
      if (used.has(k0)) continue;
      const loop = [start];
      let cur = start, nx = first, ok = true;
      used.add(k0);
      while (nx !== start) {
        loop.push(nx);
        const cand = (next.get(nx) ?? []).filter((v) => !used.has(`${nx}>${v}`));
        if (cand.length === 0) {
          ok = false;
          break;
        }
        cur = nx;
        nx = cand[0];
        used.add(`${cur}>${nx}`);
        if (loop.length > 1e5) {
          ok = false;
          break;
        }
      }
      loops.push({ verts: loop, closed: ok });
    }
  }
  return loops;
}

/** Centro e perímetro de um laço. */
export function loopStats(pos, loop) {
  const c = [0, 0, 0];
  let len = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i] * 3, b = loop[(i + 1) % loop.length] * 3;
    for (let k = 0; k < 3; k++) c[k] += pos[a + k] / loop.length;
    len += Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
  }
  return { center: c, perimeter: len };
}

/**
 * Fecha frestas entre retalhos (a pele vem em regiões): vértices de borda a menos de `tol` viram um só.
 * Bordas na linha média ficam (a cópia espelhada fecha).
 */
export function closeCracks({ pos, idx }, tol) {
  const count = edgeUse(idx);
  const border = new Set();
  for (const [k, c] of count) {
    if (c !== 1) continue;
    const a = Math.floor(k / PAIR), b = k % PAIR;
    for (const v of [a, b]) if (Math.abs(pos[v * 3]) > 5e-4) border.add(v);
  }
  const parent = new Uint32Array(pos.length / 3).map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cell = new Map();
  const key = (x, y, z) => `${Math.floor(x / tol)},${Math.floor(y / tol)},${Math.floor(z / tol)}`;
  for (const v of border) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          for (const u of cell.get(key(x + dx * tol, y + dy * tol, z + dz * tol)) ?? []) {
            if (Math.hypot(pos[u * 3] - x, pos[u * 3 + 1] - y, pos[u * 3 + 2] - z) < tol) parent[find(v)] = find(u);
          }
        }
    const k = key(x, y, z);
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push(v);
  }
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = find(idx[i]);
  return weld({ pos, idx: out });
}

/**
 * Junções em T: dois retalhos encostam na mesma linha com subdivisões diferentes (mão e dedos, pé e dedos, orelha).
 * Fecha partindo o triângulo da aresta de borda longa em cada vértice de borda que cai sobre ela (a menos de `tol`).
 */
export function fixTJunctions({ pos, idx }, tol, onSeam = () => false) {
  let tri = Array.from(idx);
  for (let pass = 0; pass < 20; pass++) {
    const use = edgeUse(tri);
    const borderV = new Set();
    const borderE = [];
    for (let t = 0; t < tri.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = tri[t + e], b = tri[t + ((e + 1) % 3)];
        if (use.get(edgeKey(a, b)) !== 1 || (onSeam(a, pos) && onSeam(b, pos))) continue;
        borderV.add(a);
        borderV.add(b);
        borderE.push([t, e]);
      }
    }
    const cell = new Map();
    const h = 0.01;
    const ck = (x, y, z) => `${Math.floor(x / h)},${Math.floor(y / h)},${Math.floor(z / h)}`;
    for (const v of borderV) {
      const k = ck(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k).push(v);
    }
    const splits = new Map();
    for (const [t, e] of borderE) {
      const a = tri[t + e], b = tri[t + ((e + 1) % 3)];
      const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], B = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
      const D = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const L2 = D[0] ** 2 + D[1] ** 2 + D[2] ** 2;
      const lo = A.map((x, i) => Math.min(x, B[i]) - tol), hi = A.map((x, i) => Math.max(x, B[i]) + tol);
      const on = [];
      for (let x = Math.floor(lo[0] / h); x <= Math.floor(hi[0] / h); x++)
        for (let y = Math.floor(lo[1] / h); y <= Math.floor(hi[1] / h); y++)
          for (let z = Math.floor(lo[2] / h); z <= Math.floor(hi[2] / h); z++)
            for (const v of cell.get(`${x},${y},${z}`) ?? []) {
              if (v === a || v === b) continue;
              const P = [pos[v * 3] - A[0], pos[v * 3 + 1] - A[1], pos[v * 3 + 2] - A[2]];
              const s = (P[0] * D[0] + P[1] * D[1] + P[2] * D[2]) / L2;
              if (s <= 1e-3 || s >= 1 - 1e-3) continue;
              const d = Math.hypot(P[0] - s * D[0], P[1] - s * D[1], P[2] - s * D[2]);
              if (d < tol) on.push([s, v]);
            }
      if (on.length) splits.set(t / 3, { e, on: on.sort((p, q) => p[0] - q[0]).map((p) => p[1]) });
    }
    if (splits.size === 0) break;
    const out = [];
    for (let t = 0; t < tri.length; t += 3) {
      const sp = splits.get(t / 3);
      if (!sp) {
        out.push(tri[t], tri[t + 1], tri[t + 2]);
        continue;
      }
      // Leque a partir do vértice oposto à aresta partida: a → v1 → … → b.
      const a = tri[t + sp.e], b = tri[t + ((sp.e + 1) % 3)], c = tri[t + ((sp.e + 2) % 3)];
      const chain = [a, ...sp.on, b];
      for (let i = 0; i + 1 < chain.length; i++) out.push(chain[i], chain[i + 1], c);
    }
    tri = out;
  }
  return weld({ pos, idx: new Uint32Array(tri) });
}

/** Laços de borda fora da costura, já na orientação do tampo. Cadeia aberta = começa e termina na costura. */
function holeChains(pos, idx, onSeam) {
  const use = edgeUse(idx);
  const next = new Map();
  const indeg = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + ((e + 1) % 3)];
      if (use.get(edgeKey(a, b)) !== 1 || (onSeam(a, pos) && onSeam(b, pos))) continue;
      if (!next.has(b)) next.set(b, []);
      next.get(b).push(a);
      indeg.set(a, (indeg.get(a) ?? 0) + 1);
    }
  }
  const take = (v) => {
    const l = next.get(v);
    if (!l || l.length === 0) return -1;
    return l.shift();
  };
  const chains = [];
  const walk = (start, open) => {
    const verts = [start];
    let v = take(start);
    while (v >= 0 && v !== start && verts.length < 1e5) {
      verts.push(v);
      v = take(v);
    }
    chains.push({ verts, open: open || v !== start });
  };
  for (const v of [...next.keys()]) if (!indeg.get(v)) while ((next.get(v) ?? []).length) walk(v, true);
  for (const v of [...next.keys()]) while ((next.get(v) ?? []).length) walk(v, false);
  // Laço que passa duas vezes pelo mesmo vértice (gravata-borboleta) vira dois laços simples.
  const out = [];
  for (const ch of chains) {
    if (ch.open) {
      out.push(ch);
      continue;
    }
    const stack = [];
    const where = new Map();
    for (const v of ch.verts) {
      if (where.has(v)) {
        const i = where.get(v);
        const loop = stack.splice(i + 1);
        for (const u of loop) where.delete(u);
        out.push({ verts: [v, ...loop], open: false });
      } else {
        where.set(v, stack.length);
        stack.push(v);
      }
    }
    out.push({ verts: stack, open: false });
  }
  return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Triangulação de área mínima de um polígono 3D (programação dinâmica, Liepa 2003): sempre cobre o laço inteiro, sem
 * projetar num plano (laços tortos da orelha). Triângulo (i, m, j) com i < m < j segue a orientação do laço.
 * `taken(i, j)`: corda proibida.
 */
function minAreaTriangulation(pts, taken = () => false) {
  const n = pts.length;
  const W = Array.from({ length: n }, () => new Float64Array(n));
  const O = Array.from({ length: n }, () => new Int32Array(n).fill(-1));
  const area = (i, m, j) => len(cross(sub(pts[m], pts[i]), sub(pts[j], pts[i]))) / 2;
  for (let gap = 2; gap < n; gap++)
    for (let i = 0; i + gap < n; i++) {
      const j = i + gap;
      let best = Infinity;
      // Corda que já é aresta da malha deixaria a aresta com três triângulos.
      if (gap < n - 1 && taken(i, j)) {
        W[i][j] = Infinity;
        continue;
      }
      for (let m = i + 1; m < j; m++) {
        const w = W[i][m] + W[m][j] + area(i, m, j);
        if (w < best) (best = w), (O[i][j] = m);
      }
      W[i][j] = best;
    }
  if (W[0][n - 1] === Infinity) return null;
  const out = [];
  const rec = (i, j) => {
    if (j - i < 2) return;
    const m = O[i][j];
    out.push([i, m, j]);
    rec(i, m);
    rec(m, j);
  };
  rec(0, n - 1);
  return out;
}

/**
 * Tampa os buracos da malha: cada laço é triangulado (área mínima), as arestas internas longas são partidas
 * até o tamanho das da borda, e os vértices novos assentam por suavização bi-laplaciana (curvatura contínua com o
 * entorno, sem o achatado de uma membrana). Cadeia que começa e termina na costura (linha média) fecha com vértices
 * novos em x = 0, livres em y e z, cuja vizinhança inclui o espelho: a cópia espelhada continua encostando.
 */
export function fillHoles({ pos, idx }, { onSeam, iterations = 3000 }) {
  const P = Array.from(pos);
  const tri = Array.from(idx);
  const at = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const add = (p) => (P.push(p[0], p[1], p[2]), P.length / 3 - 1);
  const free = new Set();
  const seamFree = new Set();
  const report = [];
  const existing = new Set(edgeUse(idx).keys());
  for (const ch of holeChains(pos, idx, onSeam)) {
    const poly = ch.verts.slice();
    if (poly.length < 3 && !ch.open) continue;
    let h = 0;
    for (let i = 0; i + 1 < poly.length; i++) h += len(sub(at(poly[i]), at(poly[i + 1]))) / (poly.length - 1);
    if (ch.open) {
      const a = poly[0], b = poly[poly.length - 1];
      if (!onSeam(a, pos) || !onSeam(b, pos)) throw new Error(`borda aberta fora da costura perto de (${at(a).map((x) => x.toFixed(3))})`);
      const A = at(a), B = at(b);
      const m = Math.max(1, Math.round(len(sub(A, B)) / h));
      for (let k = 1; k < m; k++) {
        const s = k / m;
        const v = add([0, B[1] + (A[1] - B[1]) * s, B[2] + (A[2] - B[2]) * s]);
        free.add(v);
        seamFree.add(v);
        poly.push(v);
      }
    }
    let faces = minAreaTriangulation(poly.map(at), (i, j) => existing.has(edgeKey(poly[i], poly[j])));
    faces ??= minAreaTriangulation(poly.map(at));
    let local = faces.map(([i, j, k]) => [poly[i], poly[j], poly[k]]);
    const c = [0, 0, 0];
    for (const v of poly) for (let k = 0; k < 3; k++) c[k] += at(v)[k] / poly.length;
    // Parte a aresta interna mais longa até todas ficarem ≤ 1,4 h. Aresta da borda original nunca se parte.
    const boundary = new Set();
    for (let i = 0; i < ch.verts.length - (ch.open ? 1 : 0); i++) boundary.add(edgeKey(ch.verts[i], ch.verts[(i + 1) % ch.verts.length]));
    const seamV = (v) => seamFree.has(v) || (v < pos.length / 3 && onSeam(v, pos));
    const patch = poly.slice();
    for (let guard = 0; guard < 60 * poly.length; guard++) {
      let best = 0, ba = -1, bb = -1;
      for (const f of local)
        for (let e = 0; e < 3; e++) {
          const a = f[e], b = f[(e + 1) % 3];
          if (boundary.has(edgeKey(a, b))) continue;
          const l = len(sub(at(a), at(b)));
          if (l > best) (best = l), (ba = a), (bb = b);
        }
      if (best <= 1.4 * h) break;
      const onS = ch.open && seamV(ba) && seamV(bb);
      const A = at(ba), B = at(bb);
      const mid = [onS ? 0 : (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
      // Laço muito torto: a bissecção pode ciclar entre duas diagonais, com os pontos novos amontoados. Congela a aresta.
      if (patch.some((q) => len(sub(at(q), mid)) < 0.35 * h)) {
        boundary.add(edgeKey(ba, bb));
        continue;
      }
      const v = add(mid);
      patch.push(v);
      free.add(v);
      if (onS) seamFree.add(v);
      const k0 = edgeKey(ba, bb);
      const out = [];
      for (const f of local) {
        const e = [0, 1, 2].find((k) => edgeKey(f[k], f[(k + 1) % 3]) === k0);
        if (e === undefined) {
          out.push(f);
          continue;
        }
        const a = f[e], b = f[(e + 1) % 3], o = f[(e + 2) % 3];
        out.push([a, v, o], [v, b, o]);
      }
      local = out;
    }
    for (const f of local) tri.push(...f);
    report.push({ n: ch.verts.length, open: ch.open, center: c, added: local.length });
  }

  // Suavização: membrana primeiro (assenta perto), depois bi-laplaciana (Kobbelt: x ← x − U²(x)/ν).
  // Vértice da costura: os vizinhos fora dela entram também espelhados, então x fica em 0 sem vinco.
  const nb = Array.from({ length: P.length / 3 }, () => new Set());
  for (let t = 0; t < tri.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = tri[t + e], b = tri[t + ((e + 1) % 3)];
      nb[a].add(b);
      nb[b].add(a);
    }
  const isSeam = (v) => seamFree.has(v) || (v < pos.length / 3 && onSeam(v, pos));
  const need = new Set(free);
  for (const v of free) for (const j of nb[v]) need.add(j);
  const rings = new Map();
  for (const v of need) {
    const r = [];
    for (const j of nb[v]) {
      r.push([j, 1]);
      if (isSeam(v) && !isSeam(j)) r.push([j, -1]);
    }
    rings.set(v, r);
  }
  const umbrella = (v) => {
    const r = rings.get(v);
    let x = 0, y = 0, z = 0;
    for (const [j, sx] of r) (x += sx * P[j * 3]), (y += P[j * 3 + 1]), (z += P[j * 3 + 2]);
    return [x / r.length - P[v * 3], y / r.length - P[v * 3 + 1], z / r.length - P[v * 3 + 2]];
  };
  const order = [...free];
  for (let it = 0; it < iterations; it++) {
    const membrane = it < iterations / 4;
    const U = new Map();
    for (const v of need) U.set(v, umbrella(v));
    for (const v of order) {
      let d = U.get(v);
      if (!membrane) {
        const r = rings.get(v);
        let x = 0, y = 0, z = 0, nu = 0;
        for (const [j, sx] of r) {
          const uj = U.get(j);
          x += sx * uj[0];
          y += uj[1];
          z += uj[2];
          nu += 1 / rings.get(j).length;
        }
        nu = 1 + nu / r.length;
        d = [-(x / r.length - d[0]) / nu, -(y / r.length - d[1]) / nu, -(z / r.length - d[2]) / nu];
      }
      P[v * 3] += 0.5 * d[0];
      P[v * 3 + 1] += 0.5 * d[1];
      P[v * 3 + 2] += 0.5 * d[2];
      if (seamFree.has(v) || P[v * 3] > 0) P[v * 3] = 0;
    }
  }
  return { mesh: { pos: new Float32Array(P), idx: new Uint32Array(tri) }, report };
}

/** Orientação coerente: toda aresta interna aparece uma vez em cada sentido. Devolve quantas se repetem no mesmo sentido. */
export function orientationErrors(idx) {
  const dir = new Map();
  for (let t = 0; t < idx.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const k = idx[t + e] * PAIR + idx[t + ((e + 1) % 3)];
      dir.set(k, (dir.get(k) ?? 0) + 1);
    }
  let bad = 0;
  for (const c of dir.values()) if (c > 1) bad += c - 1;
  return bad;
}

/**
 * Abas dobradas (orelha, ponta dos dedos do pé): dois triângulos percorrem a mesma aresta no mesmo sentido. Sai, de cada
 * par, o que mais discorda da normal média dos vizinhos; o buraco que fica é tampado por `fillHoles`.
 */
export function dropFolds({ pos, idx }) {
  let tri = Array.from(idx);
  let removed = 0;
  for (let pass = 0; pass < 10; pass++) {
    const T = tri.length / 3;
    const dir = new Map();
    const byEdge = new Map();
    const normal = [];
    for (let t = 0; t < T; t++) {
      const [a, b, c] = [tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]];
      const p = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      normal.push(norm(cross(sub(p(b), p(a)), sub(p(c), p(a)))));
      for (let e = 0; e < 3; e++) {
        const u = tri[t * 3 + e], v = tri[t * 3 + ((e + 1) % 3)];
        const k = u * PAIR + v;
        if (!dir.has(k)) dir.set(k, []);
        dir.get(k).push(t);
        const ku = edgeKey(u, v);
        if (!byEdge.has(ku)) byEdge.set(ku, []);
        byEdge.get(ku).push(t);
      }
    }
    const drop = new Set();
    for (const list of dir.values()) {
      if (list.length < 2) continue;
      let worst = -1, score = Infinity;
      for (const t of list) {
        const avg = [0, 0, 0];
        for (let e = 0; e < 3; e++)
          for (const o of byEdge.get(edgeKey(tri[t * 3 + e], tri[t * 3 + ((e + 1) % 3)]))) if (o !== t) for (let k = 0; k < 3; k++) avg[k] += normal[o][k];
        const s = dot(normal[t], norm(avg));
        if (s < score) (score = s), (worst = t);
      }
      drop.add(worst);
    }
    if (drop.size === 0) break;
    removed += drop.size;
    tri = tri.filter((_, i) => !drop.has(Math.floor(i / 3)));
  }
  // Triângulos soltos depois do corte (presos só por um vértice) também saem.
  return { mesh: { pos, idx: new Uint32Array(tri) }, removed };
}

/**
 * Aresta usada por 3 ou mais triângulos (aba na entrada do canal auditivo, camada dupla na ponta de um dedo do pé):
 * saem todos os triângulos dela, e depois as ilhas com menos de `minIsland` triângulos. O buraco fica para `fillHoles`.
 */
export function dropNonManifold({ pos, idx }, minIsland = 30) {
  let tri = Array.from(idx);
  let removed = 0;
  for (let pass = 0; pass < 10; pass++) {
    const use = edgeUse(tri);
    const drop = [];
    for (let t = 0; t < tri.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        if (use.get(edgeKey(tri[t + e], tri[t + ((e + 1) % 3)])) > 2) {
          drop.push(t);
          break;
        }
      }
    }
    if (drop.length === 0) break;
    removed += drop.length;
    const set = new Set(drop);
    tri = tri.filter((_, i) => !set.has(i - (i % 3)));
  }
  // Ilhas: componentes ligados por aresta.
  const T = tri.length / 3;
  const byEdge = new Map();
  for (let t = 0; t < T; t++)
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(tri[t * 3 + e], tri[t * 3 + ((e + 1) % 3)]);
      if (!byEdge.has(k)) byEdge.set(k, []);
      byEdge.get(k).push(t);
    }
  const comp = new Int32Array(T).fill(-1);
  const sizes = [];
  for (let s = 0; s < T; s++) {
    if (comp[s] >= 0) continue;
    const id = sizes.length;
    const q = [s];
    comp[s] = id;
    for (let i = 0; i < q.length; i++) {
      const t = q[i];
      for (let e = 0; e < 3; e++)
        for (const o of byEdge.get(edgeKey(tri[t * 3 + e], tri[t * 3 + ((e + 1) % 3)]))) if (comp[o] < 0) (comp[o] = id), q.push(o);
    }
    sizes.push(q.length);
  }
  const out = [];
  for (let t = 0; t < T; t++) {
    if (sizes[comp[t]] < minIsland) {
      removed++;
      continue;
    }
    out.push(tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]);
  }
  return { mesh: { pos, idx: new Uint32Array(out) }, removed, islands: sizes.filter((n) => n < minIsland).length };
}
