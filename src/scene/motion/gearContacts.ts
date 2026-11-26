/**
 * Atravessamento contra o equipamento como ele é desenhado: cada malha do `EquipmentView` vira uma caixa orientada (a caixa
 * da geometria no espaço do mundo), testada contra as cápsulas do corpo e contra as peças que andam (barra, halter, pegador).
 * Mesmas regras de contato declarado do `engine/motion/collide.ts`; usado pelo teste de dados e pela folha de contato.
 */
import { Box3, type Mesh, type Object3D, Vector3 } from 'three';
import { capsulesOf, declared } from '@/engine/motion/collide';
import type { CompiledClip, MotionFrame } from '@/engine/motion/evaluate';
import { lerp, type Vec3 } from '@/engine/math/vec';
import type { GearMaterial } from './gear/material';
import type { EquipmentView } from './equipment';

export interface GearHit {
  readonly a: string;
  readonly b: string;
  readonly kind: 'body' | 'hand' | 'piece';
  readonly depthM: number;
}

interface Obb {
  readonly item: string;
  readonly finish: string;
  readonly c: Vector3;
  readonly ax: readonly [Vector3, Vector3, Vector3];
  readonly h: readonly [number, number, number];
  readonly r: number;
}

/** Peças que andam com o corpo: testadas contra as outras. */
const MOVING = /^(barbell|dumbbell)\d/;
/** Mão a mais disso do ponto de pegada já é "fora da pegada". */
const GRIP_REACH = 0.09;
/** Limites (m): corpo e peças fora do contato declarado; apoio declarado no estofado afunda um pouco (tecido mole). */
export const GEAR_LIMIT = { body: 0.02, hand: 0.02, piece: 0.015, soft: 0.04 } as const;

const box = new Box3();
const e = [new Vector3(), new Vector3(), new Vector3()] as const;

function itemOf(o: Object3D): string {
  for (let x: Object3D | null = o; x; x = x.parent) if (typeof x.userData.item === 'string') return x.userData.item;
  return '';
}

function shown(o: Object3D): boolean {
  for (let x: Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

function obbs(view: EquipmentView): Obb[] {
  view.group.updateMatrixWorld(true);
  const out: Obb[] = [];
  view.group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || m.userData.decor || !shown(m)) return;
    const item = itemOf(m);
    if (!item) return;
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox) return;
    box.copy(g.boundingBox);
    const c = box.getCenter(new Vector3()).applyMatrix4(m.matrixWorld);
    const size = box.getSize(new Vector3());
    m.matrixWorld.extractBasis(e[0], e[1], e[2]);
    const len = e.map((v) => v.length());
    const ax = e.map((v, i) => v.clone().divideScalar(len[i] || 1)) as unknown as Obb['ax'];
    const h: Obb['h'] = [(size.x * (len[0] ?? 0)) / 2, (size.y * (len[1] ?? 0)) / 2, (size.z * (len[2] ?? 0)) / 2];
    out.push({ item, finish: (m.material as GearMaterial).finish ?? '', c, ax, h, r: Math.hypot(...h) });
  });
  return out;
}

const tP = new Vector3();

/** Distância com sinal do ponto à caixa (negativa dentro). */
function obbDistance(p: Vec3, b: Obb): number {
  tP.set(p[0], p[1], p[2]).sub(b.c);
  const q = b.ax.map((a, i) => Math.abs(tP.dot(a)) - (b.h[i] ?? 0));
  const [x, y, z] = [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0];
  return Math.hypot(Math.max(x, 0), Math.max(y, 0), Math.max(z, 0)) + Math.min(Math.max(x, y, z), 0);
}

/** Sobreposição de duas caixas pelo teorema do eixo separador: a menor penetração (m), ≤ 0 se separadas. */
function obbOverlap(a: Obb, b: Obb): number {
  const d = b.c.clone().sub(a.c);
  const axes: Vector3[] = [...a.ax, ...b.ax];
  for (const x of a.ax) for (const y of b.ax) {
    const c = x.clone().cross(y);
    if (c.lengthSq() > 1e-8) axes.push(c.normalize());
  }
  let min = Infinity;
  for (const n of axes) {
    const ra = a.ax.reduce((s, v, i) => s + (a.h[i] ?? 0) * Math.abs(v.dot(n)), 0);
    const rb = b.ax.reduce((s, v, i) => s + (b.h[i] ?? 0) * Math.abs(v.dot(n)), 0);
    min = Math.min(min, ra + rb - Math.abs(d.dot(n)));
    if (min <= 0) return min;
  }
  return min;
}

/**
 * Atravessamentos do quadro (o `view` já atualizado com `update(frame)`), do mais fundo ao mais raso, acima de `floorM`.
 * Mão só conta fora da pegada; segmento de apoio declarado pode afundar no estofado até `GEAR_LIMIT.soft`.
 */
export function gearHits(view: EquipmentView, clip: CompiledClip, frame: MotionFrame, floorM = 0): GearHit[] {
  const boxes = obbs(view);
  const caps = capsulesOf(clip, frame);
  const { rest, bar } = declared(clip, frame);
  const hits = new Map<string, GearHit>();
  const hit = (a: string, b: string, kind: GearHit['kind'], depthM: number) => {
    if (depthM <= floorM) return;
    const k = `${a}|${b}`;
    const old = hits.get(k);
    if (!old || old.depthM < depthM) hits.set(k, { a, b, kind, depthM });
  };
  const N = 9;
  for (const cap of caps) {
    const side = cap.id === 'hand_r' ? 'r' : cap.id === 'hand_l' ? 'l' : null;
    if (side && frame.fingers[side] === 0) continue;
    const mid: Vec3 = lerp(cap.p, cap.q, 0.5);
    const half = Math.hypot(cap.q[0] - cap.p[0], cap.q[1] - cap.p[1], cap.q[2] - cap.p[2]) / 2;
    for (const b of boxes) {
      if (Math.hypot(mid[0] - b.c.x, mid[1] - b.c.y, mid[2] - b.c.z) > half + cap.r + b.r) continue;
      if (MOVING.test(b.item) && (side || bar.has(cap.id))) continue;
      let worst = -Infinity;
      let at: Vec3 = mid;
      for (let i = 0; i < N; i++) {
        const p = lerp(cap.p, cap.q, i / (N - 1));
        const d = cap.r - obbDistance(p, b);
        if (d > worst) [worst, at] = [d, p];
      }
      if (worst <= 0) continue;
      if (side) {
        const g = frame.grips[side];
        if (Math.hypot(at[0] - g[0], at[1] - g[1], at[2] - g[2]) > GRIP_REACH) hit(cap.id, b.item, 'hand', worst);
        continue;
      }
      if (rest.has(cap.id) && (b.finish === 'pad' || b.finish === 'rubber')) worst -= GEAR_LIMIT.soft - GEAR_LIMIT.body;
      else if (rest.has(cap.id) && cap.id.startsWith('foot_')) continue;
      hit(cap.id, b.item, 'body', worst);
    }
  }
  const moving = boxes.filter((b) => MOVING.test(b.item));
  for (const m of moving)
    for (const b of boxes) {
      if (b.item === m.item || m.c.distanceTo(b.c) > m.r + b.r) continue;
      hit(m.item, b.item, 'piece', obbOverlap(m, b));
    }
  return [...hits.values()].sort((x, y) => y.depthM - x.depthM);
}
