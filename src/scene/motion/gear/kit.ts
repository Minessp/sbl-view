/**
 * Ajudantes de construção do equipamento: geometria e material com dono (descartados juntos), tubo redondo, viga quadrada,
 * esticar entre dois pontos. Usado pelo `EquipmentView` e pelas estações (`gear/stations/`).
 */
import { type BufferGeometry, type Material, Mesh, type Object3D, Vector3 } from 'three';
import type { Vec3 } from '@/engine/math/vec';
import { createGearMaterial, refreshGearMaterial, type Finish, type GearMaterial, type Pattern } from './material';
import { padGeometry, unitRod } from './parts';

const UP = new Vector3(0, 1, 0);
const tA = new Vector3();
const tB = new Vector3();

/** Objeto de eixo Y esticado entre dois pontos (geometria unitária: raio 1, altura 1). */
export function stretch(m: Object3D, a: Vec3 | Vector3, b: Vec3 | Vector3, radius: number) {
  const ax = a instanceof Vector3 ? a.x : a[0],
    ay = a instanceof Vector3 ? a.y : a[1],
    az = a instanceof Vector3 ? a.z : a[2];
  tA.set(ax, ay, az);
  if (b instanceof Vector3) tB.copy(b).sub(tA);
  else tB.set(b[0] - ax, b[1] - ay, b[2] - az);
  const len = tB.length();
  m.visible = len > 1e-4;
  if (!m.visible) return;
  m.position.copy(tA).addScaledVector(tB, 0.5);
  m.quaternion.setFromUnitVectors(UP, tB.normalize());
  m.scale.set(radius, len, radius);
}

/** Objeto de eixo Y no centro, virado para `axis`. */
export function orient(m: Object3D, center: Vec3, axis: Vec3) {
  tB.set(axis[0], axis[1], axis[2]).normalize();
  m.quaternion.setFromUnitVectors(UP, tB);
  m.position.set(center[0], center[1], center[2]);
}

/** Viga de `GearKit.beam` (re)posta entre dois pontos: as peças que andam a cada quadro. */
export function placeBeam(m: Object3D, a: Vec3, b: Vec3, w: number) {
  tA.set(a[0], a[1], a[2]);
  tB.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = tB.length();
  m.position.copy(tA).addScaledVector(tB, 0.5);
  if (len > 1e-6) m.quaternion.setFromUnitVectors(UP, tB.normalize());
  m.scale.set(w, Math.max(len, 1e-3), w);
}

export class GearKit {
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: GearMaterial[] = [];
  private readonly matCache = new Map<string, GearMaterial>();
  /** Cilindro unitário (raio 1, altura 1, eixo Y) para tubos esticados. */
  readonly unit: BufferGeometry;

  constructor() {
    this.unit = this.geo(unitRod(18));
  }

  geo<T extends BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  mat(f: Finish, pattern: Pattern = 0, scale = 1, size: readonly [number, number, number] = [1, 1, 1]): GearMaterial {
    const key = `${f}|${pattern}|${scale}|${size.join(',')}`;
    const hit = this.matCache.get(key);
    if (hit) return hit;
    const m = createGearMaterial(f, pattern, scale, size);
    this.mats.push(m);
    this.matCache.set(key, m);
    return m;
  }

  mesh(g: BufferGeometry, m: Material, parent: Object3D): Mesh {
    const x = new Mesh(g, m);
    parent.add(x);
    return x;
  }

  /** Tubo redondo unitário (posicionar com `stretch`). */
  tube(parent: Object3D, finish: Finish = 'steel'): Mesh {
    return this.mesh(this.unit, this.mat(finish), parent);
  }

  /** Tubo redondo de a até b. */
  rod(parent: Object3D, a: Vec3, b: Vec3, r: number, finish: Finish = 'steel'): Mesh {
    const m = this.tube(parent, finish);
    stretch(m, a, b, r);
    return m;
  }

  /** Tubo quadrado entre dois pontos (caixa arredondada esticada no eixo Y). */
  beam(parent: Object3D, a: Vec3, b: Vec3, w = 0.06, finish: Finish = 'steel'): Mesh {
    const m = this.mesh(this.geo(padGeometry(1, 1, 1, 0.12)), this.mat(finish), parent);
    placeBeam(m, a, b, w);
    return m;
  }

  /** Cores da paleta (troca de tema). */
  refresh() {
    for (const m of this.mats) refreshGearMaterial(m);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
