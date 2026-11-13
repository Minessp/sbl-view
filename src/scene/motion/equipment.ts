/**
 * Equipamento do player: barra, halteres, cabo e roldana, bancos e rolos, mais o vetor da carga. Geometria simples sob a
 * mesma luz do corpo (material de metal escovado, `prop.ts`). Montado uma vez por clipe; cada quadro só move as peças.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type ShaderMaterial,
} from 'three';
import type { MotionFrame, ResolvedEquipment } from '@/engine/motion/evaluate';
import type { Vec3 } from '@/engine/math/vec';
import { createPropMaterial } from '../body/prop';
import { palette } from '../body/rig';

const UP = new Vector3(0, 1, 0);
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpQ = new Quaternion();

/** Cilindro de eixo Y (altura 1) esticado entre dois pontos. */
function span(m: Mesh, a: Vec3, b: Vec3, radius: number) {
  tmpA.set(a[0], a[1], a[2]);
  tmpB.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = tmpB.length();
  m.visible = len > 1e-4;
  if (!m.visible) return;
  m.position.copy(tmpA).addScaledVector(tmpB, 0.5);
  m.quaternion.setFromUnitVectors(UP, tmpB.normalize());
  m.scale.set(radius, len, radius);
}

/** Peça ao longo de um eixo: posição no centro, Y da geometria virado para o eixo. */
function along(m: Mesh, center: Vec3, axis: Vec3, offset = 0) {
  tmpB.set(axis[0], axis[1], axis[2]).normalize();
  m.quaternion.setFromUnitVectors(UP, tmpB);
  m.position.set(center[0], center[1], center[2]).addScaledVector(tmpB, offset);
}

export class EquipmentView {
  readonly group = new Group();
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: Material[] = [];
  private readonly iron: ShaderMaterial;
  private readonly pad: ShaderMaterial;
  private readonly arrow: MeshBasicMaterial;
  /** Cada atualizador recebe a peça e o índice dela entre as do mesmo tipo (halteres: 0 direito, 1 esquerdo). */
  private readonly updaters: ((e: ResolvedEquipment, i: number) => void)[] = [];
  private readonly arrowShaft: Mesh;
  private readonly arrowHead: Mesh;
  /** Pontos no chão sob as peças fixas (sombra). */
  readonly floor: Vec3[] = [];

  constructor(first: MotionFrame) {
    this.iron = this.mat(createPropMaterial());
    this.pad = this.mat(createPropMaterial());
    this.arrow = this.mat(
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    this.refreshColors();
    const unit = this.geo(new CylinderGeometry(1, 1, 1, 14));
    const cone = this.geo(new CylinderGeometry(0, 1, 1, 16));
    this.arrowShaft = new Mesh(unit, this.arrow);
    this.arrowHead = new Mesh(cone, this.arrow);
    for (const m of [this.arrowShaft, this.arrowHead]) {
      m.renderOrder = 10;
      this.group.add(m);
    }
    const seen = new Map<string, number>();
    for (const e of first.equipment) {
      const i = seen.get(e.kind) ?? 0;
      seen.set(e.kind, i + 1);
      this.build(e, unit, i);
    }
  }

  private geo<T extends BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  private mat<T extends Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  /** Cores da paleta (o tema troca os vetores no lugar; o material da seta copia). */
  refreshColors() {
    const c = (k: 'ink-2' | 'rule' | 'accent') => palette[k];
    this.iron.uniforms.uColor?.value.copy(c('ink-2'));
    this.pad.uniforms.uColor?.value.copy(c('rule'));
    const a = c('accent');
    this.arrow.color.setRGB(a.x, a.y, a.z, SRGBColorSpace);
  }

  private mesh(g: BufferGeometry, m: Material): Mesh {
    const x = new Mesh(g, m);
    this.group.add(x);
    return x;
  }

  private build(e: ResolvedEquipment, unit: BufferGeometry, index: number) {
    switch (e.kind) {
      case 'barbell': {
        const bar = this.mesh(unit, this.iron);
        const plateGeo = this.geo(new CylinderGeometry(0.225, 0.225, 0.045, 40));
        const sleeveGeo = this.geo(new CylinderGeometry(0.025, 0.025, 0.4, 14));
        const plates: Mesh[] = [];
        for (let i = 0; i < e.plates * 2; i++) plates.push(this.mesh(plateGeo, this.pad));
        const sleeves = [this.mesh(sleeveGeo, this.iron), this.mesh(sleeveGeo, this.iron)];
        this.updaters.push((r) => {
          if (r.kind !== 'barbell') return;
          const a = r.axis;
          span(
            bar,
            [r.center[0] - a[0] * 1.1, r.center[1] - a[1] * 1.1, r.center[2] - a[2] * 1.1],
            [r.center[0] + a[0] * 1.1, r.center[1] + a[1] * 1.1, r.center[2] + a[2] * 1.1],
            0.0145,
          );
          sleeves.forEach((s, i) => along(s, r.center, a, (i === 0 ? -1 : 1) * 0.86));
          plates.forEach((p, i) => along(p, r.center, a, (i % 2 === 0 ? -1 : 1) * (0.7 + Math.floor(i / 2) * 0.05)));
        });
        break;
      }
      case 'dumbbell': {
        const handle = this.geo(new CylinderGeometry(0.016, 0.016, 0.14, 12));
        const head = this.geo(new CylinderGeometry(0.062, 0.062, 0.075, 6));
        const [h, a, b] = [this.mesh(handle, this.iron), this.mesh(head, this.pad), this.mesh(head, this.pad)];
        this.updaters.push((r, i) => {
          if (r.kind !== 'dumbbell' || i !== index) return;
          along(h, r.center, r.axis);
          along(a, r.center, r.axis, -0.105);
          along(b, r.center, r.axis, 0.105);
        });
        break;
      }
      case 'cable': {
        const cable = this.mesh(unit, this.iron);
        const legs = [this.mesh(unit, this.iron), this.mesh(unit, this.iron)];
        const handle = this.mesh(unit, this.iron);
        const wheel = this.mesh(this.geo(new TorusGeometry(0.05, 0.012, 8, 28)), this.iron);
        const housing = this.mesh(this.geo(new BoxGeometry(0.03, 0.14, 0.14)), this.pad);
        this.updaters.push((r) => {
          if (r.kind !== 'cable') return;
          const [g0, g1] = [r.grips[0] ?? r.pulley, r.grips[1] ?? r.grips[0] ?? r.pulley];
          const mid: Vec3 = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2, (g0[2] + g1[2]) / 2];
          tmpA.set(r.pulley[0] - mid[0], r.pulley[1] - mid[1], r.pulley[2] - mid[2]).normalize();
          const reach = r.handle === 'rope' ? 0.16 : r.handle === 'v' ? 0.08 : 0;
          const knot: Vec3 = [mid[0] + tmpA.x * reach, mid[1] + tmpA.y * reach, mid[2] + tmpA.z * reach];
          span(cable, knot, r.pulley, 0.0035);
          if (r.handle === 'bar') {
            const a = r.axis;
            span(
              handle,
              [mid[0] - a[0] * 0.33, mid[1] - a[1] * 0.33, mid[2] - a[2] * 0.33],
              [mid[0] + a[0] * 0.33, mid[1] + a[1] * 0.33, mid[2] + a[2] * 0.33],
              0.012,
            );
            for (const l of legs) l.visible = false;
          } else {
            handle.visible = false;
            span(legs[0] as Mesh, g0, knot, r.handle === 'rope' ? 0.009 : 0.011);
            span(legs[1] as Mesh, g1, knot, r.handle === 'rope' ? 0.009 : 0.011);
          }
          wheel.position.set(r.pulley[0], r.pulley[1], r.pulley[2]);
          // A roda fica no plano que o cabo faz com a vertical.
          tmpB.set(tmpA.z, 0, -tmpA.x);
          if (tmpB.lengthSq() < 1e-6) tmpB.set(1, 0, 0);
          wheel.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), tmpB.normalize());
          housing.position.copy(wheel.position);
          housing.quaternion.copy(wheel.quaternion).multiply(tmpQ.setFromAxisAngle(UP, Math.PI / 2));
        });
        break;
      }
      case 'block': {
        const box = this.mesh(this.geo(new BoxGeometry(e.size[0], e.size[1], e.size[2])), this.pad);
        box.position.set(e.center[0], e.center[1], e.center[2]);
        box.rotation.x = (e.pitch * Math.PI) / 180;
        if (e.center[1] - e.size[1] / 2 < 0.25) this.floor.push([e.center[0], 0, e.center[2]]);
        break;
      }
      case 'pad': {
        const roller = this.geo(new CylinderGeometry(0.045, 0.045, e.centers.length > 1 ? 0.14 : 0.34, 18));
        const rolls = e.centers.map(() => this.mesh(roller, this.pad));
        const lever = this.mesh(unit, this.iron);
        this.updaters.push((r) => {
          if (r.kind !== 'pad') return;
          rolls.forEach((m, i) => {
            const c = r.centers[i];
            if (!c) return;
            along(m, c, [1, 0, 0]);
          });
          const c0 = r.centers[0];
          if (r.pivot && c0) {
            // Braço da máquina por fora da perna (lado direito do sujeito = −X).
            const off = 0.22;
            span(lever, [r.pivot[0] - off, r.pivot[1], r.pivot[2]], [c0[0] - off, c0[1], c0[2]], 0.014);
          } else lever.visible = false;
        });
        break;
      }
    }
  }

  update(f: MotionFrame, showLoad: boolean) {
    const seen = new Map<string, number>();
    for (const e of f.equipment) {
      const i = seen.get(e.kind) ?? 0;
      seen.set(e.kind, i + 1);
      for (const u of this.updaters) u(e, i);
    }
    const L = f.load;
    const on = showLoad && L !== null;
    this.arrowShaft.visible = on;
    this.arrowHead.visible = on;
    if (!on || !L) return;
    const len = 0.32;
    const start = L.point;
    const tip: Vec3 = [start[0] + L.dir[0] * len, start[1] + L.dir[1] * len, start[2] + L.dir[2] * len];
    span(this.arrowShaft, start, [start[0] + L.dir[0] * (len - 0.06), start[1] + L.dir[1] * (len - 0.06), start[2] + L.dir[2] * (len - 0.06)], 0.007);
    tmpB.set(L.dir[0], L.dir[1], L.dir[2]);
    this.arrowHead.quaternion.setFromUnitVectors(UP, tmpB.clone().negate());
    this.arrowHead.position.set(tip[0] - L.dir[0] * 0.03, tip[1] - L.dir[1] * 0.03, tip[2] - L.dir[2] * 0.03);
    this.arrowHead.scale.set(0.022, 0.06, 0.022);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.group.removeFromParent();
  }
}
