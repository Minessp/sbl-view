/**
 * Equipamento do player em geometria de verdade, sob a luz do estúdio: barra olímpica (eixo recartilhado, colares,
 * mangas, anilhas torneadas, presilhas), barra curta e estação de barra fixa, halteres emborrachados, estação de polia
 * (coluna, trilhos, carro, roldanas, pilha de pesos que sobe com o cabo, cabo e pegadores), bancos e assentos estofados
 * com quadro de aço e pés no chão, plataformas de chapa xadrez, trilhos e braço pendular das máquinas, rolos e alavancas.
 * Montado uma vez por clipe; cada quadro só move as peças. Medidas de catálogo (barra de 2,2 m, anilha de 45 cm).
 */
import { BoxGeometry, type BufferGeometry, CylinderGeometry, Group, TorusGeometry, type Material, Mesh, MeshBasicMaterial, type Object3D, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import type { MotionFrame, ResolvedEquipment } from '@/engine/motion/evaluate';
import type { Vec3 } from '@/engine/math/vec';
import { palette } from '../body/rig';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GearKit, orient, stretch } from './gear/kit';
import { BENCH_STATIONS, buildStation } from './gear/stations';
import { type Finish, type GearMaterial, type Pattern } from './gear/material';
import { ball, dHandleGeometry, dumbbellHeadGeometry, padGeometry, plateGeometry, rod, rollerGeometry, sheaveGeometry } from './gear/parts';

const UP = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const tA = new Vector3();
const tB = new Vector3();
const tQ = new Quaternion();
const DEG = Math.PI / 180;

const v3 = (p: Vec3) => new Vector3(p[0], p[1], p[2]);

/** Direção horizontal para fora do corpo (do eixo do corpo até o ponto). */
function outward(p: Vec3): Vector3 {
  const d = new Vector3(p[0], 0, p[2]);
  return d.lengthSq() < 0.0025 ? Z.clone() : d.normalize();
}

type Updater = (e: ResolvedEquipment, i: number, f: MotionFrame) => void;

export class EquipmentView {
  readonly group = new Group();
  /** Geometrias e materiais com dono (as estações usam o mesmo). */
  readonly kit = new GearKit();
  private readonly arrow: MeshBasicMaterial;
  private readonly updaters: Updater[] = [];
  private readonly arrowShaft: Mesh;
  private readonly arrowHead: Mesh;
  private readonly unit: BufferGeometry;
  /** Pontos no chão sob as peças fixas (sombra). */
  readonly floor: Vec3[] = [];
  /** Uma estação desenha a estrutura do banco: a peça do clipe fica só com o estofado e o quadro `frame` some. */
  private benchStation = false;
  /** Topo da primeira coluna de um par espelhado: a segunda fecha a travessa do cross-over. */
  private crossTop: Vec3 | null = null;

  /** `frames`: o primeiro quadro do clipe e outras amostras (o curso da pilha de pesos sai delas). */
  constructor(frames: readonly MotionFrame[]) {
    const first = frames[0];
    this.arrow = new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false });
    this.unit = this.kit.unit;
    const head = this.geo(new CylinderGeometry(0, 1, 1, 18));
    this.arrowShaft = new Mesh(this.unit, this.arrow);
    this.arrowHead = new Mesh(head, this.arrow);
    for (const m of [this.arrowShaft, this.arrowHead]) {
      m.renderOrder = 10;
      this.group.add(m);
    }
    this.refreshColors();
    if (!first) return;
    this.benchStation = first.equipment.some((e) => e.kind === 'station' && BENCH_STATIONS.has(e.id));
    const seen = new Map<string, number>();
    for (const e of first.equipment) {
      const i = seen.get(e.kind) ?? 0;
      seen.set(e.kind, i + 1);
      this.build(e, i, frames);
    }
  }

  private geo<T extends BufferGeometry>(g: T): T {
    return this.kit.geo(g);
  }

  private mat(f: Finish, pattern: Pattern = 0, scale = 1, size: readonly [number, number, number] = [1, 1, 1]): GearMaterial {
    return this.kit.mat(f, pattern, scale, size);
  }

  /** Cores da paleta (troca de tema). */
  refreshColors() {
    this.kit.refresh();
    const a = palette.accent;
    this.arrow.color.setRGB(a.x, a.y, a.z, SRGBColorSpace);
  }

  private mesh(g: BufferGeometry, m: Material, parent: Object3D = this.group): Mesh {
    const x = new Mesh(g, m);
    parent.add(x);
    return x;
  }

  private tube(finish: Finish = 'steel'): Mesh {
    return this.mesh(this.unit, this.mat(finish));
  }

  /** Tubo quadrado de aço entre dois pontos. */
  private beam(a: Vec3, b: Vec3, w = 0.06, finish: Finish = 'steel'): Mesh {
    return this.kit.beam(this.group, a, b, w, finish);
  }

  private build(e: ResolvedEquipment, index: number, frames: readonly MotionFrame[]) {
    switch (e.kind) {
      case 'barbell':
        return e.bar === 'fixed' ? this.buildPullupBar(e) : this.buildBarbell(e);
      case 'dumbbell':
        return this.buildDumbbell(e, index);
      case 'cable':
        return this.buildCable(e, index, frames);
      case 'block':
        return this.buildBlock(e, index);
      case 'pad':
        return this.buildPads(e);
      case 'rail':
        return this.buildRail(e);
      case 'swing':
        return this.buildSwing(e);
      case 'station': {
        const v = buildStation(e.id, { frames, kit: this.kit }, e.params, e.at, e.yaw);
        this.group.add(v.group);
        this.floor.push(...v.floor);
        if (v.update) {
          const up = v.update;
          this.updaters.push((_r, _i, f) => up(f));
        }
        return;
      }
    }
  }

  // ---- Barras ----

  private buildBarbell(e: Extract<ResolvedEquipment, { kind: 'barbell' }>) {
    const g = new Group();
    this.group.add(g);
    const chrome = this.mat('chrome');
    if (e.bar === 'olympic') {
      // Eixo de 28 mm: centro liso, recartilhado onde as mãos pegam, colar interno, manga de 50 mm.
      this.mesh(this.geo(rod(0.014, 0.42)), chrome, g);
      for (const s of [-1, 1]) {
        // Recartilhado de 0,215 a 0,645 m do centro, com a marca lisa de 81 cm (1,2 cm) no meio.
        for (const [a, b] of [
          [0.215, 0.399],
          [0.411, 0.645],
        ] as const) {
          const k = this.mesh(this.geo(rod(0.0142, b - a, 28)), this.mat('chrome', 1, 0.0142), g);
          k.position.y = (s * (a + b)) / 2;
        }
        const mark = this.mesh(this.geo(rod(0.014, 0.012, 28)), chrome, g);
        mark.position.y = s * 0.405;
        const collar = this.mesh(this.geo(rod(0.036, 0.03, 32)), chrome, g);
        collar.position.y = s * 0.66;
        const sleeve = this.mesh(this.geo(rod(0.025, 0.415, 28)), chrome, g);
        sleeve.position.y = s * (0.675 + 0.2075);
        const cap = this.mesh(this.geo(rod(0.027, 0.006, 28)), chrome, g);
        cap.position.y = s * 1.093;
        let y = 0.678;
        for (let i = 0; i < e.plates; i++) {
          const t = i === 0 ? 0.045 : 0.032;
          const d = i === 0 ? 0.45 : 0.4 - (i - 1) * 0.05;
          const p = this.mesh(this.geo(plateGeometry(d, t)), this.mat('iron'), g);
          p.position.y = s * (y + t / 2);
          y += t + 0.002;
        }
        if (e.plates > 0) {
          // Presilha de mola: três espiras na manga e as duas alças.
          for (let k = 0; k < 3; k++) {
            const coil = this.mesh(this.geo(new TorusGeometry(0.0285, 0.0042, 8, 28)), this.mat('steel'), g);
            coil.rotation.x = Math.PI / 2;
            coil.position.y = s * (y + 0.006 + k * 0.0085);
          }
          for (const t of [-1, 1]) {
            const arm = this.tube('steel');
            arm.removeFromParent();
            g.add(arm);
            const y0 = s * (y + 0.01);
            stretch(arm, [0.03, y0, t * 0.006], [0.085, y0 + s * 0.02, t * 0.03], 0.0035);
          }
        }
      }
    } else {
      // Barra curta de rosca: 1,2 m, anilhas fixas de 26 cm presas por parafuso.
      this.mesh(this.geo(rod(0.0125, 0.36)), chrome, g);
      for (const s of [-1, 1]) {
        const k = this.mesh(this.geo(rod(0.0128, 0.2, 24)), this.mat('chrome', 1, 0.0128), g);
        k.position.y = s * 0.28;
        const inner = this.mesh(this.geo(rod(0.024, 0.02, 24)), chrome, g);
        inner.position.y = s * 0.4;
        const sleeve = this.mesh(this.geo(rod(0.0125, 0.2)), chrome, g);
        sleeve.position.y = s * 0.5;
        for (let i = 0; i < 2; i++) {
          const p = this.mesh(this.geo(plateGeometry(0.26, 0.03)), this.mat('iron'), g);
          p.position.y = s * (0.43 + 0.016 + i * 0.033);
        }
        const nut = this.mesh(this.geo(rod(0.028, 0.03, 6)), chrome, g);
        nut.position.y = s * 0.515;
      }
    }
    this.updaters.push((r) => {
      if (r.kind !== 'barbell') return;
      orient(g, r.center, r.axis);
    });
  }

  /** Estação de barra fixa: barra recartilhada entre dois montantes até o chão, com pés. */
  private buildPullupBar(e: Extract<ResolvedEquipment, { kind: 'barbell' }>) {
    const g = new Group();
    this.group.add(g);
    this.mesh(this.geo(rod(0.016, 1.3, 28)), this.mat('chrome', 1, 0.016), g);
    orient(g, e.center, e.axis);
    for (const s of [-1, 1]) {
      const end: Vec3 = [e.center[0] + e.axis[0] * 0.68 * s, e.center[1], e.center[2] + e.axis[2] * 0.68 * s];
      this.beam([end[0], e.center[1] + 0.12, end[2]], [end[0], 0, end[2]], 0.07);
      this.beam([end[0], 0.025, end[2] - 0.55], [end[0], 0.025, end[2] + 0.45], 0.05);
      // Mãos-francesas do montante ao pé, na frente e atrás (a estação não balança com o corpo pendurado).
      for (const dz of [-0.5, 0.4]) this.beam([end[0], e.center[1] * 0.5, end[2]], [end[0], 0.04, end[2] + dz], 0.045);
      const cap = this.mesh(this.geo(padGeometry(0.09, 0.02, 0.09, 0.005)), this.mat('rubber'));
      cap.position.set(end[0], e.center[1] + 0.13, end[2]);
      const sock = this.mesh(this.geo(rod(0.03, 0.08, 20)), this.mat('steel'));
      orient(sock, [e.center[0] + e.axis[0] * 0.64 * s, e.center[1], e.center[2] + e.axis[2] * 0.64 * s], e.axis);
      this.floor.push([end[0], 0, end[2]]);
    }
  }

  // ---- Halteres ----

  private buildDumbbell(e: Extract<ResolvedEquipment, { kind: 'dumbbell' }>, index: number) {
    const g = new Group();
    this.group.add(g);
    this.mesh(this.geo(rod(0.016, 0.13, 24)), this.mat('chrome', 1, 0.016), g);
    for (const s of [-1, 1]) {
      const c = this.mesh(this.geo(rod(0.026, 0.012, 24)), this.mat('chrome'), g);
      c.position.y = s * 0.071;
      // Sextavado: cabeça prismática de seis faces (não rola no chão); redondo: emborrachado torneado.
      const h = this.mesh(this.geo(e.style === 'hex' ? rod(0.07, 0.072, 6) : dumbbellHeadGeometry(0.064, 0.072)), this.mat('rubber'), g);
      h.position.y = s * 0.113;
      const cap = this.mesh(this.geo(rod(0.034, 0.008, 24)), this.mat('chrome'), g);
      cap.position.y = s * 0.152;
    }
    this.updaters.push((r, i) => {
      if (r.kind !== 'dumbbell' || i !== index) return;
      orient(g, r.center, r.axis);
    });
  }

  // ---- Polia ----

  private buildCable(e: Extract<ResolvedEquipment, { kind: 'cable' }>, index: number, frames: readonly MotionFrame[]) {
    const P = e.pulley;
    // Coluna atrás da roldana, do chão a 2,35 m; o carro corre em dois trilhos do lado do corpo.
    // Roldana perto do corpo e no alto (puxada): a coluna fica à frente (sempre +Z, onde a torre tem o assento) e uma
    // lança leva a roldana até sobre a cabeça.
    const near = Math.hypot(P[0], P[2]) < 0.45 && P[1] > 1.6;
    const d = near ? Z.clone() : outward(P);
    const side = new Vector3(-d.z, 0, d.x);
    const yaw = Math.atan2(d.x, d.z);
    const off = near ? 0.55 : 0.11;
    const tower = new Group();
    tower.position.set(P[0] + d.x * off, 0, P[2] + d.z * off);
    tower.rotation.y = yaw;
    this.group.add(tower);
    const H = near ? Math.max(2.35, P[1] + 0.16) : 2.35;
    if (near) {
      const boom = this.mesh(this.geo(padGeometry(0.08, 0.08, off + 0.12, 0.01)), this.mat('steel'), tower);
      boom.position.set(0, H - 0.02, -off / 2 + 0.02);
      const hanger = this.mesh(this.geo(padGeometry(0.03, H - 0.02 - P[1], 0.03, 0.006)), this.mat('steel'), tower);
      hanger.position.set(0, (H - 0.02 + P[1]) / 2 + 0.03, -off);
    }
    const col = this.mesh(this.geo(padGeometry(0.1, H, 0.08, 0.012)), this.mat('steel'), tower);
    col.position.set(0, H / 2, 0);
    const cap = this.mesh(this.geo(padGeometry(0.16, 0.05, 0.3, 0.01)), this.mat('steel'), tower);
    cap.position.set(0, H + 0.02, 0.05);
    const foot = this.mesh(this.geo(padGeometry(0.5, 0.04, 0.62, 0.01)), this.mat('steel'), tower);
    foot.position.set(0, 0.02, 0.1);
    for (const x of [-0.04, 0.04]) {
      const rail = this.mesh(this.geo(rod(0.009, H - 0.1, 14)), this.mat('chrome'), tower);
      rail.position.set(x, H / 2, -0.055);
    }
    if (!near) {
      const carY = Math.min(H - 0.12, Math.max(0.12, P[1]));
      const car = this.mesh(this.geo(padGeometry(0.13, 0.16, 0.05, 0.01)), this.mat('steel'), tower);
      car.position.set(0, carY, -0.07);
      const knob = this.mesh(this.geo(rod(0.012, 0.05, 12)), this.mat('rubber'), tower);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.05, carY + 0.05, -0.1);
    }
    // Furação de regulagem do carro entre os trilhos (uma geometria só).
    const holeParts: BufferGeometry[] = [];
    for (let y = 0.2; y < H - 0.15; y += 0.045) {
      const b = new BoxGeometry(0.018, 0.012, 0.004);
      b.translate(0, y, -0.041);
      holeParts.push(b);
    }
    const holesGeo = mergeGeometries(holeParts);
    for (const p of holeParts) p.dispose();
    if (holesGeo) this.mesh(this.geo(holesGeo), this.mat('rubber'), tower);
    // Pilha atrás da coluna, entre duas guias que vão da base à travessa; o pino escolhe a placa: dela para cima tudo
    // sobe com o cabo, as de baixo ficam na base.
    const PLATES = 12;
    const PIN = 7;
    const plateY = (i: number) => 0.07 + i * 0.026;
    const guideTop = H - 0.25;
    for (const x of [-0.1, 0.1]) {
      const guide = this.mesh(this.geo(rod(0.008, guideTop - 0.04, 12)), this.mat('chrome'), tower);
      guide.position.set(x, (guideTop + 0.04) / 2, 0.2);
    }
    const arm = this.mesh(this.geo(padGeometry(0.04, 0.04, 0.3, 0.008)), this.mat('steel'), tower);
    arm.position.set(0, guideTop, 0.17);
    const yoke = this.mesh(this.geo(padGeometry(0.32, 0.04, 0.05, 0.008)), this.mat('steel'), tower);
    yoke.position.set(0, guideTop, 0.2);
    for (let i = 0; i < PIN; i++) {
      const pl = this.mesh(this.geo(padGeometry(0.24, 0.022, 0.11, 0.004)), this.mat('iron'), tower);
      pl.position.set(0, plateY(i), 0.2);
    }
    const stack = new Group();
    stack.position.set(0, 0, 0.2);
    tower.add(stack);
    for (let i = PIN; i < PLATES; i++) {
      const pl = this.mesh(this.geo(padGeometry(0.24, 0.022, 0.11, 0.004)), this.mat('iron'), stack);
      pl.position.y = plateY(i);
    }
    const top = this.mesh(this.geo(padGeometry(0.24, 0.03, 0.11, 0.006)), this.mat('chrome'), stack);
    top.position.y = plateY(PLATES) + 0.004;
    const stem = this.mesh(this.geo(rod(0.007, 0.36, 10)), this.mat('chrome'), stack);
    stem.position.y = plateY(PLATES) - 0.17;
    const pin = this.mesh(this.geo(rod(0.006, 0.1, 10)), this.mat('chrome'), stack);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(0, plateY(PIN), -0.06);
    const pinHead = this.mesh(this.geo(ball(0.012)), this.mat('rubber'), stack);
    pinHead.position.set(0, plateY(PIN), -0.11);
    const stackTop = plateY(PLATES) + 0.02;
    // Capa: chapa atrás da pilha e montantes laterais do chão à travessa (a pilha segue à vista pelos lados).
    const shroud = this.mesh(this.geo(padGeometry(0.3, guideTop, 0.012, 0.004)), this.mat('steel'), tower);
    shroud.position.set(0, guideTop / 2, 0.32);
    for (const x of [-0.15, 0.15]) {
      const post = this.mesh(this.geo(padGeometry(0.03, guideTop, 0.03, 0.006)), this.mat('steel'), tower);
      post.position.set(x, guideTop / 2, 0.31);
    }
    const bumper = this.mesh(this.geo(padGeometry(0.26, 0.05, 0.13, 0.01)), this.mat('rubber'), tower);
    bumper.position.set(0, 0.045, 0.2);
    // Roldanas: a do carro (move só no plano do cabo) e duas fixas no topo.
    const wheel = new Group();
    this.group.add(wheel);
    this.mesh(this.geo(sheaveGeometry(0.045, 0.022)), this.mat('chrome'), wheel).rotation.x = Math.PI / 2;
    for (const z of [-0.016, 0.016]) {
      const cheek = this.mesh(this.geo(padGeometry(0.11, 0.11, 0.006, 0.02)), this.mat('steel'), wheel);
      cheek.position.set(0, 0, z);
    }
    const topWheel = this.mesh(this.geo(sheaveGeometry(0.04, 0.02)), this.mat('chrome'), tower);
    topWheel.rotation.z = Math.PI / 2;
    topWheel.position.set(0, H - 0.04, 0.07);
    // Cabo: pegada → roldana do carro → topo → pilha.
    const cableMat: Finish = 'cable';
    const legOut = this.tube(cableMat);
    const legUp = this.tube(cableMat);
    const legDown = this.tube(cableMat);
    const legBoom = this.tube(cableMat);
    legBoom.visible = near;
    const handle = this.buildHandle(e.handle);
    const link = this.buildConnector();
    // Curso da pilha: o cabo que sai da roldana sobe a pilha na mesma medida.
    const lengths = frames.flatMap((f) => f.equipment.filter((q) => q.kind === 'cable').map((q) => (q.kind === 'cable' ? cableLength(q) : 0)));
    const own = lengths.filter((_, k) => k % Math.max(1, frames[0]?.equipment.filter((q) => q.kind === 'cable').length ?? 1) === index);
    const Lmin = own.length ? Math.min(...own) : 0;
    // Ponto do frame da coluna → mundo.
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    const towerPt = (x: number, y: number, z: number) => new Vector3(tower.position.x + x * cy + z * sy, y, tower.position.z - x * sy + z * cy);
    const topWorld = towerPt(0, H - 0.04, 0.07);
    this.floor.push([tower.position.x, 0, tower.position.z]);
    if (e.mirror) {
      const t: Vec3 = [tower.position.x, H + 0.06, tower.position.z];
      if (this.crossTop) this.beam(this.crossTop, t, 0.08);
      else this.crossTop = t;
    }
    this.updaters.push((r, i) => {
      if (r.kind !== 'cable' || i !== index) return;
      const lift = Math.min(0.5, Math.max(0, cableLength(r) - Lmin));
      stack.position.y = lift;
      const knot = link(handle.update(r), P);
      // Roda no plano que o cabo faz com a vertical, tangente ao cabo que sobe pela coluna.
      tA.set(knot[0] - P[0], knot[1] - P[1], knot[2] - P[2]).normalize();
      tB.set(tA.z, 0, -tA.x);
      if (tB.lengthSq() < 1e-6) tB.copy(side);
      wheel.position.set(P[0], P[1], P[2]);
      wheel.quaternion.setFromUnitVectors(Z, tB.normalize());
      stretch(legOut, knot, P, 0.0032);
      tA.set(P[0], P[1], P[2]);
      if (near) {
        // Sobe da roldana até a lança e corre por dentro dela até a coluna.
        const above = new Vector3(P[0], H - 0.04, P[2]);
        stretch(legUp, tA.clone().addScaledVector(d, 0.03), above, 0.0032);
        stretch(legBoom, above, topWorld.clone().addScaledVector(d, -0.04), 0.0032);
      } else stretch(legUp, tA.clone().addScaledVector(d, 0.03), topWorld.clone().addScaledVector(d, -0.04), 0.0032);
      stretch(legDown, topWorld.clone().addScaledVector(d, 0.04), towerPt(0, stackTop + lift, 0.2), 0.0032);
    });
  }

  /** Pegador do cabo; devolve a função que o posiciona e o ponto onde o cabo prende. */
  /**
   * Mosquetão, giro e corrente curta entre o pegador e o cabo (o cabo não cola mais no pegador). Recebe o ponto de
   * engate do pegador e a roldana; devolve onde o cabo começa.
   */
  private buildConnector(): (knot: Vec3, pulley: Vec3) => Vec3 {
    const steel = this.mat('chrome');
    const biner = this.mesh(this.geo(new TorusGeometry(0.014, 0.0032, 8, 20)), steel);
    const swivel = this.mesh(this.geo(rod(0.008, 0.022, 14)), steel);
    const links = [0, 1, 2].map(() => this.mesh(this.geo(new TorusGeometry(0.008, 0.0022, 6, 14)), steel));
    const d = new Vector3();
    const at = (m: Object3D, k: Vec3, t: number, sy: number, turn: number) => {
      m.position.set(k[0] + d.x * t, k[1] + d.y * t, k[2] + d.z * t);
      m.quaternion.setFromUnitVectors(UP, d);
      m.rotateY(turn);
      m.scale.set(1, sy, 1);
    };
    return (knot, pulley) => {
      d.set(pulley[0] - knot[0], pulley[1] - knot[1], pulley[2] - knot[2]).normalize();
      at(biner, knot, 0.018, 1.7, 0);
      at(swivel, knot, 0.05, 1, 0);
      links.forEach((m, i) => at(m, knot, 0.068 + i * 0.019, 1.45, i % 2 ? Math.PI / 2 : 0));
      return [knot[0] + d.x * 0.095, knot[1] + d.y * 0.095, knot[2] + d.z * 0.095];
    };
  }

  private buildHandle(kind: 'bar' | 'rope' | 'v' | 'single'): { update: (r: Extract<ResolvedEquipment, { kind: 'cable' }>) => Vec3 } {
    const chrome = this.mat('chrome');
    const rubber = this.mat('rubber');
    if (kind === 'bar') {
      const bar = this.tube('chrome');
      const grips = [this.mesh(this.geo(rod(0.016, 0.12, 18)), rubber), this.mesh(this.geo(rod(0.016, 0.12, 18)), rubber)];
      const ends = [this.tube('chrome'), this.tube('chrome')];
      const ring = this.mesh(this.geo(ball(0.014)), chrome);
      return {
        update: (r) => {
          const [g0, g1] = [r.grips[0] ?? r.pulley, r.grips[1] ?? r.grips[0] ?? r.pulley];
          const a = r.axis;
          const half = Math.max(0.26, Math.hypot(g1[0] - g0[0], g1[1] - g0[1], g1[2] - g0[2]) / 2 + 0.08);
          const mid: Vec3 = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2, (g0[2] + g1[2]) / 2];
          const p = (k: number): Vec3 => [mid[0] + a[0] * k, mid[1] + a[1] * k, mid[2] + a[2] * k];
          stretch(bar, p(-half), p(half), 0.012);
          grips.forEach((m, i) => orient(m, i === 0 ? g0 : g1, a));
          // Pontas dobradas da barra larga (puxada).
          tA.set(r.pulley[0] - mid[0], r.pulley[1] - mid[1], r.pulley[2] - mid[2]).normalize();
          ends.forEach((m, i) => {
            const s = i === 0 ? -1 : 1;
            const e0 = p(s * half);
            const wide = half > 0.4;
            m.visible = wide;
            if (wide) stretch(m, e0, [e0[0] + a[0] * s * 0.06 + tA.x * 0.06, e0[1] + a[1] * s * 0.06 + tA.y * 0.06, e0[2] + a[2] * s * 0.06 + tA.z * 0.06], 0.012);
          });
          const knot: Vec3 = [mid[0] + tA.x * 0.03, mid[1] + tA.y * 0.03, mid[2] + tA.z * 0.03];
          ring.position.set(knot[0], knot[1], knot[2]);
          return knot;
        },
      };
    }
    if (kind === 'rope') {
      const ropes = [this.tube('rubber'), this.tube('rubber')];
      // Ponteiras de borracha (batente que a mão não passa).
      const tips = [this.mesh(this.geo(new CylinderGeometry(0.017, 0.024, 0.045, 18)), rubber), this.mesh(this.geo(new CylinderGeometry(0.017, 0.024, 0.045, 18)), rubber)];
      const ring = this.mesh(this.geo(ball(0.016)), chrome);
      return {
        update: (r) => {
          const [g0, g1] = [r.grips[0] ?? r.pulley, r.grips[1] ?? r.grips[0] ?? r.pulley];
          const mid: Vec3 = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2, (g0[2] + g1[2]) / 2];
          tA.set(r.pulley[0] - mid[0], r.pulley[1] - mid[1], r.pulley[2] - mid[2]).normalize();
          const knot: Vec3 = [mid[0] + tA.x * 0.16, mid[1] + tA.y * 0.16, mid[2] + tA.z * 0.16];
          [g0, g1].forEach((g, i) => {
            // A corda passa pela mão e termina na bola, um pouco além.
            tB.set(g[0] - knot[0], g[1] - knot[1], g[2] - knot[2]).normalize();
            const end: Vec3 = [g[0] + tB.x * 0.04, g[1] + tB.y * 0.04, g[2] + tB.z * 0.04];
            stretch(ropes[i] as Mesh, knot, end, 0.011);
            orient(tips[i] as Mesh, [end[0] + tB.x * 0.015, end[1] + tB.y * 0.015, end[2] + tB.z * 0.015], [tB.x, tB.y, tB.z]);
          });
          ring.position.set(knot[0], knot[1], knot[2]);
          return knot;
        },
      };
    }
    if (kind === 'v') {
      const arms = [this.tube('chrome'), this.tube('chrome')];
      const grips = [this.mesh(this.geo(rod(0.016, 0.1, 18)), rubber), this.mesh(this.geo(rod(0.016, 0.1, 18)), rubber)];
      return {
        update: (r) => {
          const [g0, g1] = [r.grips[0] ?? r.pulley, r.grips[1] ?? r.grips[0] ?? r.pulley];
          const mid: Vec3 = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2, (g0[2] + g1[2]) / 2];
          tA.set(r.pulley[0] - mid[0], r.pulley[1] - mid[1], r.pulley[2] - mid[2]).normalize();
          const knot: Vec3 = [mid[0] + tA.x * 0.09, mid[1] + tA.y * 0.09, mid[2] + tA.z * 0.09];
          [g0, g1].forEach((g, i) => {
            stretch(arms[i] as Mesh, knot, g, 0.011);
            orient(grips[i] as Mesh, g, [g[0] - knot[0], g[1] - knot[1], g[2] - knot[2]]);
          });
          return knot;
        },
      };
    }
    // Pegador simples (D): alça de aço e manopla de borracha na mão.
    const d = this.mesh(this.geo(dHandleGeometry()), chrome);
    const grip = this.mesh(this.geo(rod(0.016, 0.11, 18)), rubber);
    return {
      update: (r) => {
        const g = r.grips[0] ?? r.pulley;
        tA.set(r.pulley[0] - g[0], r.pulley[1] - g[1], r.pulley[2] - g[2]).normalize();
        tB.crossVectors(tA, UP);
        if (tB.lengthSq() < 1e-6) tB.set(1, 0, 0);
        tB.normalize();
        orient(grip, g, [tB.x, tB.y, tB.z]);
        // A alça abraça a manopla e abre para o cabo.
        const knot: Vec3 = [g[0] + tA.x * 0.075, g[1] + tA.y * 0.075, g[2] + tA.z * 0.075];
        d.position.set(g[0] + tA.x * 0.01, g[1] + tA.y * 0.01, g[2] + tA.z * 0.01);
        tQ.setFromUnitVectors(new Vector3(0, -1, 0), tA.clone().negate());
        d.quaternion.copy(tQ);
        d.rotateY(Math.atan2(tB.x, tB.z));
        d.rotateZ(-Math.PI * 0.125 + Math.PI);
        return knot;
      },
    };
  }

  // ---- Bancos, assentos, plataformas ----

  private buildBlock(e: Extract<ResolvedEquipment, { kind: 'block' }>, index: number) {
    const [w, h, dpt] = e.size;
    const g = new Group();
    this.group.add(g);
    const place = (center: Vec3, pitch: number) => {
      g.position.set(center[0], center[1], center[2]);
      g.rotation.x = pitch * DEG;
    };
    place(e.center, e.pitch);
    g.updateMatrixWorld();
    const role = e.role;
    if (role === 'frame' && this.benchStation && !e.moving) {
      g.removeFromParent();
      return;
    }
    if ((role === 'bench' || role === 'seat' || role === 'back') && dpt < h && dpt <= 0.1) {
      // Encosto fino em Z (a pessoa apoia na face +Z): espuma inteira e chapa de aço atrás.
      this.mesh(this.geo(padGeometry(w, h, dpt, 0.025)), this.mat('pad'), g);
      const plate = this.mesh(this.geo(padGeometry(w * 0.86, h * 0.92, 0.012, 0.004)), this.mat('steel'), g);
      plate.position.z = -dpt / 2 - 0.006;
      if (!e.moving && !this.benchStation && e.center[1] - h / 2 > 0.2) {
        const back = new Vector3(0, -h * 0.25, -dpt / 2 - 0.03).applyMatrix4(g.matrixWorld);
        this.beam([back.x, back.y, back.z], [back.x, 0.03, back.z], 0.05);
        this.beam([back.x, 0.025, back.z - 0.25], [back.x, 0.025, back.z + 0.25], 0.045);
        this.floor.push([back.x, 0, back.z]);
      }
    } else if (role === 'bench' || role === 'seat' || role === 'back') {
      // Estofado: o topo da caixa (até 8 cm) é a espuma; o resto embaixo, quadro de aço.
      const padH = Math.min(h, 0.08);
      const pad = this.mesh(this.geo(padGeometry(w, padH, dpt, 0.025)), this.mat('pad', 3, 1, [w, padH, dpt]), g);
      pad.position.y = h / 2 - padH / 2;
      const plate = this.mesh(this.geo(padGeometry(w * 0.86, 0.012, dpt * 0.92, 0.004)), this.mat('steel'), g);
      plate.position.y = h / 2 - padH - 0.006;
      if (!e.moving && !this.benchStation) this.buildBlockFrame(g, e, padH);
    } else if (role === 'platform') {
      const top = this.mesh(this.geo(padGeometry(w, Math.min(h, 0.02), dpt, 0.004)), this.mat('steel', 2, 0.03), g);
      top.position.y = h / 2 - Math.min(h, 0.02) / 2;
      if (h > 0.03) {
        const body = this.mesh(this.geo(padGeometry(w, h - 0.02, dpt, 0.008)), this.mat('steel'), g);
        body.position.y = -0.01;
      }
      for (const s of [-1, 1]) {
        const lip = this.mesh(this.geo(padGeometry(0.03, Math.max(h, 0.03) + 0.02, dpt, 0.006)), this.mat('steel'), g);
        lip.position.set((s * (w - 0.03)) / 2, 0.01, 0);
      }
    } else if (role === 'step') {
      const body = this.mesh(this.geo(padGeometry(w, h * 0.7, dpt, 0.01)), this.mat('steel'), g);
      body.position.y = -h * 0.15;
      const tread = this.mesh(this.geo(padGeometry(w, h * 0.3, dpt, 0.008)), this.mat('rubber', 2, 0.012), g);
      tread.position.y = h * 0.35;
    } else {
      this.mesh(this.geo(padGeometry(w, h, dpt, 0.012)), this.mat('steel'), g);
    }
    if (e.moving) {
      this.updaters.push((r, i) => {
        if (r.kind !== 'block' || i !== index) return;
        place(r.center, r.pitch);
      });
    } else if (e.center[1] - h / 2 < 0.25) this.floor.push([e.center[0], 0, e.center[2]]);
  }

  /** Quadro sob o estofado: longarina, pernas até o chão com pés de borracha; banco inclinado ganha escora e régua. */
  private buildBlockFrame(g: Group, e: Extract<ResolvedEquipment, { kind: 'block' }>, padH: number) {
    const [w, h, dpt] = e.size;
    const local = (x: number, y: number, z: number): Vec3 => {
      const p = new Vector3(x, y, z).applyMatrix4(g.matrixWorld);
      return [p.x, p.y, p.z];
    };
    const under = h / 2 - padH - 0.02;
    const long = dpt >= w;
    const half = (long ? dpt : w) / 2 - 0.08;
    const at = (k: number) => (long ? local(0, under, k) : local(k, under, 0));
    const a = at(-half),
      b = at(half);
    const lowest = Math.min(a[1], b[1]);
    if (lowest < 0.04) return;
    // Longarina sob o estofado.
    this.beam(a, b, 0.055);
    const legs: Vec3[] = Math.abs(e.pitch) > 20 ? [a] : [a, b];
    if (Math.abs(e.pitch) > 20) {
      // Inclinado: perna na ponta de baixo e escora da ponta de cima até o chão, com a régua de regulagem.
      const hi = a[1] > b[1] ? a : b;
      const lo = a[1] > b[1] ? b : a;
      legs.length = 0;
      legs.push(lo);
      const foot: Vec3 = [hi[0], 0.03, lo[2] + (hi[2] - lo[2]) * 0.55];
      this.beam(hi, foot, 0.05);
      const ladder: Vec3 = [foot[0], 0.03, foot[2]];
      this.beam(ladder, [lo[0], 0.03, lo[2]], 0.05);
      const teeth = 5;
      for (let i = 0; i < teeth; i++) {
        const k = 0.15 + (i / teeth) * 0.6;
        const p: Vec3 = [foot[0], 0.07, foot[2] + (lo[2] - foot[2]) * k];
        this.beam([p[0], 0.05, p[2]], [p[0], 0.085, p[2]], 0.02);
      }
    }
    for (const p of legs) {
      const floorPt: Vec3 = [p[0], 0.03, p[2]];
      this.beam(p, floorPt, 0.05);
      // Pé em T, atravessado.
      const span = (long ? w : dpt) / 2 + 0.05;
      const ax = long ? [span, 0, 0] : [0, 0, span];
      this.beam([p[0] - (ax[0] ?? 0), 0.025, p[2] - (ax[2] ?? 0)], [p[0] + (ax[0] ?? 0), 0.025, p[2] + (ax[2] ?? 0)], 0.045);
      for (const s of [-1, 1]) {
        const cap = this.mesh(this.geo(rod(0.026, 0.02, 14)), this.mat('rubber'));
        cap.position.set(p[0] + (ax[0] ?? 0) * s, 0.01, p[2] + (ax[2] ?? 0) * s);
      }
      this.floor.push([p[0], 0, p[2]]);
    }
  }

  // ---- Máquinas ----

  private buildRail(e: Extract<ResolvedEquipment, { kind: 'rail' }>) {
    const a = v3(e.from),
      b = v3(e.to);
    for (const s of [-1, 1]) {
      const off = new Vector3((s * e.gauge) / 2, 0, 0);
      const r = this.tube('chrome');
      stretch(r, a.clone().add(off), b.clone().add(off), 0.022);
      for (const end of [a, b]) {
        const m = this.mesh(this.geo(padGeometry(0.08, 0.08, 0.08, 0.01)), this.mat('steel'));
        m.position.copy(end).add(off);
      }
      // Pé de cada trilho até o chão, na ponta de baixo e na de cima.
      const lowEnd = a.y < b.y ? a : b;
      const highEnd = a.y < b.y ? b : a;
      const lowP = lowEnd.clone().add(off);
      const highP = highEnd.clone().add(off);
      if (lowP.y > 0.05) this.beam([lowP.x, lowP.y, lowP.z], [lowP.x, 0.03, lowP.z], 0.07);
      this.beam([highP.x, highP.y, highP.z], [highP.x, 0.03, highP.z], 0.07);
      this.beam([lowP.x, 0.03, lowP.z], [highP.x, 0.03, highP.z], 0.07);
      this.floor.push([highP.x, 0, highP.z]);
    }
    // Travessas entre os trilhos.
    for (const k of [0.02, 0.98]) {
      const p = a.clone().lerp(b, k);
      this.beam([p.x - e.gauge / 2, p.y, p.z], [p.x + e.gauge / 2, p.y, p.z], 0.05);
    }
  }

  private buildSwing(e: Extract<ResolvedEquipment, { kind: 'swing' }>) {
    const arms = [this.mesh(this.geo(padGeometry(1, 1, 1, 0.12)), this.mat('steel')), this.mesh(this.geo(padGeometry(1, 1, 1, 0.12)), this.mat('steel'))];
    const X = 0.26;
    for (const s of [-1, 1]) {
      const hub = this.mesh(this.geo(rod(0.06, 0.08, 24)), this.mat('chrome'));
      hub.rotation.z = Math.PI / 2;
      hub.position.set(e.pivot[0] + s * X, e.pivot[1] + 0.06, e.pivot[2]);
      this.beam([e.pivot[0] + s * X, e.pivot[1] + 0.06, e.pivot[2]], [e.pivot[0] + s * X, 0.03, e.pivot[2]], 0.09);
    }
    this.beam([e.pivot[0] - X, 0.03, e.pivot[2]], [e.pivot[0] + X, 0.03, e.pivot[2]], 0.08);
    this.floor.push([e.pivot[0], 0, e.pivot[2]]);
    this.updaters.push((r) => {
      if (r.kind !== 'swing') return;
      arms.forEach((m, i) => {
        const s = i === 0 ? -1 : 1;
        const p0 = new Vector3(r.pivot[0] + s * X, r.pivot[1] + 0.06, r.pivot[2]);
        const p1 = new Vector3(r.end[0] + s * X * 0.85, r.end[1], r.end[2]);
        tB.copy(p1).sub(p0);
        const len = tB.length();
        m.position.copy(p0).addScaledVector(tB, 0.5);
        m.quaternion.setFromUnitVectors(UP, tB.normalize());
        m.scale.set(0.08, len, 0.05);
      });
    });
  }

  /** Rolos de espuma; com alavanca, o braço da máquina sai do eixo (na altura do joelho) por fora da perna. */
  private buildPads(e: Extract<ResolvedEquipment, { kind: 'pad' }>) {
    const len = e.centers.length > 1 ? 0.16 : 0.34;
    const rollGeo = this.geo(rollerGeometry(0.048, len));
    const rolls = e.centers.map(() => this.mesh(rollGeo, this.mat('pad')));
    const axles = e.centers.map(() => this.mesh(this.geo(rod(0.012, len + 0.06, 12)), this.mat('chrome')));
    const lever = this.mesh(this.geo(padGeometry(1, 1, 1, 0.12)), this.mat('steel'));
    const hub = this.mesh(this.geo(rod(0.055, 0.06, 28)), this.mat('chrome'));
    const horn = this.mesh(this.geo(rod(0.025, 0.2, 18)), this.mat('chrome'));
    const plate = this.mesh(this.geo(plateGeometry(0.3, 0.03)), this.mat('iron'));
    this.updaters.push((r) => {
      if (r.kind !== 'pad') return;
      rolls.forEach((m, i) => {
        const c = r.centers[i];
        if (!c) return;
        orient(m, c, [1, 0, 0]);
        orient(axles[i] as Mesh, c, [1, 0, 0]);
      });
      const c0 = r.centers[0];
      const on = !!(r.pivot && c0);
      for (const m of [lever, hub, horn, plate]) m.visible = on;
      if (!r.pivot || !c0) return;
      // Braço da máquina por fora da perna (lado direito do sujeito = −X).
      const off = 0.22;
      const p0 = new Vector3(r.pivot[0] - off, r.pivot[1], r.pivot[2]);
      const p1 = new Vector3(c0[0] - off, c0[1], c0[2]);
      tB.copy(p1).sub(p0);
      const L = tB.length();
      lever.position.copy(p0).addScaledVector(tB, 0.5);
      lever.quaternion.setFromUnitVectors(UP, tB.clone().normalize());
      lever.scale.set(0.05, L + 0.05, 0.035);
      orient(hub, [p0.x, p0.y, p0.z], [1, 0, 0]);
      // Chifre de carga do outro lado do eixo, com uma anilha.
      tB.normalize();
      const hornAt: Vec3 = [p0.x - 0.04, p0.y - tB.y * 0.12, p0.z - tB.z * 0.12];
      orient(horn, hornAt, [1, 0, 0]);
      orient(plate, [hornAt[0] - 0.06, hornAt[1], hornAt[2]], [1, 0, 0]);
      tB.set(c0[0] - off, c0[1], c0[2]);
      tA.set(c0[0], c0[1], c0[2]);
      stretch(axles[0] as Mesh, tB, tA.clone().add(new Vector3(len / 2 + 0.02, 0, 0)), 0.012);
    });
  }

  update(f: MotionFrame, showLoad: boolean) {
    const seen = new Map<string, number>();
    for (const e of f.equipment) {
      const i = seen.get(e.kind) ?? 0;
      seen.set(e.kind, i + 1);
      for (const u of this.updaters) u(e, i, f);
    }
    const L = f.load;
    const on = showLoad && L !== null;
    this.arrowShaft.visible = on;
    this.arrowHead.visible = on;
    if (!on || !L) return;
    const len = 0.32;
    const start = L.point;
    const tip: Vec3 = [start[0] + L.dir[0] * len, start[1] + L.dir[1] * len, start[2] + L.dir[2] * len];
    stretch(this.arrowShaft, start, [start[0] + L.dir[0] * (len - 0.05), start[1] + L.dir[1] * (len - 0.05), start[2] + L.dir[2] * (len - 0.05)], 0.0035);
    tB.set(L.dir[0], L.dir[1], L.dir[2]);
    this.arrowHead.quaternion.setFromUnitVectors(UP, tB.clone().negate());
    this.arrowHead.position.set(tip[0] - L.dir[0] * 0.03, tip[1] - L.dir[1] * 0.03, tip[2] - L.dir[2] * 0.03);
    this.arrowHead.scale.set(0.014, 0.05, 0.014);
  }

  dispose() {
    this.kit.dispose();
    this.arrow.dispose();
    this.group.removeFromParent();
  }
}

/** Comprimento do cabo da pegada (média das mãos) à roldana. */
function cableLength(r: Extract<ResolvedEquipment, { kind: 'cable' }>): number {
  const g0 = r.grips[0] ?? r.pulley,
    g1 = r.grips[1] ?? g0;
  const m: Vec3 = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2, (g0[2] + g1[2]) / 2];
  return Math.hypot(r.pulley[0] - m[0], r.pulley[1] - m[1], r.pulley[2] - m[2]);
}
