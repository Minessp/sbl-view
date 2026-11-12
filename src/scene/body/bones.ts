/**
 * Esqueleto ilustrativo. Formas estilizadas, autoradas na pose neutra (mundo, lado direito)
 * e convertidas para o frame local de cada segmento. Não é medição.
 */
import type {
  BufferGeometry} from 'three';
import {
  CapsuleGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EngineSkeleton } from '@/engine/kinematics/types';
import { must } from '@/engine/math/arr';

type P = readonly [number, number, number];
const UP = new Vector3(0, 1, 0);

function orientAlong(g: BufferGeometry, a: Vector3, b: Vector3): BufferGeometry {
  const dir = new Vector3().subVectors(b, a);
  const q = new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  return g.applyMatrix4(new Matrix4().compose(a, q, new Vector3(1, 1, 1)));
}

/** Osso longo: torno com epífises nas pontas e diáfise fina. */
function longBone(a: Vector3, b: Vector3, r0: number, rs: number, r1: number): BufferGeometry {
  const L = a.distanceTo(b);
  const prof: [number, number][] = [
    [0.0001, 0], [r0 * 0.75, L * 0.005], [r0, L * 0.04], [r0 * 0.92, L * 0.1], [rs * 1.2, L * 0.2], [rs, L * 0.32],
    [rs * 0.95, L * 0.5], [rs, L * 0.68], [rs * 1.2, L * 0.8], [r1 * 0.92, L * 0.9], [r1, L * 0.96], [r1 * 0.75, L * 0.995], [0.0001, L],
  ];
  const g = new LatheGeometry(prof.map(([r, y]) => new Vector2(r, y)), 12);
  return orientAlong(g, a, b);
}

function capsule(a: Vector3, b: Vector3, r: number): BufferGeometry {
  const L = Math.max(1e-4, a.distanceTo(b));
  const g = new CapsuleGeometry(r, L, 3, 8);
  g.translate(0, L / 2, 0);
  return orientAlong(g, a, b);
}

function ellipsoid(c: Vector3, r: P, rot: P = [0, 0, 0]): BufferGeometry {
  const g = new SphereGeometry(1, 16, 12);
  const m = new Matrix4().compose(
    c,
    new Quaternion().setFromEuler(new Euler(rot[0], rot[1], rot[2])),
    new Vector3(r[0], r[1], r[2]),
  );
  return g.applyMatrix4(m);
}

function ribArc(c: Vector3, rx: number, rz: number, tube: number, tilt: number): BufferGeometry {
  // Arco aberto na frente (esterno fecha). Torus no plano XY → deitado no plano XZ.
  const g = new TorusGeometry(1, tube, 5, 40, Math.PI * 2 * 0.86);
  g.rotateZ(Math.PI / 2 + Math.PI * 0.14); // abertura voltada para +Z depois do giro em X
  g.rotateX(Math.PI / 2);
  g.scale(rx, 1, rz);
  g.rotateX(tilt);
  g.translate(c.x, c.y, c.z);
  return g;
}

/** Tudo indexado e com o mesmo conjunto de atributos para poder mesclar. */
function normalizeAttrs(g: BufferGeometry): BufferGeometry {
  const out = g.index ? g : g.toNonIndexed();
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  return out;
}

type Side = 'r' | 'l';

/** Geometrias por segmento, em coordenadas locais do segmento. */
export function buildBones(sk: EngineSkeleton): Map<string, BufferGeometry> {
  const parts = new Map<string, BufferGeometry[]>();
  const put = (seg: string, g: BufferGeometry) => {
    const list = parts.get(seg) ?? [];
    list.push(g);
    parts.set(seg, list);
  };

  // ---- Linha média ----
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  // Crânio + face + mandíbula
  put('head', ellipsoid(V(0, 1.665, -0.005), [0.07, 0.08, 0.088]));
  put('head', ellipsoid(V(0, 1.585, 0.045), [0.048, 0.052, 0.042]));
  put('head', ellipsoid(V(0, 1.548, 0.035), [0.045, 0.018, 0.04]));
  // Coluna: curva em S do sacro à cervical
  for (let i = 0; i < 18; i++) {
    const s = i / 17;
    const y = 1.0 + s * 0.46;
    const z = -0.085 + 0.022 * Math.sin(s * Math.PI * 1.6 - 0.2) - 0.018 * s;
    const r = 0.019 - 0.008 * s;
    const seg = y > 1.455 ? 'head' : 'trunk';
    put(seg, capsule(V(0, y - 0.009, z), V(0, y + 0.009, z), r));
  }
  // Costelas
  for (let i = 0; i < 10; i++) {
    const s = i / 9;
    const y = 1.405 - s * 0.2;
    const rx = 0.085 + 0.055 * Math.sin(Math.PI * Math.min(1, 0.25 + s * 0.85));
    const rz = 0.07 + 0.025 * Math.sin(Math.PI * Math.min(1, 0.3 + s * 0.8));
    put('trunk', ribArc(V(0, y, -0.015), rx, rz, 0.0055, -0.32));
  }
  put('trunk', capsule(V(0, 1.215, 0.078), V(0, 1.41, 0.07), 0.011)); // esterno
  // Pelve: anel + sacro
  {
    const ring = new TorusGeometry(0.075, 0.013, 6, 28);
    ring.rotateX(Math.PI / 2 - 1.0);
    ring.scale(1.15, 1, 0.9);
    ring.translate(0, 0.945, 0.0);
    put('pelvis', ring);
    put('pelvis', ellipsoid(V(0, 0.985, -0.075), [0.04, 0.055, 0.018], [0.5, 0, 0]));
  }

  // ---- Bilaterais ----
  for (const side of ['r', 'l'] as Side[]) {
    const m = side === 'r' ? 1 : -1;
    const W = (x: number, y: number, z: number) => new Vector3(x * m, y, z);
    const id = (base: string) => `${base}_${side}`;

    // Pelve: asa do ílio
    put('pelvis', ellipsoid(W(-0.118, 1.015, -0.015), [0.022, 0.065, 0.068], [0.15, -0.55 * m, 0.25 * m]));
    // Fêmur: cabeça, colo, diáfise, côndilos
    put(id('thigh'), ellipsoid(W(-0.0875, 0.9275, 0), [0.024, 0.024, 0.024]));
    put(id('thigh'), capsule(W(-0.09, 0.925, 0), W(-0.132, 0.918, -0.004), 0.013));
    put(id('thigh'), longBone(W(-0.128, 0.93, -0.004), W(-0.0875, 0.51, 0.0), 0.024, 0.0125, 0.034));
    put(id('thigh'), ellipsoid(W(-0.0875, 0.513, -0.004), [0.042, 0.02, 0.03]));
    // Patela (acompanha a perna) + tíbia + fíbula
    put(id('shank'), ellipsoid(W(-0.0875, 0.525, 0.04), [0.02, 0.025, 0.01]));
    put(id('shank'), longBone(W(-0.0855, 0.492, 0.002), W(-0.083, 0.075, 0.0), 0.036, 0.0135, 0.022));
    put(id('shank'), longBone(W(-0.124, 0.468, -0.016), W(-0.118, 0.06, -0.012), 0.009, 0.0055, 0.011));
    // Pé: tálus, calcâneo, metatarsos
    put(id('foot'), ellipsoid(W(-0.0875, 0.06, 0.005), [0.02, 0.016, 0.026]));
    put(id('foot'), ellipsoid(W(-0.088, 0.032, -0.035), [0.019, 0.024, 0.036]));
    for (let k = 0; k < 5; k++) {
      const x = -0.06 - k * 0.012;
      put(id('foot'), capsule(W(x - 0.003, 0.045, 0.025), W(x - 0.008 * k * 0.4, 0.014, 0.15 - k * 0.012), 0.0055));
    }
    // Escápula + clavícula (no tronco)
    put('trunk', ellipsoid(W(-0.105, 1.355, -0.098), [0.048, 0.068, 0.009], [0.08, 0.38 * m, 0]));
    put('trunk', capsule(W(-0.02, 1.428, 0.068), W(-0.178, 1.458, -0.005), 0.0068));
    // Úmero, rádio, ulna, mão
    put(id('upperarm'), ellipsoid(W(-0.185, 1.4315, -0.01), [0.023, 0.023, 0.023]));
    put(id('upperarm'), longBone(W(-0.186, 1.425, -0.01), W(-0.185, 1.105, -0.01), 0.02, 0.0105, 0.024));
    put(id('forearm'), longBone(W(-0.172, 1.1, -0.018), W(-0.174, 0.855, -0.012), 0.012, 0.0062, 0.009));
    put(id('forearm'), longBone(W(-0.198, 1.1, -0.005), W(-0.197, 0.855, -0.006), 0.009, 0.0065, 0.013));
    put(id('hand'), ellipsoid(W(-0.185, 0.835, -0.008), [0.022, 0.016, 0.012]));
    for (let k = 0; k < 4; k++) {
      const x = -0.172 - k * 0.0085;
      put(id('hand'), capsule(W(x, 0.82, -0.006), W(x, 0.71 - Math.abs(k - 1.2) * 0.012, -0.004), 0.0042));
    }
    put(id('hand'), capsule(W(-0.168, 0.83, 0.006), W(-0.158, 0.765, 0.022), 0.0046));
  }

  const out = new Map<string, BufferGeometry>();
  for (const [seg, list] of parts) {
    const merged = mergeGeometries(list.map(normalizeAttrs), false);
    if (!merged) throw new Error(`Falha ao mesclar ossos de ${seg}`);
    const o = must(sk.neutralOrigin, seg, 'segmento');
    merged.translate(-o[0], -o[1], -o[2]);
    merged.computeBoundingSphere();
    out.set(seg, merged);
    list.forEach((g) => g.dispose());
  }
  return out;
}
