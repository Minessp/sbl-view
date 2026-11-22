/**
 * Cenário do estúdio, dentro de uma vista: chão escuro que some na penumbra, com a sombra projetada da key (mapa de
 * profundidade desenhado pela luz, penumbra que abre com a distância ao pé, estilo PCSS) e o reflexo do corpo (passe
 * espelhado em resolução cheia, desfocado e apagado com a distância ao chão); softboxes ao fundo, longe o bastante para a profundidade
 * de campo as abrir em luz desfocada. A key (rig.uKeyDir) mora no espaço da câmera: a sombra acompanha a vista.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  DepthTexture,
  DoubleSide,
  HalfFloatType,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three';
import type { BodyInstance } from '../body/instance';
import { LIGHT_GLSL } from '../body/material';
import { palette, rig } from '../body/rig';
import { cinema } from '../cinema/state';

const SHADOW_SIZE = 1024;
const SHADOW_SPAN = 1.7;
const FLOOR_R = 5;

const FLOOR_VS = /* glsl */ `
  varying vec3 vW;
  varying vec3 vView;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FLOOR_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform sampler2D tShadow;
  uniform sampler2D tReflect;
  uniform sampler2D tReflDepth;
  uniform mat4 uProjInv;
  uniform mat4 uCamWorld;
  uniform mat4 uLightVP;
  uniform float uUseShadow;
  uniform float uUseReflect;
  uniform vec4 uViewport;
  uniform vec2 uCenter;
  uniform float uFade;
  uniform float uReflectK;
  uniform float uShadowK;
  uniform float uFloorK;
  varying vec3 vW;
  varying vec3 vView;
  ${LIGHT_GLSL}

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec2 disk(int i, float spin) {
    float a = float(i) * 2.39996323 + spin;
    float r = sqrt((float(i) + 0.5) / 16.0);
    return vec2(cos(a), sin(a)) * r;
  }

  float shadowAt(vec3 w) {
    vec4 l = uLightVP * vec4(w, 1.0);
    vec3 p = l.xyz / l.w * 0.5 + 0.5;
    if (p.x <= 0.0 || p.y <= 0.0 || p.x >= 1.0 || p.y >= 1.0) return 1.0;
    float spin = ign(gl_FragCoord.xy) * 6.2831853;
    // Busca do bloqueador: profundidade média de quem tapa a luz.
    float blk = 0.0, nb = 0.0;
    for (int i = 0; i < 16; i++) {
      float d = texture2D(tShadow, p.xy + disk(i, spin) * 0.03).r;
      if (d < p.z - 0.002) { blk += d; nb += 1.0; }
    }
    if (nb < 0.5) return 1.0;
    blk /= nb;
    // Penumbra pela distância receptor–bloqueador (no espaço da luz: 1 unidade = profundidade da câmera da luz).
    float pen = clamp((p.z - blk) * 0.55, 0.0015, 0.045);
    float lit = 0.0;
    for (int i = 0; i < 16; i++) {
      float d = texture2D(tShadow, p.xy + disk(i, spin + 1.7) * pen).r;
      lit += d < p.z - 0.002 ? 0.0 : 1.0;
    }
    return lit / 16.0;
  }

  void main() {
    float r = length(vW.xz - uCenter);
    float fade = 1.0 - smoothstep(0.9, 3.4 * uFade, r);
    if (fade <= 0.001) discard;
    vec3 n = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 v = normalize(-vView);
    // Concreto escuro e liso: grão fino quase imperceptível. Só key e ambiente (a contraluz rasante clareava o chão todo).
    vec3 albedo = toLinear(uColor) * uFloorK * (0.92 + 0.08 * hash(floor(vW.xz * 400.0)));
    float keyOn = smoothstep(0.25, 1.0, uLight);
    float ndl = max(dot(n, normalize(uKeyDir)), 0.0);
    // Poça da key: mais luz perto do corpo, caindo para a penumbra.
    float pool = exp(-r * r * 0.35);
    vec3 col = albedo * (toLinear(uKeyColor) * keyOn * ndl * (0.35 + 0.9 * pool) + toLinear(uGround) * uAmbient * 0.6);
    float sh = uUseShadow > 0.5 ? shadowAt(vW) : 1.0;
    col *= mix(1.0 - uShadowK, 1.0, sh);
    if (uUseReflect > 0.5) {
      vec2 uv = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw;
      // Altura do ponto refletido (reconstruída da profundidade, no mundo): rente ao pé nítido e forte, longe borrado e fraco.
      float zf = -vView.z;
      float dr = texture2D(tReflDepth, uv).r;
      vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, dr * 2.0 - 1.0, 1.0);
      vec3 wr = (uCamWorld * vec4(vp.xyz / vp.w, 1.0)).xyz;
      float gap = dr >= 0.99999 ? 9.0 : max(-wr.y, 0.0);
      float rpx = clamp(gap * 0.12 * uViewport.w / zf, 0.5, 28.0);
      vec2 px = 1.0 / uViewport.zw;
      float spin = ign(gl_FragCoord.xy) * 6.2831853;
      vec4 refl = vec4(0.0);
      for (int i = 0; i < 16; i++) refl += texture2D(tReflect, uv + disk(i, spin) * rpx * px);
      refl /= 16.0;
      float fres = 0.08 + 0.92 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
      col += refl.rgb * uReflectK * mix(0.35, 1.0, fres) * sh * exp(-gap * 2.6);
    }
    gl_FragColor = vec4(finish(col) * fade, fade);
    // Claro (high-key): o chão é o próprio ciclorama (CSS atrás do canvas); aqui só a sombra projetada. Chão opaco ficava
    // cinza com borda, um segundo horizonte sobre o fundo.
    if (uRimMode > 0.5) gl_FragColor = vec4(finish(vec3(0.09, 0.06, 0.045)), (1.0 - sh) * uShadowK * fade);
  }
`;

const BOX_FS = /* glsl */ `
  uniform vec3 uTint;
  uniform float uPower;
  varying vec2 vUv;
  ${LIGHT_GLSL}
  void main() {
    vec2 q = abs(vUv - 0.5) * 2.0;
    // Sempre fora de foco: borda larga e gaussiana (a lente abre a luz da softbox), centro mais forte.
    vec2 e = max(q - vec2(0.35, 0.6), 0.0) / vec2(0.65, 0.4);
    float edge = exp(-dot(e, e) * 3.2);
    float core = 0.7 + 0.3 * (1.0 - q.x * q.x);
    vec3 c = toLinear(uTint) * uPower * core * edge * smoothstep(0.0, 0.8, uLight);
    gl_FragColor = vec4(finish(c) * edge, edge);
  }
`;

const BOX_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Softboxes: posição, tamanho e cor (key quente à esquerda, contraluz fria à direita), longe atrás do corpo. */
const BOXES = [
  { p: [-1.25, 1.75, -5.5], s: [1.0, 3.6], yaw: 0.2, warm: true, power: 0.85 },
  { p: [2.1, 2.1, -6.5], s: [0.8, 4.4], yaw: -0.25, warm: false, power: 0.8 },
] as const;

export interface ShadowCaster {
  render(gl: WebGLRenderer, camera: Camera): void;
}

/** `boxes`: softboxes ao fundo. Só no herói da home: no quadro do player, com a câmera afastada, viravam névoa clara. */
export function Studio({
  body,
  cx = 0,
  cz = 0,
  shadowCasters,
  boxes = false,
}: {
  body: BodyInstance | null;
  cx?: number;
  cz?: number;
  shadowCasters?: () => readonly ShadowCaster[];
  boxes?: boolean;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const res = useMemo(() => {
    const shadowRT = new WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthBuffer: true });
    shadowRT.depthTexture = new DepthTexture(SHADOW_SIZE, SHADOW_SIZE, UnsignedIntType);
    const reflectRT = new WebGLRenderTarget(2, 2, { type: HalfFloatType, depthBuffer: true, samples: 4 });
    reflectRT.depthTexture = new DepthTexture(2, 2, UnsignedIntType);
    const lightCam = new OrthographicCamera(-SHADOW_SPAN, SHADOW_SPAN, SHADOW_SPAN, -SHADOW_SPAN, 0.1, 9);
    const lightVP = new Matrix4();
    const uni = {
      color: { value: palette.floor.clone() },
      useShadow: { value: 0 },
      useReflect: { value: 0 },
      viewport: { value: new Vector4(0, 0, 1, 1) },
      shadowK: { value: 0.82 },
      floorK: { value: 0.5 },
      projInv: { value: new Matrix4() },
      camWorld: { value: new Matrix4() },
    };
    const floorMat = new ShaderMaterial({
      vertexShader: FLOOR_VS,
      fragmentShader: FLOOR_FS,
      defines: { FLOOR_R: FLOOR_R.toFixed(1) },
      uniforms: {
        ...rig,
        uColor: uni.color,
        tShadow: { value: shadowRT.depthTexture },
        tReflect: { value: reflectRT.texture },
        tReflDepth: { value: reflectRT.depthTexture },
        uProjInv: uni.projInv,
        uCamWorld: uni.camWorld,
        uLightVP: { value: lightVP },
        uUseShadow: uni.useShadow,
        uUseReflect: uni.useReflect,
        uViewport: uni.viewport,
        uCenter: { value: new Vector2(cx, cz) },
        uFade: { value: 0.9 },
        uReflectK: { value: 0.55 },
        uShadowK: uni.shadowK,
        uFloorK: uni.floorK,
      },
      transparent: true,
      depthWrite: true,
    });
    const floor = new Mesh(new PlaneGeometry(FLOOR_R * 2, FLOOR_R * 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.renderOrder = -2;
    floor.frustumCulled = false;
    floor.onBeforeRender = (r) => {
      r.getCurrentViewport(uni.viewport.value);
    };
    const boxGeo = new PlaneGeometry(1, 1);
    const tints: { value: Vector3 }[] = [];
    const boxes = BOXES.map((b) => {
      const tint = { value: (b.warm ? palette['light-key'] : palette['light-rim']).clone() };
      tints.push(tint);
      const m = new Mesh(
        boxGeo,
        new ShaderMaterial({
          vertexShader: BOX_VS,
          fragmentShader: BOX_FS,
          uniforms: { ...rig, uTint: tint, uPower: { value: b.power } },
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      m.position.set(b.p[0], b.p[1], b.p[2]);
      m.scale.set(b.s[0], b.s[1], 1);
      m.rotation.y = b.yaw;
      m.renderOrder = -3;
      return m;
    });
    return { shadowRT, reflectRT, lightCam, lightVP, floorMat, floor, boxes, boxGeo, uni, tints };
  }, [cx, cz]);

  useEffect(
    () => () => {
      res.shadowRT.depthTexture?.dispose();
      res.shadowRT.dispose();
      res.reflectRT.depthTexture?.dispose();
      res.reflectRT.dispose();
      res.floorMat.dispose();
      res.floor.geometry.dispose();
      res.boxGeo.dispose();
      for (const b of res.boxes) (b.material as ShaderMaterial).dispose();
    },
    [res],
  );

  const tmp = useMemo(() => ({ dir: new Vector3(), at: new Vector3() }), []);

  // Antes de a vista desenhar (as `View` usam prioridade 1+): sombra e reflexo no quadro.
  useFrame(() => {
    const fx = cinema.fx;
    const force = cinema.force;
    const uni = res.uni;
    const light = document.documentElement.dataset.theme === 'light';
    uni.color.value.copy(palette.floor);
    BOXES.forEach((b, i) => res.tints[i]?.value.copy(b.warm ? palette['light-key'] : palette['light-rim']));
    // Celular: o quadro estreito põe as softboxes atrás do texto do herói e lava a letra.
    for (const m of res.boxes) m.visible = boxes && !light && size.width >= 900;
    const shadowOn = !!body && (force.shadow ?? fx?.shadow ?? false);
    const reflectOn = !!body && !light && (force.reflect ?? fx?.reflect ?? false);
    uni.useShadow.value = shadowOn ? 1 : 0;
    uni.useReflect.value = reflectOn ? 1 : 0;
    // Claro: sombra projetada mais leve (alfa 0,42) e mais longa (key mais baixa), como num ciclorama high-key.
    uni.shadowK.value = light ? 0.42 : 0.82;
    // Claro: ciclorama de estúdio, chão quase da cor do fundo.
    uni.floorK.value = light ? 1.9 : 0.5;
    if (!body || (!shadowOn && !reflectOn)) return;
    const prev = gl.getRenderTarget();
    const prevScissor = gl.getScissorTest();
    const autoClear = gl.autoClear;
    gl.setScissorTest(false);
    gl.autoClear = false;
    const clear = gl.getClearAlpha();
    if (shadowOn) {
      // Key no mundo: a direção mora no espaço da câmera.
      camera.updateMatrixWorld();
      tmp.dir.copy(rig.uKeyDir.value).normalize().transformDirection(camera.matrixWorld);
      if (light) tmp.dir.setY(tmp.dir.y * 0.72).normalize();
      tmp.at.set(cx, 0.9, cz);
      res.lightCam.position.copy(tmp.at).addScaledVector(tmp.dir, 4.5);
      res.lightCam.up.set(0, 1, 0);
      res.lightCam.lookAt(tmp.at);
      res.lightCam.updateMatrixWorld();
      res.lightCam.updateProjectionMatrix();
      res.lightVP.multiplyMatrices(res.lightCam.projectionMatrix, res.lightCam.matrixWorldInverse);
      gl.setRenderTarget(res.shadowRT);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, false);
      body.renderSilhouette(gl, res.lightCam);
      for (const c of shadowCasters?.() ?? []) c.render(gl, res.lightCam);
    }
    if (reflectOn) {
      const dpr = gl.getPixelRatio();
      const w = Math.max(2, Math.round(size.width * dpr)), h = Math.max(2, Math.round(size.height * dpr));
      if (res.reflectRT.width !== w || res.reflectRT.height !== h) res.reflectRT.setSize(w, h);
      uni.projInv.value.copy(camera.projectionMatrixInverse);
      uni.camWorld.value.copy(camera.matrixWorld);
      gl.setRenderTarget(res.reflectRT);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, false);
      body.renderMirror(gl, camera);
    }
    gl.setClearAlpha(clear);
    gl.setRenderTarget(prev);
    gl.setScissorTest(prevScissor);
    gl.autoClear = autoClear;
  }, 0.6);

  return (
    <>
      <primitive object={res.floor} />
      {res.boxes.map((b, i) => (
        <primitive key={i} object={b} />
      ))}
    </>
  );
}
