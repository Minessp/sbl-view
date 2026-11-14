/**
 * Geometria do equipamento em medida real (metros), eixo Y como eixo de giro: perfis torneados (anilha, halter, roldana,
 * rolo), estofado de canto arredondado e tubos. Tudo gerado aqui, sem modelo baixado.
 */
import { type BufferGeometry, CylinderGeometry, LatheGeometry, SphereGeometry, TorusGeometry, Vector2 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const lathe = (pts: readonly (readonly [number, number])[], segments = 48): BufferGeometry =>
  new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    segments,
  );

/**
 * Anilha de ferro fundido: furo de 50 mm, cubo cheio, alma rebaixada e aro com borda arredondada. `d` = diâmetro, `t` =
 * espessura (no eixo Y, centrada).
 */
export function plateGeometry(d: number, t: number): BufferGeometry {
  const R = d / 2;
  const h = t / 2,
    w = t * 0.3;
  const hub = Math.min(0.07, R * 0.32);
  return lathe(
    [
      [0.026, -h],
      [hub, -h],
      [hub + 0.012, -w],
      [R - 0.035, -w],
      [R - 0.026, -h],
      [R - 0.006, -h],
      [R, -h + 0.006],
      [R, h - 0.006],
      [R - 0.006, h],
      [R - 0.026, h],
      [R - 0.035, w],
      [hub + 0.012, w],
      [hub, h],
      [0.026, h],
      [0.026, -h],
    ],
    64,
  );
}

/** Cabeça de halter emborrachada: cilindro com chanfro nas duas faces. */
export function dumbbellHeadGeometry(r: number, w: number): BufferGeometry {
  const h = w / 2,
    c = Math.min(0.01, r * 0.15);
  return lathe(
    [
      [0, -h],
      [r - c, -h],
      [r, -h + c],
      [r, h - c],
      [r - c, h],
      [0, h],
    ],
    40,
  );
}

/** Roldana com canal para o cabo. */
export function sheaveGeometry(r: number, w: number): BufferGeometry {
  const h = w / 2;
  return lathe(
    [
      [0.008, -h],
      [r, -h],
      [r, -h * 0.55],
      [r - 0.009, -h * 0.15],
      [r - 0.011, 0],
      [r - 0.009, h * 0.15],
      [r, h * 0.55],
      [r, h],
      [0.008, h],
    ],
    40,
  );
}

/** Rolo de espuma de pontas arredondadas (eixo Y). */
export function rollerGeometry(r: number, len: number): BufferGeometry {
  const h = len / 2,
    c = r * 0.35;
  const pts: [number, number][] = [[0.006, -h]];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([r - c + c * Math.sin(a), -h + c - c * Math.cos(a)]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([r - c + c * Math.cos(a), h - c + c * Math.sin(a)]);
  }
  pts.push([0.006, h]);
  return lathe(pts, 36);
}

/** Estofado/peça de caixa com cantos arredondados. */
export const padGeometry = (w: number, h: number, d: number, radius = 0.018): BufferGeometry =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, Math.min(w, h, d) / 2.2));

/** Cilindro em medida real (eixo Y, centrado). */
export const rod = (r: number, len: number, segments = 20): BufferGeometry => new CylinderGeometry(r, r, len, segments);

/** Cilindro unitário (raio 1, altura 1) para esticar entre dois pontos. */
export const unitRod = (segments = 16): BufferGeometry => new CylinderGeometry(1, 1, 1, segments);

export const ball = (r: number): BufferGeometry => new SphereGeometry(r, 20, 14);

/** Alça em D do pegador simples (arco no plano XY, abre para −Y). */
export const dHandleGeometry = (): BufferGeometry => new TorusGeometry(0.065, 0.0065, 10, 32, Math.PI * 1.25);
