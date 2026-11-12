import { at, last } from '../math/arr';
import { add, cross, dot, length, lerp, normalize, scale, sub, type Vec3 } from '../math/vec';

/**
 * Geometria de fuso muscular (tubo de raio variável ao longo de uma curva suave).
 * Pura: escreve em buffers pré-alocados para poder ser atualizada a cada quadro
 * sem gerar lixo para o coletor.
 */

export interface SpindleLayout {
  /** Anéis ao longo do comprimento. */
  readonly rings: number;
  /** Vértices por anel. */
  readonly sides: number;
}

export const vertexCount = (l: SpindleLayout) => l.rings * (l.sides + 1);

/** Índices dos triângulos (estáticos para um layout). */
export function spindleIndices(l: SpindleLayout): Uint16Array | Uint32Array {
  const n = (l.rings - 1) * l.sides * 6;
  const idx = vertexCount(l) > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  let o = 0;
  const row = l.sides + 1;
  for (let r = 0; r < l.rings - 1; r++) {
    for (let s = 0; s < l.sides; s++) {
      const a = r * row + s;
      const b = a + row;
      // (volta × tangente) aponta para fora: anti-horário visto de fora.
      idx.set([a, a + 1, b, a + 1, b + 1, b], o);
      o += 6;
    }
  }
  return idx;
}

/** UV estático: u = volta (0..1), v = ao longo (0..1). */
export function spindleUVs(l: SpindleLayout): Float32Array {
  const uv = new Float32Array(vertexCount(l) * 2);
  let o = 0;
  for (let r = 0; r < l.rings; r++) {
    for (let s = 0; s <= l.sides; s++) {
      uv[o++] = s / l.sides;
      uv[o++] = r / (l.rings - 1);
    }
  }
  return uv;
}

/** Ponto de Catmull-Rom centrípeta no trecho p1→p2, f ∈ [0,1). */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, f: number): Vec3 {
  const t0 = 0;
  const t1 = t0 + Math.sqrt(Math.max(1e-9, length(sub(p1, p0))));
  const t2 = t1 + Math.sqrt(Math.max(1e-9, length(sub(p2, p1))));
  const t3 = t2 + Math.sqrt(Math.max(1e-9, length(sub(p3, p2))));
  const t = t1 + (t2 - t1) * f;
  const A1 = add(scale(p0, (t1 - t) / (t1 - t0)), scale(p1, (t - t0) / (t1 - t0)));
  const A2 = add(scale(p1, (t2 - t) / (t2 - t1)), scale(p2, (t - t1) / (t2 - t1)));
  const A3 = add(scale(p2, (t3 - t) / (t3 - t2)), scale(p3, (t - t2) / (t3 - t2)));
  const B1 = add(scale(A1, (t2 - t) / (t2 - t0)), scale(A2, (t - t0) / (t2 - t0)));
  const B2 = add(scale(A2, (t3 - t) / (t3 - t1)), scale(A3, (t - t1) / (t3 - t1)));
  return add(scale(B1, (t2 - t) / (t2 - t1)), scale(B2, (t - t1) / (t2 - t1)));
}

/** Catmull-Rom centrípeta pelos pontos de controle, reamostrada por comprimento de arco. */
export function sampleCurve(ctrl: readonly Vec3[], count: number): Vec3[] {
  if (ctrl.length < 2) throw new Error('Curva precisa de 2+ pontos');
  const n = ctrl.length;
  // Pontas fantasmas por reflexão.
  const P = (i: number): Vec3 => {
    if (i < 0) return sub(scale(at(ctrl, 0), 2), at(ctrl, 1));
    if (i >= n) return sub(scale(at(ctrl, n - 1), 2), at(ctrl, n - 2));
    return at(ctrl, i);
  };
  const SUB = 12;
  const dense: Vec3[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < SUB; j++) dense.push(catmullRom(P(i - 1), P(i), P(i + 1), P(i + 2), j / SUB));
  }
  dense.push(last(ctrl));

  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i++) cum.push(at(cum, i - 1) + length(sub(at(dense, i), at(dense, i - 1))));
  const total = last(cum);
  const out: Vec3[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (j < cum.length - 2 && at(cum, j + 1) < target) j++;
    const c0 = at(cum, j);
    const seg = at(cum, j + 1) - c0;
    out.push(lerp(at(dense, j), at(dense, j + 1), seg > 1e-12 ? (target - c0) / seg : 0));
  }
  return out;
}

/**
 * Perfil de raio: tendão fino nas pontas, ventre em seno achatado.
 * s ∈ [0,1] ao longo do comprimento.
 */
export function radiusProfile(s: number, belly: number, tendon: readonly [number, number]): number {
  const rt = belly * 0.16;
  const a = tendon[0];
  const b = 1 - tendon[1];
  // Fecha as pontas suavemente para não ficar "tubo cortado".
  const cap = Math.min(1, s / 0.02, (1 - s) / 0.02);
  if (s <= a || s >= b) return rt * Math.max(0.35, cap);
  const u = (s - a) / (b - a);
  return rt + (belly - rt) * Math.pow(Math.sin(Math.PI * u), 0.7);
}

/**
 * Seção achatada (músculo largo e fino: peitoral, latíssimo, glúteo…).
 * `face` = para onde a face larga aponta (mundo, unitário ou não). Elipse com semieixos
 * raio×thickness ao longo de `face` e raio×width no outro sentido.
 */
export interface SpindleFlat {
  readonly face: Vec3;
  readonly width: number;
  readonly thickness: number;
}

/**
 * Escreve posições e normais do fuso para os pontos de controle dados.
 * Frames por transporte paralelo (sem torção brusca). Com `flat`, cada anel é orientado
 * pela projeção de `face` no plano do anel (cai no transporte se a face for quase tangente).
 */
export function writeSpindle(
  l: SpindleLayout,
  ctrl: readonly Vec3[],
  belly: number,
  tendon: readonly [number, number],
  positions: Float32Array,
  normals: Float32Array,
  flat?: SpindleFlat | null,
): void {
  const pts = sampleCurve(ctrl, l.rings);
  const R = pts.length;
  const tangent = (i: number) => normalize(sub(at(pts, Math.min(i + 1, R - 1)), at(pts, Math.max(i - 1, 0))));
  const t0 = tangent(0);
  const helper: Vec3 = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let n = normalize(cross(cross(t0, helper), t0));
  const ax = flat ? flat.thickness : 1; // ao longo de n (face)
  const bx = flat ? flat.width : 1; // ao longo de bn
  let o = 0;
  for (let r = 0; r < R; r++) {
    const t = tangent(r);
    // Transporte paralelo: projeta a normal anterior no plano perpendicular à nova tangente.
    if (r > 0) n = normalize(sub(n, scale(t, dot(n, t))));
    if (flat) {
      const f = sub(flat.face, scale(t, dot(flat.face, t)));
      if (length(f) > 0.2 * length(flat.face)) {
        const nf = normalize(f);
        // Mantém o sentido para não girar a costura (u da textura) entre anéis.
        n = dot(nf, n) < 0 ? scale(nf, -1) : nf;
      }
    }
    const bn = cross(t, n);
    const rad = radiusProfile(r / (R - 1), belly, tendon);
    const c = at(pts, r);
    for (let k = 0; k <= l.sides; k++) {
      const ang = (k / l.sides) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      positions[o] = c[0] + (n[0] * ca * ax + bn[0] * sa * bx) * rad;
      positions[o + 1] = c[1] + (n[1] * ca * ax + bn[1] * sa * bx) * rad;
      positions[o + 2] = c[2] + (n[2] * ca * ax + bn[2] * sa * bx) * rad;
      // Normal da elipse: gradiente (cos/a, sin/b).
      const gx = n[0] * (ca / ax) + bn[0] * (sa / bx), gy = n[1] * (ca / ax) + bn[1] * (sa / bx), gz = n[2] * (ca / ax) + bn[2] * (sa / bx);
      const gl = Math.hypot(gx, gy, gz) || 1;
      normals[o] = gx / gl;
      normals[o + 1] = gy / gl;
      normals[o + 2] = gz / gl;
      o += 3;
    }
  }
}
