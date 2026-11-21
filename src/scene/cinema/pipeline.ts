/**
 * Pipeline de cinema: as vistas desenham num alvo HDR (meio float, MSAA, profundidade em textura) em vez da tela;
 * no fim do quadro, os passes fazem oclusão, profundidade de campo, bloom, feixe e a composição na tela.
 * Funciona com as `View` recortadas do drei porque elas não trocam o alvo: só viewport e tesoura (px CSS × DPR,
 * o mesmo tamanho do alvo).
 */
import {
  BufferGeometry,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  NoBlending,
  AdditiveBlending,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type IUniform,
  type WebGLRenderer,
} from 'three';
import type { Effects } from '../perf/tiers';
import { AO_BLUR_FS, AO_FS, BLOOM_DOWN_FS, BLOOM_UP_FS, COMPOSITE_FS, DOF_FS, FXAA_FS, QUAD_VS, RAYS_FS } from './shaders';
import { cinema } from './state';

const BLOOM_LEVELS = 6;

function target(w: number, h: number, opts: { depth?: boolean; samples?: number } = {}) {
  const t = new WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: !!opts.depth,
    samples: opts.samples ?? 0,
  });
  if (opts.depth) {
    t.depthTexture = new DepthTexture(Math.max(1, w), Math.max(1, h), UnsignedIntType);
    t.resolveDepthBuffer = true;
  }
  return t;
}

const pass = (fs: string, uniforms: Record<string, IUniform>, additive = false) =>
  new ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, blending: additive ? AdditiveBlending : NoBlending, transparent: additive });

export interface FrameParams {
  readonly fx: Effects;
  readonly dt: number;
  readonly time: number;
  readonly lightTheme: boolean;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
  readonly rimColor: Vector3;
  readonly keyColor: Vector3;
}

export class CinemaPipeline {
  private w = 0;
  private h = 0;
  private scene: WebGLRenderTarget | null = null;
  private dof: WebGLRenderTarget | null = null;
  private ao: WebGLRenderTarget | null = null;
  private aoBlur: WebGLRenderTarget | null = null;
  private rays: WebGLRenderTarget | null = null;
  private ldr: WebGLRenderTarget | null = null;
  private readonly fxaaM: ShaderMaterial;
  private readonly fxaaSrc = { value: null as unknown };
  private readonly fxaaTexel = { value: new Vector2() };
  private unpatch: (() => void) | null = null;
  private bloom: WebGLRenderTarget[] = [];
  private readonly quad: Mesh;
  private readonly qscene = new Scene();
  private readonly empty = new Scene();
  private readonly qcam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new Vector2();
  private readonly tmp = new Vector3();
  private readonly projInv = new Matrix4();

  private readonly depthU = {
    tDepth: { value: null as unknown },
    uNearFar: { value: new Vector2(0.1, 30) },
    uRect: { value: new Vector4(0, 0, 0, 0) },
    uFull: { value: new Vector2(1, 1) },
    uFocus: { value: 3 },
    uCocScale: { value: 0 },
    uCocMax: { value: 16 },
    uPull: { value: 0 },
  };
  private readonly u = {
    dofColor: { value: null as unknown },
    projScale: { value: 500 },
    aoTex: { value: null as unknown },
    aoHalf: { value: new Vector2(1, 1) },
    downSrc: { value: null as unknown },
    downTexel: { value: new Vector2() },
    downFirst: { value: 0 },
    upSrc: { value: null as unknown },
    upTexel: { value: new Vector2() },
    upWeight: { value: 0.85 },
    raysColor: { value: null as unknown },
    raysLight: { value: new Vector2(0.5, 0.9) },
    raysAspect: { value: 1 },
    raysTint: { value: new Vector3(1, 0.8, 0.6) },
    raysStrength: { value: 0 },
    cColor: { value: null as unknown },
    cDof: { value: null as unknown },
    cAo: { value: null as unknown },
    cBloom: { value: null as unknown },
    cRays: { value: null as unknown },
    useDof: { value: 0 },
    useAo: { value: 0 },
    useBloom: { value: 0 },
    useRays: { value: 0 },
    bloomK: { value: 0.3 },
    time: { value: 0 },
    lightTheme: { value: 0 },
  };
  private readonly dofM: ShaderMaterial;
  private readonly aoM: ShaderMaterial;
  private readonly aoBlurM: ShaderMaterial;
  private readonly downM: ShaderMaterial;
  private readonly upM: ShaderMaterial;
  private readonly raysM: ShaderMaterial;
  private readonly compM: ShaderMaterial;

  constructor(private readonly msaa: number) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new Mesh(g);
    this.quad.frustumCulled = false;
    this.qscene.add(this.quad);
    const d = this.depthU;
    const u = this.u;
    this.dofM = pass(DOF_FS, { ...d, tColor: u.dofColor });
    this.aoM = pass(AO_FS, { ...d, uProjInv: { value: this.projInv }, uProjScale: u.projScale, uRadius: { value: 0.05 }, uIntensity: { value: 1.2 } });
    this.aoBlurM = pass(AO_BLUR_FS, { tAo: u.aoTex, tDepth: d.tDepth, uHalf: u.aoHalf });
    this.downM = pass(BLOOM_DOWN_FS, { tSrc: u.downSrc, uSrcTexel: u.downTexel, uFirst: u.downFirst, uThreshold: { value: new Vector2(1.35, 0.5) } });
    this.upM = pass(BLOOM_UP_FS, { tSrc: u.upSrc, uSrcTexel: u.upTexel, uRadius: { value: 1 }, uWeight: u.upWeight }, true);
    this.raysM = pass(RAYS_FS, {
      tColor: u.raysColor,
      uLight: u.raysLight,
      uAspect: u.raysAspect,
      uSpread: { value: 0.14 },
      uTint: u.raysTint,
      uStrength: u.raysStrength,
      uRect: d.uRect,
      uFull: d.uFull,
    });
    this.fxaaM = pass(FXAA_FS, { tSrc: this.fxaaSrc, uTexel: this.fxaaTexel });
    this.compM = pass(COMPOSITE_FS, {
      ...d,
      tColor: u.cColor,
      tDof: u.cDof,
      tAo: u.cAo,
      tBloom: u.cBloom,
      tRays: u.cRays,
      uUseDof: u.useDof,
      uUseAo: u.useAo,
      uUseBloom: u.useBloom,
      uUseRays: u.useRays,
      uBloom: u.bloomK,
      uCA: { value: 0.0025 },
      uGrain: { value: 0.035 },
      uTime: u.time,
      uLightTheme: u.lightTheme,
    });
  }

  private resize(w: number, h: number) {
    if (w === this.w && h === this.h && this.scene) return;
    this.disposeTargets();
    this.w = w;
    this.h = h;
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    this.scene = target(w, h, { depth: true, samples: this.msaa });
    this.dof = target(hw, hh);
    this.ao = target(hw, hh);
    this.aoBlur = target(hw, hh);
    this.rays = target(hw, hh);
    this.ldr = new WebGLRenderTarget(w, h, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.bloom = [];
    let bw = hw, bh = hh;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      this.bloom.push(target(bw, bh));
      bw = Math.max(1, Math.ceil(bw / 2));
      bh = Math.max(1, Math.ceil(bh / 2));
    }
  }

  /** Começo do quadro: as vistas passam a desenhar no alvo HDR. */
  begin(gl: WebGLRenderer) {
    this.patch(gl);
    gl.getDrawingBufferSize(this.size);
    this.resize(this.size.x, this.size.y);
    gl.setRenderTarget(this.scene);
    gl.setScissorTest(false);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, true);
  }

  /**
   * Num alvo de render o three não multiplica viewport e tesoura pelo DPR (só na tela). As `View` passam px CSS:
   * com DPR ≠ 1 desenhavam encolhidas no canto do alvo HDR. Enquanto o alvo HDR está ligado, escala pelo DPR.
   */
  private patch(gl: WebGLRenderer) {
    if (this.unpatch) return;
    const setViewport = gl.setViewport.bind(gl);
    const setScissor = gl.setScissor.bind(gl);
    const scaled = (fn: (x: number, y: number, w: number, h: number) => void) =>
      ((x: number | Vector4, y?: number, w?: number, h?: number) => {
        const v = typeof x === 'number' ? [x, y ?? 0, w ?? 0, h ?? 0] : [x.x, x.y, x.z, x.w];
        const k = gl.getRenderTarget() === this.scene && this.scene ? gl.getPixelRatio() : 1;
        fn((v[0] ?? 0) * k, (v[1] ?? 0) * k, (v[2] ?? 0) * k, (v[3] ?? 0) * k);
      }) as WebGLRenderer['setViewport'];
    gl.setViewport = scaled(setViewport);
    gl.setScissor = scaled(setScissor);
    this.unpatch = () => {
      gl.setViewport = setViewport;
      gl.setScissor = setScissor;
    };
  }

  private draw(gl: WebGLRenderer, m: ShaderMaterial, t: WebGLRenderTarget | null) {
    this.quad.material = m;
    gl.setRenderTarget(t);
    gl.render(this.qscene, this.qcam);
  }

  /** Fim do quadro: passes e composição na tela. */
  end(gl: WebGLRenderer, p: FrameParams) {
    const scene = this.scene, dof = this.dof, ao = this.ao, aoBlur = this.aoBlur, rays = this.rays;
    if (!scene || !dof || !ao || !aoBlur || !rays) return;
    const fx = { ...p.fx, ...cinema.force };
    const autoClear = gl.autoClear;
    // Resolve o MSAA inteiro (cada vista resolveu só dentro da própria tesoura).
    gl.setRenderTarget(scene);
    gl.setScissorTest(false);
    gl.autoClear = false;
    gl.render(this.empty, this.qcam);
    gl.autoClear = true;

    const d = this.depthU;
    d.tDepth.value = scene.depthTexture;
    d.uFull.value.set(this.w, this.h);
    const k = 1 - Math.exp(-p.dt * 7);
    cinema.focus += (cinema.focusGoal - cinema.focus) * k;
    cinema.aperture += (cinema.apertureGoal - cinema.aperture) * k;
    const main = performance.now() - cinema.seen < 500 ? cinema.main : null;
    const ph = this.h;
    if (main) {
      const cam = main.camera;
      const r = main.rect;
      d.uRect.value.set(r.x * p.dpr, ph - (r.y + r.h) * p.dpr, r.w * p.dpr, r.h * p.dpr);
      d.uNearFar.value.set(cam.near, cam.far);
      d.uFocus.value = cinema.focus;
      // Círculo de confusão em px: proporcional à altura da vista (a mesma lente em qualquer tela).
      d.uCocMax.value = Math.min(22, Math.max(8, (r.h * p.dpr) / 60));
      d.uCocScale.value = cinema.aperture * (r.h * p.dpr) / 36;
      d.uPull.value = cinema.pull;
    } else {
      d.uRect.value.set(0, 0, 0, 0);
      d.uPull.value = 0;
    }
    const dofOn = fx.dof && !!main;
    const aoOn = fx.ao && !!main;
    const raysOn = fx.rays && !!main && cinema.beamK > 0.01 && !p.lightTheme;

    const u = this.u;
    if (dofOn) {
      u.dofColor.value = scene.texture;
      this.draw(gl, this.dofM, dof);
    }
    if (aoOn && main) {
      const cam = main.camera;
      this.projInv.copy(cam.projectionMatrixInverse);
      u.projScale.value = (main.rect.h * p.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
      this.draw(gl, this.aoM, ao);
      u.aoTex.value = ao.texture;
      u.aoHalf.value.set(ao.width, ao.height);
      this.draw(gl, this.aoBlurM, aoBlur);
    }
    if (fx.bloom) {
      let src = scene.texture;
      let sw = this.w, sh = this.h;
      for (let i = 0; i < this.bloom.length; i++) {
        const t = this.bloom[i];
        if (!t) break;
        u.downSrc.value = src;
        u.downTexel.value.set(1 / sw, 1 / sh);
        u.downFirst.value = i === 0 ? 1 : 0;
        this.draw(gl, this.downM, t);
        src = t.texture;
        sw = t.width;
        sh = t.height;
      }
      gl.autoClear = false;
      for (let i = this.bloom.length - 2; i >= 0; i--) {
        const from = this.bloom[i + 1], to = this.bloom[i];
        if (!from || !to) continue;
        u.upSrc.value = from.texture;
        u.upTexel.value.set(1 / from.width, 1 / from.height);
        this.draw(gl, this.upM, to);
      }
      gl.autoClear = true;
    }
    if (raysOn && main) {
      const cam = main.camera;
      const v = this.tmp.set(...cinema.beam).project(cam);
      const r = main.rect;
      // Da vista para o alvo cheio (uv).
      const lx = ((r.x + (v.x * 0.5 + 0.5) * r.w) * p.dpr) / this.w;
      const ly = (ph - (r.y + (1 - (v.y * 0.5 + 0.5)) * r.h) * p.dpr) / this.h;
      u.raysLight.value.set(lx, ly);
      u.raysAspect.value = this.w / this.h;
      u.raysColor.value = scene.texture;
      u.raysStrength.value = 0.16 * cinema.beamK;
      u.raysTint.value.copy(p.keyColor).lerp(p.rimColor, 0.35);
      this.draw(gl, this.raysM, rays);
    }

    u.cColor.value = scene.texture;
    u.cDof.value = dof.texture;
    u.cAo.value = aoBlur.texture;
    u.cBloom.value = this.bloom[0]?.texture ?? null;
    u.cRays.value = rays.texture;
    u.useDof.value = dofOn ? 1 : 0;
    u.useAo.value = aoOn ? 1 : 0;
    // Claro: luz somada sobre o ciclorama vira véu branco na silhueta.
    u.useBloom.value = fx.bloom && !p.lightTheme ? 1 : 0;
    u.useRays.value = raysOn ? 1 : 0;
    u.bloomK.value = p.lightTheme ? 0.1 : 0.24;
    u.time.value = p.time;
    u.lightTheme.value = p.lightTheme ? 1 : 0;
    const ldr = this.ldr;
    this.draw(gl, this.compM, ldr);
    this.fxaaSrc.value = ldr?.texture ?? null;
    this.fxaaTexel.value.set(1 / this.w, 1 / this.h);
    gl.setRenderTarget(null);
    gl.setViewport(0, 0, p.cssWidth, p.cssHeight);
    gl.setScissorTest(false);
    this.draw(gl, this.fxaaM, null);
    gl.autoClear = autoClear;
  }

  private disposeTargets() {
    for (const t of [this.scene, this.dof, this.ao, this.aoBlur, this.rays, this.ldr, ...this.bloom]) {
      t?.depthTexture?.dispose();
      t?.dispose();
    }
    this.bloom = [];
  }

  dispose() {
    this.unpatch?.();
    this.unpatch = null;
    this.disposeTargets();
    this.quad.geometry.dispose();
    for (const m of [this.dofM, this.aoM, this.aoBlurM, this.downM, this.upM, this.raysM, this.compM, this.fxaaM]) m.dispose();
  }
}
