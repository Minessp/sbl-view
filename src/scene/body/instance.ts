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
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { skinMatrices, skinPoint, type SkinMatrixOptions } from '@/engine/kinematics/skinning';
import type { EngineSkeleton, Pose } from '@/engine/kinematics/types';
import type { Palette, PaletteKey } from '../palette';
import { createBodyMaterial, STATE_ROWS, type BodyUniforms } from './material';
import { rig } from './rig';
import { detailFor, screenHeightPx, type Detail } from '../anatomy/lod';
import { LAYERS, mergeBoxes, type Box, type BodyLayer, type BodyModel } from './model';

/** Canais do estado por vaga. */
export const CH = { highlight: 0, opacity: 1, heat: 2, activation: 3, hidden: 4, bulge: 5, strain: 6, ends: 7 } as const;
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

const BODY_HEIGHT = 1.75;
const VIEWPORT = new Vector4();
const CENTER = new Vector3();
const EYE = new Vector3();

export class BodyInstance {
  readonly group = new Group();
  readonly meshes: Readonly<Record<BodyLayer, Mesh>>;
  /** Material do pré-passe de profundidade da pele (descartado junto no `dispose`). */
  private skinDepth: ShaderMaterial | undefined;
  /** Passe de vidro de cada camada sólida (filho da malha; só visível com `setGlass(true)`). */
  private readonly glassMeshes: Mesh[] = [];
  /** Opacidade abaixo de 1 vira vidro em vez de pontilhado. */
  readonly glass = { value: 0 };
  readonly layers: Readonly<Record<BodyLayer, BodyUniforms>>;
  private readonly state: Float32Array;
  private readonly texture: DataTexture;
  private readonly width: number;
  private readonly joints: Matrix4[];
  private readonly display: Record<BodyLayer, ShaderMaterial>;
  private readonly picking: Record<BodyLayer, ShaderMaterial>;
  private readonly bind: Map<string, readonly [number, number, number]>;
  private target: WebGLRenderTarget | null = null;
  private grid: WebGLRenderTarget | null = null;
  private lockDetail = false;
  /** Matrizes da última pose (12 por junta), para medir caixas posadas. */
  private matrices: Float64Array | null = null;
  /** Comprimento da linha central de cada vaga na última pose (m; 0 sem linha). */
  readonly lengths: Float32Array;
  /** Lente: centro (px do quadro, origem embaixo) e raio (px). Raio 0 = desligada. */
  readonly lens: { value: Vector3 };
  /** Montagem das fibras (≥ 2 = músculos inteiros). */
  readonly grow: { value: number };
  /** LOD por distância: nível alto ou o leve do primeiro quadro, pela altura do corpo nesta vista. */
  private detail: Detail = 'full';
  /** Avisado quando a malha da vista muda (a troca vale a partir do próximo quadro: quem usa pede um quadro). */
  onDetailChange: (() => void) | null = null;

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
      uGlass: this.glass,
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
        m.renderOrder = l === 'skin' ? 4 : l === 'superficial' ? 2 : l === 'deep' ? 1 : 0;
        this.group.add(m);
        if (l === 'skin') {
          // Pele translúcida sem escrever profundidade desenhava pele contra pele na ordem dos triângulos (tronco por cima
          // do braço, de perfil). Pré-passe só de profundidade, com o mesmo shader (mesmos descartes de lente e corte):
          // a cor depois só passa na superfície mais próxima. Filho da pele: some junto com ela (camada, seleção).
          const depth = mat(l, false);
          depth.colorWrite = false;
          depth.depthWrite = true;
          const pre = new Mesh(model.geometry[l], depth);
          pre.frustumCulled = false;
          pre.renderOrder = 3;
          m.add(pre);
          this.skinDepth = depth;
        } else {
          // Depois das camadas sólidas e antes do pré-passe da pele (a pele por cima tapa o vidro de dentro).
          const g = new Mesh(model.geometry[l], createBodyMaterial({ joints: model.jointIds.length, muscle: l !== 'bone', translucent: false, pick: false, glass: true, uniforms: this.layers[l] }));
          g.frustumCulled = false;
          g.renderOrder = 2.5;
          g.visible = false;
          m.add(g);
          this.glassMeshes.push(g);
        }
        m.onBeforeRender = (renderer, _scene, camera) => this.checkDetail(renderer, camera);
        return [l, m];
      }),
    ) as unknown as Record<BodyLayer, Mesh>;
  }

  /**
   * Mede a altura do corpo na vista que está desenhando (viewport atual, px físicos) e escolhe a malha. Roda no
   * `onBeforeRender` de cada camada; a seleção (alvo 1 × 1) não conta. Trocar a geometria aqui só vale no próximo
   * quadro (a lista deste já foi montada), por isso o aviso.
   */
  private checkDetail(renderer: WebGLRenderer, camera: Camera) {
    // Seleção (alvo 1 × 1), sombra e reflexo não decidem o nível; o alvo HDR do pipeline de cinema decide (tamanho da tela).
    if (this.model.base === this.model.geometry || this.lockDetail || (renderer.getRenderTarget() !== null && renderer.getRenderTarget() === this.target)) return;
    renderer.getCurrentViewport(VIEWPORT);
    this.group.getWorldPosition(CENTER);
    CENTER.y += BODY_HEIGHT / 2;
    const dist = camera.getWorldPosition(EYE).distanceTo(CENTER);
    const c = camera as Camera & { isPerspectiveCamera?: boolean; isOrthographicCamera?: boolean; fov?: number; zoom?: number; top?: number; bottom?: number };
    const zoom = c.zoom ?? 1;
    const px = c.isOrthographicCamera
      ? screenHeightPx({ viewportPx: VIEWPORT.w, size: BODY_HEIGHT, dist, orthoSpan: ((c.top ?? 1) - (c.bottom ?? -1)) / zoom })
      : screenHeightPx({ viewportPx: VIEWPORT.w, size: BODY_HEIGHT, dist, fovDeg: (2 * Math.atan(Math.tan(((c.fov ?? 28) * Math.PI) / 360) / zoom) * 180) / Math.PI });
    const next = detailFor(this.detail, px);
    if (next === this.detail) return;
    this.detail = next;
    this.syncGeometry();
    this.onDetailChange?.();
  }

  /** Troca de nível: as malhas (e o pré-passe da pele) passam a usar a geometria atual do modelo. */
  syncGeometry() {
    const g = this.detail === 'base' ? this.model.base : this.model.geometry;
    for (const l of LAYERS) {
      const m = this.meshes[l];
      m.geometry = g[l];
      for (const c of m.children) if (c instanceof Mesh) c.geometry = g[l];
    }
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

  /** Vidro no lugar do pontilhado (opacidade abaixo de 1). */
  setGlass(on: boolean) {
    this.glass.value = on ? 1 : 0;
    for (const g of this.glassMeshes) g.visible = on;
  }

  /** Seleção e silhueta não podem misturar cor: o vidro sai durante o passe. */
  private withoutGlass(run: () => void) {
    const on = this.glass.value > 0.5;
    for (const g of this.glassMeshes) g.visible = false;
    run();
    for (const g of this.glassMeshes) g.visible = on;
  }

  /** Silhueta do corpo (material de seleção, sem lente) no alvo atual: mapa de sombra. */
  renderSilhouette(gl: WebGLRenderer, camera: Camera) {
    this.withoutGlass(() => this.silhouette(gl, camera));
  }

  private silhouette(gl: WebGLRenderer, camera: Camera) {
    for (const l of LAYERS) this.meshes[l].material = this.picking[l];
    const r = this.lens.value.z;
    this.lens.value.z = 0;
    this.lockDetail = true;
    gl.render(this.group, camera);
    this.lockDetail = false;
    this.lens.value.z = r;
    for (const l of LAYERS) this.meshes[l].material = this.display[l];
  }

  /** Reflexo no chão (plano y = 0): o grupo espelhado em Y, desenhado com os materiais normais no alvo atual. */
  renderMirror(gl: WebGLRenderer, camera: Camera) {
    const r = this.lens.value.z;
    this.lens.value.z = 0;
    const sy = this.group.scale.y;
    this.group.scale.y = -sy;
    this.lockDetail = true;
    gl.render(this.group, camera);
    this.lockDetail = false;
    this.group.scale.y = sy;
    this.group.updateMatrixWorld();
    this.lens.value.z = r;
  }

  /**
   * Vaga sob o pixel (x, y) de uma vista de w × h (px, origem no canto superior esquerdo), ou null.
   * Desenha só o corpo, com o material de seleção, num alvo de 1 × 1.
   */
  /** Ponto k (0 origem … 15 inserção) da linha central posada da vaga (m, mundo, sem o deslocamento das malhas). */
  linePoint(slot: number, k: number, out: [number, number, number]): boolean {
    const line = this.model.slots[slot]?.line;
    const M = this.matrices;
    if (!line || !M) return false;
    const tmp: [number, number, number] = [0, 0, 0];
    out[0] = out[1] = out[2] = 0;
    for (let i = 0; i < 4; i++) {
      const w = line.weights[k * 4 + i] ?? 0;
      if (w === 0) continue;
      skinPoint(M, line.joints[k * 4 + i] ?? 0, line.points[k * 3] ?? 0, line.points[k * 3 + 1] ?? 0, line.points[k * 3 + 2] ?? 0, tmp);
      out[0] += w * tmp[0];
      out[1] += w * tmp[1];
      out[2] += w * tmp[2];
    }
    return true;
  }

  /**
   * Passe de seleção na vista inteira numa grade gw × gh (sem a pele): vaga + 1 por célula, 0 = nada; linha 0 embaixo.
   * Um desenho só dá a área visível de cada estrutura (rótulos vivos).
   */
  pickGrid(gl: WebGLRenderer, camera: Camera, gw: number, gh: number): Uint16Array {
    const grid = (this.grid ??= new WebGLRenderTarget(gw, gh));
    if (grid.width !== gw || grid.height !== gh) grid.setSize(gw, gh);
    const px = new Uint8Array(gw * gh * 4);
    this.pickPass(gl, camera, grid, () => gl.readRenderTargetPixels(grid, 0, 0, gw, gh, px));
    const ids = new Uint16Array(gw * gh);
    for (let i = 0; i < ids.length; i++) {
      const id = (px[i * 4] ?? 0) + (px[i * 4 + 1] ?? 0) * 256;
      ids[i] = id <= this.width ? id : 0;
    }
    return ids;
  }

  private pickPass(gl: WebGLRenderer, camera: Camera, target: WebGLRenderTarget, read: () => void) {
    this.withoutGlass(() => this.pickPassRaw(gl, camera, target, read));
  }

  private pickPassRaw(gl: WebGLRenderer, camera: Camera, target: WebGLRenderTarget, read: () => void) {
    for (const l of LAYERS) this.meshes[l].material = this.picking[l];
    const skinVisible = this.meshes.skin.visible;
    this.meshes.skin.visible = false;
    const prevTarget = gl.getRenderTarget();
    const prevScissor = gl.getScissorTest();
    gl.setScissorTest(false);
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.group, camera);
    read();
    gl.setRenderTarget(prevTarget);
    gl.setScissorTest(prevScissor);
    this.meshes.skin.visible = skinVisible;
    for (const l of LAYERS) this.meshes[l].material = this.display[l];
  }

  pick(gl: WebGLRenderer, camera: Camera & { setViewOffset?: (...a: number[]) => void; clearViewOffset?: () => void; updateProjectionMatrix?: () => void }, x: number, y: number, w: number, h: number): number | null {
    if (!camera.setViewOffset || !camera.clearViewOffset) return null;
    const target = (this.target ??= new WebGLRenderTarget(1, 1));
    camera.setViewOffset(w, h, Math.floor(x), Math.floor(y), 1, 1);
    // No alvo 1 × 1 o pixel escolhido fica em (0,5; 0,5): a lente, centrada no ponteiro, vai junto.
    const lx = this.lens.value.x, ly = this.lens.value.y;
    this.lens.value.x = 0.5;
    this.lens.value.y = 0.5;
    const px = new Uint8Array(4);
    this.pickPass(gl, camera, target, () => gl.readRenderTargetPixels(target, 0, 0, 1, 1, px));
    camera.clearViewOffset();
    this.lens.value.x = lx;
    this.lens.value.y = ly;
    const id = (px[0] ?? 0) + (px[1] ?? 0) * 256;
    return id > 0 && id <= this.width ? id - 1 : null;
  }

  /**
   * Volta ao estado de quando nasceu, menos a pose (fundo de instâncias: a cena que entra herda o corpo da que saiu,
   * na mesma pose, e aplica o próprio visual por cima).
   */
  reset() {
    for (let s = 0; s < this.width; s++) {
      for (const ch of ['highlight', 'heat', 'activation', 'hidden', 'strain', 'ends'] as const) this.set(s, ch, 0);
      this.set(s, 'opacity', 1);
    }
    this.commit();
    for (const l of LAYERS) {
      this.layer(l, { cut: 99, cutNormal: [0, 1, 0], ghost: 0, alpha: l === 'skin' ? 0.22 : 1, showAbove: -99, visible: true, lensPeel: 0, lensOnly: 0 });
      this.color(l, COLOR[l]);
      this.meshes[l].position.set(0, 0, 0);
    }
    this.lens.value.set(0, 0, 0);
    this.grow.value = 9;
    this.setGlass(false);
  }

  dispose() {
    for (const l of LAYERS) {
      this.display[l].dispose();
      this.picking[l].dispose();
    }
    this.skinDepth?.dispose();
    for (const g of this.glassMeshes) (g.material as ShaderMaterial).dispose();
    this.texture.dispose();
    this.target?.dispose();
    this.grid?.dispose();
    this.group.removeFromParent();
  }
}
