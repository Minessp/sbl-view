/**
 * Material "prancha": gravura em vez de PBR.
 * - meia-Lambert com luz fixa de estúdio (vista), sem luzes de cena;
 * - hachura diagonal em espaço de tela, densidade pela sombra (cruza nas sombras fundas);
 * - contorno por fresnel em nanquim;
 * - estrias de fibra (músculo) e linhas de nível (pele);
 * - plano de corte: acima dele a camada vira fantasma (só contorno, pontilhado),
 *   e uma linha de seção em eosina marca o corte.
 * Cores chegam como sRGB cru e saem sem conversão (o desenho é ilustração, não fotometria).
 */
import { FrontSide, ShaderMaterial, type IUniform, type Vector3 } from 'three';
import type { Palette } from '../palette';

export interface SharedUniforms {
  uInk: IUniform<Vector3>;
  uLine: IUniform<Vector3>;
  uAccent: IUniform<Vector3>;
  uPaper: IUniform<Vector3>;
  uDpr: IUniform<number>;
}

export function createShared(p: Palette, dpr: number): SharedUniforms {
  return {
    uInk: { value: p.ink },
    uLine: { value: p['ink-2'] },
    uAccent: { value: p.accent },
    uPaper: { value: p.bg },
    uDpr: { value: dpr },
  };
}

export interface PlateOptions {
  base: Vector3;
  /** Uniform de corte compartilhado pela camada (m, mundo). */
  cut: IUniform<number>;
  /** Opacidade do fantasma acima do corte, compartilhada pela camada. */
  ghost: IUniform<number>;
  /** Só existe acima desta altura (ex.: músculo só aparece onde a pele já foi cortada). */
  showAbove?: IUniform<number>;
  stain?: number;
  hatch?: number;
  fiber?: number;
  contour?: number;
}

const vertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vec4 mv = viewMatrix * w;
    vView = mv.xyz;
    vN = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uInk;
  uniform vec3 uLine;
  uniform vec3 uAccent;
  uniform vec3 uPaper;
  uniform float uDpr;
  uniform float uStain;
  uniform float uHatch;
  uniform float uFiber;
  uniform float uContour;
  uniform float uCut;
  uniform float uGhost;
  uniform float uShowAbove;

  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vView;
  varying vec2 vUv;

  // Ruído de gradiente intercalado: pontilhado estável, sem textura.
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  // Linha periódica antisserrilhada: x em períodos, w em pixels.
  float lines(float x, float w) {
    float fw = max(fwidth(x), 1e-5);
    float f = fract(x);
    float d = min(f, 1.0 - f);
    return 1.0 - smoothstep(0.5 * w * fw, (0.5 * w + 1.0) * fw, d);
  }

  void main() {
    if (vWorld.y < uShowAbove) discard;
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(-vView);
    vec3 L = normalize(vec3(-0.45, 0.62, 0.64));
    float lit = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
    float rim = 1.0 - clamp(dot(n, v), 0.0, 1.0);

    vec2 sp = gl_FragCoord.xy / uDpr;
    float spacing = 4.5;
    float dark = 1.0 - lit;
    float h1 = lines((sp.x + sp.y) / spacing, mix(0.0, 2.6, smoothstep(0.30, 0.85, dark)));
    float h2 = lines((sp.x - sp.y) / spacing, mix(0.0, 2.0, smoothstep(0.62, 0.95, dark)));
    float hatch = max(h1 * step(0.30, dark), h2 * step(0.62, dark)) * uHatch;

    float contour = uContour > 0.0 ? lines(vWorld.y / 0.016, 1.0) * uContour : 0.0;
    float edge = smoothstep(0.58, 0.9, rim);

    // Acima do corte: fantasma.
    if (vWorld.y > uCut) {
      float a = max(edge, contour * 0.7) * uGhost;
      if (a < 0.02 || ign(gl_FragCoord.xy) > a) discard;
      gl_FragColor = vec4(mix(uPaper, uInk, 0.55), 1.0);
      return;
    }

    vec3 col = uBase;
    if (uFiber > 0.0) col = mix(col, uInk, lines(vUv.x * 22.0, 0.8) * 0.16 * uFiber);
    col = mix(col, uAccent, uStain * (0.5 + 0.5 * lit));
    col = mix(col, uInk, hatch * 0.5);
    col = mix(col, uLine, contour * 0.85);
    col = mix(col, uInk, edge * 0.9);

    // Linha de seção logo abaixo do plano de corte.
    float band = 1.0 - smoothstep(0.0, max(fwidth(vWorld.y), 1e-5) * 2.5, uCut - vWorld.y);
    col = mix(col, uAccent, band * step(uCut, 2.5));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export type PlateMaterial = ShaderMaterial & {
  uniforms: SharedUniforms & {
    uBase: IUniform<Vector3>;
    uStain: IUniform<number>;
    uHatch: IUniform<number>;
    uFiber: IUniform<number>;
    uContour: IUniform<number>;
    uCut: IUniform<number>;
    uGhost: IUniform<number>;
    uShowAbove: IUniform<number>;
  };
};

export function createPlateMaterial(shared: SharedUniforms, o: PlateOptions): PlateMaterial {
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    side: FrontSide,
    uniforms: {
      ...shared,
      uBase: { value: o.base },
      uStain: { value: o.stain ?? 0 },
      uHatch: { value: o.hatch ?? 1 },
      uFiber: { value: o.fiber ?? 0 },
      uContour: { value: o.contour ?? 0 },
      uCut: o.cut,
      uGhost: o.ghost,
      uShowAbove: o.showAbove ?? { value: -100 },
    },
  }) as PlateMaterial;
}
