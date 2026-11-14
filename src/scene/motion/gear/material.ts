/**
 * Materiais do equipamento sob a luz do estúdio (a mesma do corpo, `LIGHT_GLSL`). Um shader só, com cinco acabamentos:
 * - chrome: cromo da barra e dos puxadores, reflexo do ambiente (céu/chão do estúdio) e faixa da softbox da key;
 * - steel: aço pintado do quadro, acetinado;
 * - iron: ferro fundido das anilhas, fosco com grão;
 * - pad: estofado, quase fosco, brilho de couro na borda e costura;
 * - rubber: borracha (pegadores, piso da plataforma), fosca.
 * Desenhos procedurais no espaço do objeto (sem textura): recartilhado em cilindro de eixo Y, chapa xadrez no plano XZ.
 */
import { ShaderMaterial, Vector3 } from 'three';
import { LIGHT_GLSL } from '../../body/material';
import { palette, rig } from '../../body/rig';

export type Finish = 'chrome' | 'steel' | 'iron' | 'pad' | 'rubber' | 'cable';
/** 0 liso; 1 recartilhado (cilindro em Y; `scale` = raio); 2 chapa xadrez (plano XZ; `scale` = passo); 3 costura (`size` = caixa). */
export type Pattern = 0 | 1 | 2 | 3;

const vertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vO;
  void main() {
    vO = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uMetal;
  uniform float uGloss;
  uniform float uSpec;
  uniform float uGrain;
  uniform float uSheen;
  uniform int uPattern;
  uniform float uScale;
  uniform vec3 uSize;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vO;
  ${LIGHT_GLSL}

  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }

  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(-vView);
    vec3 albedo = toLinear(uColor);
    float spec = uSpec;
    float gloss = uGloss;
    // Grão do material (ferro fundido, couro).
    float g = noise3(vO * 900.0) * 0.6 + noise3(vO * 180.0) * 0.4;
    albedo *= 1.0 + (g - 0.5) * uGrain;

    if (uPattern == 1) {
      // Recartilhado: losangos em volta do cilindro (eixo Y), cada um com uma face que pega a luz.
      // Passo de 2,5 mm; some quando o losango fica menor que ~2 px (sem moiré).
      float a = atan(vO.x, vO.z) * uScale / 0.0025;
      float y = vO.y / 0.0025;
      float d1 = abs(fract((a + y) * 0.5) - 0.5), d2 = abs(fract((a - y) * 0.5) - 0.5);
      float k = mix(smoothstep(0.08, 0.22, min(d1, d2)), 0.7, smoothstep(0.25, 0.6, fwidth(y)));
      albedo *= mix(0.45, 1.0, k);
      spec *= mix(0.25, 1.15, k);
      gloss *= mix(0.4, 1.0, k);
    } else if (uPattern == 2) {
      // Chapa xadrez: gomos alternados a 45°.
      vec2 q = vO.xz / uScale;
      vec2 c = floor(q);
      vec2 f = fract(q) - 0.5;
      float flip = mod(c.x + c.y, 2.0);
      vec2 r = flip > 0.5 ? vec2(f.x + f.y, f.x - f.y) : vec2(f.x - f.y, f.x + f.y);
      float bead = 1.0 - smoothstep(0.08, 0.14, abs(r.x) * 0.5 + max(abs(r.y) - 0.28, 0.0));
      albedo *= mix(0.8, 1.25, bead);
      spec *= mix(0.6, 1.6, bead);
    } else if (uPattern == 3) {
      // Costura do estofado: friso a 1,5 cm da borda do topo.
      vec2 e = uSize.xz * 0.5 - abs(vO.xz);
      float seam = smoothstep(0.003, 0.0, abs(min(e.x, e.y) - 0.015)) * step(uSize.y * 0.5 - 0.004, vO.y);
      albedo *= 1.0 - seam * 0.45;
    }

    float ndl;
    vec3 diffuse = studio(albedo, n, v, 0.15, vec3(0.0), ndl) * (1.0 - uMetal * 0.85);
    // Reflexo do ambiente do estúdio: chão escuro embaixo, céu em cima, a softbox da key como faixa clara.
    vec3 r = reflect(-v, n);
    vec3 env = mix(toLinear(uGround), toLinear(uSky) * 1.6, smoothstep(-0.25, 0.35, r.y));
    float box = smoothstep(0.86, 0.97, dot(r, normalize(uKeyDir)));
    env += toLinear(uKeyColor) * box * 2.4 * smoothstep(0.25, 1.0, uLight);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
    vec3 refl = env * mix(vec3(0.04), albedo * 1.4 + 0.1, uMetal) * (1.0 + fres * 2.0) * spec;
    vec3 H = normalize(normalize(uKeyDir) + v);
    float sp = pow(max(dot(n, H), 0.0), gloss) * spec;
    vec3 key = toLinear(uKeyColor) * smoothstep(0.25, 1.0, uLight) * sp * mix(vec3(1.0), albedo * 3.0 + 0.2, uMetal);
    // Brilho rasante (couro, borracha): só na borda.
    vec3 sheen = toLinear(uRimColor) * uSheen * fres * 0.6;
    gl_FragColor = vec4(finish(diffuse + refl + key + sheen), 1.0);
  }
`;

interface FinishSpec {
  readonly color: 'gear-chrome' | 'gear-steel' | 'gear-iron' | 'gear-pad' | 'gear-rubber' | 'gear-cable';
  readonly metal: number;
  readonly gloss: number;
  readonly spec: number;
  readonly grain: number;
  readonly sheen: number;
}

const FINISH: Record<Finish, FinishSpec> = {
  chrome: { color: 'gear-chrome', metal: 1, gloss: 140, spec: 1, grain: 0.04, sheen: 0 },
  steel: { color: 'gear-steel', metal: 0.25, gloss: 40, spec: 0.55, grain: 0.06, sheen: 0.15 },
  iron: { color: 'gear-iron', metal: 0.35, gloss: 18, spec: 0.35, grain: 0.35, sheen: 0.1 },
  pad: { color: 'gear-pad', metal: 0, gloss: 12, spec: 0.22, grain: 0.18, sheen: 0.6 },
  rubber: { color: 'gear-rubber', metal: 0, gloss: 8, spec: 0.12, grain: 0.25, sheen: 0.25 },
  cable: { color: 'gear-cable', metal: 0.8, gloss: 60, spec: 0.7, grain: 0, sheen: 0 },
};

export interface GearMaterial extends ShaderMaterial {
  readonly finish: Finish;
}

export function createGearMaterial(finish: Finish, pattern: Pattern = 0, scale = 1, size: readonly [number, number, number] = [1, 1, 1]): GearMaterial {
  const f = FINISH[finish];
  const m = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...rig,
      uColor: { value: new Vector3().copy(palette[f.color]) },
      uMetal: { value: f.metal },
      uGloss: { value: f.gloss },
      uSpec: { value: f.spec },
      uGrain: { value: f.grain },
      uSheen: { value: f.sheen },
      uPattern: { value: pattern },
      uScale: { value: scale },
      uSize: { value: new Vector3(size[0], size[1], size[2]) },
    },
  }) as GearMaterial;
  Object.defineProperty(m, 'finish', { value: finish });
  return m;
}

/** Relê a cor da paleta (troca de tema). */
export function refreshGearMaterial(m: GearMaterial) {
  m.uniforms.uColor?.value.copy(palette[FINISH[m.finish].color]);
}
