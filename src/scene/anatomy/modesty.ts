/**
 * Sem genitália no modelo. A pele do Z-Anatomy é uma malha só (a região urogenital vem fundida nela), então a região
 * é alisada na leitura do pacote: os vértices dentro dela viram uma membrana (Laplace com a borda fixa), que fecha a
 * virilha como um manequim, sem buraco. A malha é o lado direito + linha média (o esquerdo sai por espelho em X):
 * na linha média o vizinho espelhado entra na média e x fica em 0, para a cópia continuar encostando.
 */

/** Caixa da região, no referencial do pacote (m): lado direito tem x ≤ 0; z = anterior. */
export const UROGENITAL = { xMin: -0.048, yMin: 0.69, yMax: 0.868, zMin: 0.012 } as const;

const ITERATIONS = 500;

interface SkinLike {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly joints: Uint8Array;
  readonly weights: Float32Array;
}

/** Alisa a região no lugar. `excludeJoints`: vértices dominados por essas juntas (a mão passa perto) ficam como estão. */
export function smoothUrogenital(skin: SkinLike, excludeJoints: ReadonlySet<number>): number {
  const P = skin.positions;
  const n = P.length / 3;
  const R = UROGENITAL;
  const inside = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3] ?? 0, y = P[i * 3 + 1] ?? 0, z = P[i * 3 + 2] ?? 0;
    if (x < R.xMin || x > 1e-4 || y < R.yMin || y > R.yMax || z < R.zMin) continue;
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = skin.weights[i * 4 + k] ?? 0;
      if (w > bw) {
        bw = w;
        best = skin.joints[i * 4 + k] ?? 0;
      }
    }
    if (excludeJoints.has(best)) continue;
    inside[i] = 1;
    count++;
  }
  if (count === 0) return 0;

  // A região urogenital é um objeto à parte dentro da pele (não soldado ao tronco): a borda aberta dele fica presa,
  // senão a membrana inteira colapsa num ponto e abre buraco. A linha média também é borda aberta (o espelho
  // completa), mas ela pode se mover em y e z.
  const edgeUse = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  const I0 = skin.indices;
  for (let t = 0; t < I0.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = key(I0[t + e] ?? 0, I0[t + ((e + 1) % 3)] ?? 0);
      edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
    }
  }
  for (const [k, c] of edgeUse) {
    if (c !== 1) continue;
    for (const v of [Math.floor(k / n), k % n]) {
      if (inside[v] && Math.abs(P[v * 3] ?? 0) > 1e-4) {
        inside[v] = 0;
        count--;
      }
    }
  }

  // Vizinhança só dos vértices da região.
  const nb = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (inside[a]) {
      let s = nb.get(a);
      if (!s) nb.set(a, (s = new Set()));
      s.add(b);
    }
  };
  const I = skin.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] ?? 0, b = I[t + 1] ?? 0, c = I[t + 2] ?? 0;
    for (const [u, v] of [[a, b], [a, c], [b, a], [b, c], [c, a], [c, b]] as const) link(u, v);
  }
  const list = [...nb.keys()];
  const next = new Float32Array(list.length * 3);
  for (let it = 0; it < ITERATIONS; it++) {
    list.forEach((v, j) => {
      const s = nb.get(v);
      if (!s) return;
      const mid = Math.abs(P[v * 3] ?? 0) < 1e-4;
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (const u of s) {
        const ux = P[u * 3] ?? 0;
        sx += ux;
        sy += P[u * 3 + 1] ?? 0;
        sz += P[u * 3 + 2] ?? 0;
        m++;
        // Linha média: o vizinho espelhado também conta (x se anula).
        if (mid && Math.abs(ux) > 1e-4) {
          sx -= ux;
          sy += P[u * 3 + 1] ?? 0;
          sz += P[u * 3 + 2] ?? 0;
          m++;
        }
      }
      next[j * 3] = mid ? 0 : sx / m;
      next[j * 3 + 1] = sy / m;
      next[j * 3 + 2] = sz / m;
    });
    list.forEach((v, j) => {
      P[v * 3] = next[j * 3] ?? 0;
      P[v * 3 + 1] = next[j * 3 + 1] ?? 0;
      P[v * 3 + 2] = next[j * 3 + 2] ?? 0;
    });
  }
  // O tubo colapsado deixa triângulos com a face para dentro (a pele só desenha a frente: viraria buraco). Vira para fora:
  // "fora" = longe de um eixo atrás do púbis.
  const I2 = skin.indices;
  for (let t = 0; t < I2.length; t += 3) {
    const a = I2[t] ?? 0, b = I2[t + 1] ?? 0, c = I2[t + 2] ?? 0;
    if (!inside[a] && !inside[b] && !inside[c]) continue;
    const ax = P[a * 3] ?? 0, ay = P[a * 3 + 1] ?? 0, az = P[a * 3 + 2] ?? 0;
    const ux = (P[b * 3] ?? 0) - ax, uy = (P[b * 3 + 1] ?? 0) - ay, uz = (P[b * 3 + 2] ?? 0) - az;
    const vx = (P[c * 3] ?? 0) - ax, vy = (P[c * 3 + 1] ?? 0) - ay, vz = (P[c * 3 + 2] ?? 0) - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ox = ax, oy = ay - 0.86, oz = az + 0.03;
    if (nx * ox + ny * oy + nz * oz < 0) {
      I2[t + 1] = c;
      I2[t + 2] = b;
    }
  }
  return count;
}
