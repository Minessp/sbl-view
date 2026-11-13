/**
 * Uma instância do corpo para uma vista: quatro malhas que dividem a geometria do modelo, com pose e estado
 * próprios (Lab tem uma pose por variação; o mapa de calor, duas vistas com o mesmo estado).
 */
import {
  type Camera,
  DataTexture,
  FloatType,
  Group,
  Matrix4,
  Mesh,
  NearestFilter,
  RGBAFormat,
  type ShaderMaterial,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { skinMatrices, skinPoint, type SkinMatrixOptions } from '@/engine/kinematics/skinning';
import type { EngineSkeleton, Pose } from '@/engine/kinematics/types';
import type { Palette, PaletteKey } from '../palette';
import { createBodyMaterial, STATE_ROWS, type BodyUniforms } from './material';
import { rig } from './rig';
import { LAYERS, mergeBoxes, type Box, type BodyLayer, type BodyModel } from './model';

/** Canais do estado por vaga. */
export const CH = { highlight: 0, opacity: 1, heat: 2, activation: 3, hidden: 4, bulge: 5, strain: 6 } as const;
export type Channel = keyof typeof CH;

const COLOR: Record<BodyLayer, keyof Palette> = { bone: 'body-bone', deep: 'body-muscle', superficial: 'body-muscle', skin: 'body-skin' };
/** Volume: limite da fração radial (encurtar não infla sem fim). */
const BULGE = [-0.25, 0.45] as const;

export interface LayerControl {
  /** Posição do corte (m) ao longo de `cutNormal`. Além dela: fantasma. */
  cut: number;
  /** Normal do plano de corte (mundo). Padrão (0, 1, 0): corte por altura. */
  cutNormal: readonly [number, number, number];
  ghost: number;
  alpha: number;
  /** Abaixo desta altura (m) a camada some. */
  showAbove: number;
  visible: boolean;
  /** Fração do raio da lente em que a camada sai (0 = não sai). */
  lensPeel: number;
  /** > 0: a camada só aparece dentro desta fração do raio da lente. */
  lensOnly: number;
}

export class BodyInstance {
  readonly group = new Group();
  readonly meshes: Readonly<Record<BodyLayer, Mesh>>;
  readonly layers: Readonly<Record<BodyLayer, BodyUniforms>>;
  private readonly state: Float32Array;
  private readonly texture: DataTexture;
  private readonly width: number;
  private readonly joints: Matrix4[];
  private readonly display: Record<BodyLayer, ShaderMaterial>;
  private readonly picking: Record<BodyLayer, ShaderMaterial>;
  private readonly bind: Map<string, readonly [number, number, number]>;
  private target: WebGLRenderTarget | null = null;
  /** Matrizes da última pose (12 por junta), para medir caixas posadas. */
  private matrices: Float64Array | null = null;
  /** Comprimento da linha central de cada vaga na última pose (m; 0 sem linha). */
  readonly lengths: Float32Array;
  /** Lente: centro (px do quadro, origem embaixo) e raio (px). Raio 0 = desligada. */
  readonly lens: { value: Vector3 };
  /** Montagem das fibras (≥ 2 = músculos inteiros). */
  readonly grow: { value: number };

  constructor(
    readonly model: BodyModel,
    readonly palette: Palette,
  ) {
    const n = model.slots.length;
    this.width = n;
    this.lengths = new Float32Array(n);
    this.state = new Float32Array(n * 4 * STATE_ROWS);
    this.texture = new DataTexture(this.state, n, STATE_ROWS, RGBAFormat, FloatType);
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.fill('opacity', 1);
    this.commit();
    this.joints = model.jointIds.map(() => new Matrix4());
    this.bind = new Map(model.pack.joints.map((j) => [j.id, j.origin]));
    // Lente e montagem: um objeto por instância, o mesmo nas quatro camadas.
    this.lens = { value: new Vector3(0, 0, 0) };
    this.grow = { value: 9 };
    // Luz (rig) compartilhada: as mesmas referências de uniform em todas as instâncias.
    const mk = (l: BodyLayer): BodyUniforms => ({
      ...rig,
      uJoints: { value: this.joints },
      uState: { value: this.texture },
      uStateW: { value: n },
      uColor: { value: palette[COLOR[l]] },
      uAlpha: { value: l === 'skin' ? 0.22 : 1 },
      uCut: { value: 99 },
      uCutN: { value: new Vector3(0, 1, 0) },
      uGhost: { value: 0 },
      uShowAbove: { value: -99 },
      uLens: this.lens,
      uLensK: { value: 0 },
      uLensIn: { value: 0 },
      uGrow: this.grow,
    });
    this.layers = Object.fromEntries(LAYERS.map((l) => [l, mk(l)])) as Record<BodyLayer, BodyUniforms>;
    const mat = (l: BodyLayer, pick: boolean) =>
      createBodyMaterial({ joints: model.jointIds.length, muscle: l === 'deep' || l === 'superficial', translucent: l === 'skin', pick, uniforms: this.layers[l] });
    this.display = Object.fromEntries(LAYERS.map((l) => [l, mat(l, false)])) as Record<BodyLayer, ShaderMaterial>;
    this.picking = Object.fromEntries(LAYERS.map((l) => [l, mat(l, true)])) as Record<BodyLayer, ShaderMaterial>;
    this.meshes = Object.fromEntries(
      LAYERS.map((l) => {
        const m = new Mesh(model.geometry[l], this.display[l]);
        // O skinning move os vértices no shader: a caixa da ligação não vale para o recorte.
        m.frustumCulled = false;
        m.renderOrder = l === 'skin' ? 3 : l === 'superficial' ? 2 : l === 'deep' ? 1 : 0;
        this.group.add(m);
        return [l, m];
      }),
    ) as unknown as Record<BodyLayer, Mesh>;
  }

  /** Pose do esqueleto do motor → matrizes do shader e volume de cada músculo. */
  setPose(sk: EngineSkeleton, pose: Pose, opts: Omit<SkinMatrixOptions, 'bind'> = {}) {
    const M = skinMatrices(sk, pose, this.model.jointIds, { ...opts, bind: this.bind });
    this.matrices = M;
    this.joints.forEach((m, j) => {
      const o = j * 12;
      const g = (k: number) => M[o + k] ?? 0;
      m.set(g(0), g(1), g(2), g(9), g(3), g(4), g(5), g(10), g(6), g(7), g(8), g(11), 0, 0, 0, 1);
    });
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    const tmp: [number, number, number] = [0, 0, 0];
    for (const s of this.model.slots) {
      const line = s.line;
      if (!line) continue;
      let L = 0;
      for (let k = 0; k < 16; k++) {
        b[0] = b[1] = b[2] = 0;
        for (let i = 0; i < 4; i++) {
          const w = line.weights[k * 4 + i] ?? 0;
          if (w === 0) continue;
          skinPoint(M, line.joints[k * 4 + i] ?? 0, line.points[k * 3] ?? 0, line.points[k * 3 + 1] ?? 0, line.points[k * 3 + 2] ?? 0, tmp);
          b[0] += w * tmp[0];
          b[1] += w * tmp[1];
          b[2] += w * tmp[2];
        }
        if (k > 0) L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        a[0] = b[0];
        a[1] = b[1];
        a[2] = b[2];
      }
      this.lengths[s.index] = L;
      const ratio = line.rest > 0 ? L / line.rest : 1;
      this.set(s.index, 'bulge', Math.min(BULGE[1], Math.max(BULGE[0], 1 / Math.sqrt(Math.max(ratio, 0.2)) - 1)));
    }
    this.commit();
  }

  get(slot: number, ch: Channel): number {
    const c = CH[ch];
    return this.state[(c >> 2) * this.width * 4 + slot * 4 + (c & 3)] ?? 0;
  }

  set(slot: number, ch: Channel, v: number) {
    const c = CH[ch];
    this.state[(c >> 2) * this.width * 4 + slot * 4 + (c & 3)] = v;
  }

  fill(ch: Channel, v: number, slots?: readonly number[]) {
    if (slots) for (const s of slots) this.set(s, ch, v);
    else for (let s = 0; s < this.width; s++) this.set(s, ch, v);
  }

  /** Aplica a uma camada inteira (pelas vagas dela). */
  fillLayer(layer: BodyLayer, ch: Channel, v: number) {
    for (const s of this.model.slots) if (s.layer === layer) this.set(s.index, ch, v);
  }

  /** Cor de repouso de uma camada (o mapa de calor apaga o músculo para o brilho contar a história). */
  color(l: BodyLayer, key: PaletteKey) {
    this.layers[l].uColor.value = this.palette[key];
  }

  commit() {
    this.texture.needsUpdate = true;
  }

  layer(l: BodyLayer, c: Partial<LayerControl>) {
    const u = this.layers[l];
    if (c.cut !== undefined) u.uCut.value = c.cut;
    if (c.cutNormal !== undefined) u.uCutN.value.set(...c.cutNormal);
    if (c.ghost !== undefined) u.uGhost.value = c.ghost;
    if (c.alpha !== undefined) u.uAlpha.value = c.alpha;
    if (c.showAbove !== undefined) u.uShowAbove.value = c.showAbove;
    if (c.visible !== undefined) this.meshes[l].visible = c.visible;
    if (c.lensPeel !== undefined) u.uLensK.value = c.lensPeel;
    if (c.lensOnly !== undefined) u.uLensIn.value = c.lensOnly;
  }

  /**
   * Caixa das vagas na última pose (m, mundo, sem o deslocamento das malhas). Músculo e tendão: linha central posada
   * com folga do raio; osso rígido: caixa da ligação levada pela junta do segmento; resto: caixa da ligação.
   */
  posedBox(slots: readonly number[]): Box | null {
    const M = this.matrices;
    const boxes: Box[] = [];
    const tmp: [number, number, number] = [0, 0, 0];
    const jointOf = new Map(this.model.jointIds.map((id, i) => [id, i]));
    for (const i of slots) {
      const s = this.model.slots[i];
      if (!s) continue;
      if (!M) {
        boxes.push(s.box);
        continue;
      }
      if (s.line) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        const p = [0, 0, 0];
        for (let k = 0; k < 16; k++) {
          p[0] = p[1] = p[2] = 0;
          for (let j = 0; j < 4; j++) {
            const w = s.line.weights[k * 4 + j] ?? 0;
            if (w === 0) continue;
            skinPoint(M, s.line.joints[k * 4 + j] ?? 0, s.line.points[k * 3] ?? 0, s.line.points[k * 3 + 1] ?? 0, s.line.points[k * 3 + 2] ?? 0, tmp);
            for (let a = 0; a < 3; a++) p[a] = (p[a] ?? 0) + w * (tmp[a] ?? 0);
          }
          for (let a = 0; a < 3; a++) {
            lo[a] = Math.min(lo[a] ?? 0, p[a] ?? 0);
            hi[a] = Math.max(hi[a] ?? 0, p[a] ?? 0);
          }
        }
        // A linha é o eixo: o ventre se estende para os lados (raio típico ~3 cm).
        const pad = Math.min(0.06, Math.max(0.025, Math.min(...[0, 1, 2].map((a) => s.box.size[a] ?? 0)) / 2));
        const c = (a: number) => ((lo[a] ?? 0) + (hi[a] ?? 0)) / 2;
        const d = (a: number) => (hi[a] ?? 0) - (lo[a] ?? 0) + 2 * pad;
        boxes.push({ center: [c(0), c(1), c(2)], size: [d(0), d(1), d(2)] });
        continue;
      }
      const seg = this.model.pack.parts.find((p) => p.id === s.anatomyId)?.segment;
      const segId = seg && s.side === 'l' ? seg.replace(/_r$/, '_l') : seg;
      const j = segId === undefined ? undefined : jointOf.get(segId);
      if (j === undefined) {
        boxes.push(s.box);
        continue;
      }
      skinPoint(M, j, s.box.center[0], s.box.center[1], s.box.center[2], tmp);
      boxes.push({ center: [tmp[0], tmp[1], tmp[2]], size: s.box.size });
    }
    return mergeBoxes(boxes);
  }

  /**
   * Vaga sob o pixel (x, y) de uma vista de w × h (px, origem no canto superior esquerdo), ou null.
   * Desenha só o corpo, com o material de seleção, num alvo de 1 × 1.
   */
  pick(gl: WebGLRenderer, camera: Camera & { setViewOffset?: (...a: number[]) => void; clearViewOffset?: () => void; updateProjectionMatrix?: () => void }, x: number, y: number, w: number, h: number): number | null {
    if (!camera.setViewOffset || !camera.clearViewOffset) return null;
    this.target ??= new WebGLRenderTarget(1, 1);
    for (const l of LAYERS) this.meshes[l].material = this.picking[l];
    const skinVisible = this.meshes.skin.visible;
    this.meshes.skin.visible = false;
    camera.setViewOffset(w, h, Math.floor(x), Math.floor(y), 1, 1);
    // No alvo 1 × 1 o pixel escolhido fica em (0,5; 0,5): a lente, centrada no ponteiro, vai junto.
    const lx = this.lens.value.x, ly = this.lens.value.y;
    this.lens.value.x = 0.5;
    this.lens.value.y = 0.5;
    const prevTarget = gl.getRenderTarget();
    const prevScissor = gl.getScissorTest();
    gl.setScissorTest(false);
    gl.setRenderTarget(this.target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.group, camera);
    const px = new Uint8Array(4);
    gl.readRenderTargetPixels(this.target, 0, 0, 1, 1, px);
    gl.setRenderTarget(prevTarget);
    gl.setScissorTest(prevScissor);
    camera.clearViewOffset();
    this.lens.value.x = lx;
    this.lens.value.y = ly;
    this.meshes.skin.visible = skinVisible;
    for (const l of LAYERS) this.meshes[l].material = this.display[l];
    const id = (px[0] ?? 0) + (px[1] ?? 0) * 256;
    return id > 0 && id <= this.width ? id - 1 : null;
  }

  dispose() {
    for (const l of LAYERS) {
      this.display[l].dispose();
      this.picking[l].dispose();
    }
    this.texture.dispose();
    this.target?.dispose();
    this.group.removeFromParent();
  }
}
