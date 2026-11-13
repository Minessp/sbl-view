/**
 * Material do corpo anatômico. Skinning linear na GPU (reproduz `engine/kinematics/skinning.ts`), estado por vaga
 * lido de uma textura, plano de corte por camada e passe de seleção (a cor codifica o índice da vaga).
 *
 * Estado (2 texels por vaga, RGBA float):
 *   linha 0: destaque, opacidade, calor, ativação (0..1)
 *   linha 1: oculto (> 0,5), volume (fração radial somada ao ventre), deformação (−1 alongado … +1 encurtado), —
 * Opacidade abaixo de 1 vira pontilhado (sem ordenar transparência); a pele é a única camada com mistura.
 *
 * Luz (rig.ts): fluxo linear, key de tungstênio com difusão envolvente (luz atravessa a borda: vermelho no músculo),
 * contraluz fria, hemisfério; ACES e pontilhado de 8 bits no fim ("pós-processamento" dentro do material: o palco
 * desenha várias vistas recortadas, um compositor por vista custaria caro).
 * Músculo: brilho anisotrópico ao longo da fibra (Kajiya-Kay; a direção da fibra é o gradiente do parâmetro t
 * origem→inserção na superfície, por derivada de tela) e tendão claro nas pontas. Osso: marfim fosco.
 * Pele: translúcida, mais opaca na silhueta (Fresnel).
 * Destaque, calor e ativação acendem o músculo (incandescência na cor --c-glow). Deformação: encurtar acende em
 * tungstênio (--c-glow), alongar em aço (--c-stretch).
 * Corte: plano de normal `uCutN` (mundo); do lado positivo, a camada vira fantasma. Padrão = horizontal (altura).
 * Lente (página inicial): círculo na tela; cada camada é tirada dentro de uma fração do raio (anéis em degrau, borda
 * acesa em tungstênio). Montagem: o músculo cresce da origem à inserção com uma frente incandescente.
 */
import { DoubleSide, FrontSide, ShaderMaterial, type DataTexture, type IUniform, type Matrix4, type Vector3 } from 'three';
import { rig, type Rig } from './rig';

export const STATE_ROWS = 2;

export type BodyUniforms = Rig & {
  [name: string]: IUniform;
  uJoints: IUniform<Matrix4[]>;
  uState: IUniform<DataTexture>;
  uStateW: IUniform<number>;
  uColor: IUniform<Vector3>;
  /** Alfa da camada (só a pele mistura). */
  uAlpha: IUniform<number>;
  /** Além desta distância (m) ao longo de `uCutN` a camada vira fantasma. */
  uCut: IUniform<number>;
  /** Normal do plano de corte (mundo, unitária). (0, 1, 0) = corte por altura. */
  uCutN: IUniform<Vector3>;
  /** Opacidade do fantasma acima do corte. */
  uGhost: IUniform<number>;
  /** Abaixo desta altura (m) a camada não aparece: o que está sob a pele intacta fica escondido. */
  uShowAbove: IUniform<number>;
  /** Lente (px do quadro, origem embaixo à esquerda): centro x, y e raio. Raio 0 = sem lente. Um objeto por instância. */
  uLens: IUniform<Vector3>;
  /** Fração do raio da lente dentro da qual esta camada é tirada (0 = não tira). */
  uLensK: IUniform<number>;
  /** > 0: a camada só aparece dentro desta fração do raio (o que está sob a pele intacta só se vê pelo buraco). */
  uLensIn: IUniform<number>;
  /** Montagem das fibras: cada músculo cresce da origem à inserção até este parâmetro (≥ 2 = inteiro). Um objeto por instância. */
  uGrow: IUniform<number>;
};

/** Funções de luz compartilhadas (corpo e equipamento). */
export const LIGHT_GLSL = /* glsl */ `
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uRimColor;
  uniform vec3 uSky;
  uniform vec3 uGround;
  uniform float uLight;
  uniform float uExposure;
  uniform float uAmbient;

  vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
  vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  // Ruído de gradiente intercalado: pontilhado estável, sem textura.
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  // Contraluz: atrás, à direita e acima da câmera (espaço da vista).
  const vec3 RIM_DIR = vec3(0.6, 0.42, -0.68);

  vec3 finish(vec3 linearColor) {
    vec3 c = toSrgb(aces(linearColor * uExposure));
    return c + (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  }

  // Ambiente + key envolvente + contraluz. albedo linear; wrap 0..1; sss = cor que atravessa a borda.
  vec3 studio(vec3 albedo, vec3 n, vec3 v, float wrap, vec3 sss, out float ndl) {
    vec3 L = normalize(uKeyDir);
    ndl = dot(n, L);
    float diff = max((ndl + wrap) / (1.0 + wrap), 0.0);
    float scatter = max(diff - max(ndl, 0.0), 0.0);
    float keyOn = smoothstep(0.25, 1.0, uLight);
    float rimOn = smoothstep(0.0, 0.55, uLight);
    vec3 key = toLinear(uKeyColor) * keyOn * 1.5;
    vec3 amb = mix(toLinear(uGround), toLinear(uSky), n.y * 0.5 + 0.5) * (0.35 + 0.65 * uLight) * uAmbient;
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    float rimL = max(dot(n, normalize(RIM_DIR)), 0.0);
    vec3 rim = toLinear(uRimColor) * rimOn * (rimL * 1.2 + fres * 0.8) * (0.45 + 0.55 * rimL);
    return albedo * (key * (max(ndl, 0.0) + sss * scatter) + amb) + rim * mix(vec3(1.0), albedo * 2.0, 0.35);
  }
`;

const vertex = (joints: number) => /* glsl */ `
  #define JOINTS ${joints}
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
  attribute float aSlot;
  #ifdef MUSCLE
  attribute float aAlong;
  attribute vec3 aRadial;
  varying float vAlong;
  #endif
  uniform mat4 uJoints[JOINTS];
  uniform sampler2D uState;
  uniform float uStateW;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vW;
  varying vec4 vS0;
  varying vec4 vS1;
  varying float vSlot;

  void main() {
    mat4 M = uJoints[int(skinIndex.x)] * skinWeight.x + uJoints[int(skinIndex.y)] * skinWeight.y
           + uJoints[int(skinIndex.z)] * skinWeight.z + uJoints[int(skinIndex.w)] * skinWeight.w;
    float u = (aSlot + 0.5) / uStateW;
    vS0 = texture2D(uState, vec2(u, 0.25));
    vS1 = texture2D(uState, vec2(u, 0.75));
    vSlot = aSlot;
    vec4 p = M * vec4(position, 1.0);
    #ifdef MUSCLE
    vAlong = aAlong;
    // Volume preservado: ao encurtar, o ventre engrossa; as pontas (tendão) quase não mudam.
    float belly = sin(3.14159265 * clamp(aAlong, 0.0, 1.0));
    p.xyz += mat3(M) * aRadial * (vS1.y * belly);
    #endif
    vec4 w = modelMatrix * p;
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vView = mv.xyz;
    vN = normalize(normalMatrix * (mat3(M) * normal));
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uGlow;
  uniform vec3 uTendon;
  uniform float uAlpha;
  uniform float uCut;
  uniform vec3 uCutN;
  uniform vec3 uStretch;
  uniform float uGhost;
  uniform float uShowAbove;
  uniform float uTime;
  uniform float uPulseStart;
  uniform vec3 uLens;
  uniform float uLensK;
  uniform float uLensIn;
  uniform float uGrow;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vW;
  varying vec4 vS0;
  varying vec4 vS1;
  varying float vSlot;
  #ifdef MUSCLE
  varying float vAlong;
  #endif

  ${LIGHT_GLSL}

  void main() {
    if (vS1.x > 0.5 || vW.y < uShowAbove) discard;
    // Lente: dentro de uLensK × raio a camada sai (borda de 3 px pontilhada); com uLensIn, só existe dentro do buraco.
    float lensD = length(gl_FragCoord.xy - uLens.xy);
    float peel = uLens.z * uLensK;
    if (peel > 0.0 && lensD < peel + 1.5 && (lensD < peel - 1.5 || ign(gl_FragCoord.xy) > (lensD - peel + 1.5) / 3.0)) discard;
    if (uLensIn > 0.0 && lensD > uLens.z * uLensIn) discard;
    #ifdef MUSCLE
    // Montagem: a fibra cresce da origem à inserção; cada músculo tem seu atraso (hash da vaga).
    float grow = uGrow - fract(sin(floor(vSlot + 0.5) * 12.9898) * 43758.5453) * 0.45;
    if (uGrow < 2.0 && vAlong > grow) discard;
    #endif
    float a = vS0.y * (dot(vW, uCutN) > uCut ? uGhost : 1.0);
    #ifdef PICK
      if (a < 0.5) discard;
      float id = floor(vSlot + 0.5) + 1.0;
      gl_FragColor = vec4(mod(id, 256.0) / 255.0, floor(id / 256.0) / 255.0, 0.0, 1.0);
    #else
      #ifndef TRANSLUCENT
      if (a < 0.999 && ign(gl_FragCoord.xy) > a) discard;
      #endif
      vec3 n = dot(vN, vN) > 1e-12 ? normalize(vN) : vec3(0.0, 0.0, 1.0);
      if (!gl_FrontFacing) n = -n;
      vec3 v = normalize(-vView);
      vec3 L = normalize(uKeyDir);
      vec3 H = normalize(L + v);
      vec3 albedo = toLinear(uColor);
      vec3 glow = toLinear(uGlow);
      float hl = vS0.x;
      float lit = max(hl, max(vS0.z, vS0.w));
      float ndl;
      vec3 col;
      vec3 emit = vec3(0.0);

      #ifdef MUSCLE
        float t = clamp(vAlong, 0.0, 1.0);
        // Tendão claro nas pontas.
        float tendon = 1.0 - smoothstep(0.015, 0.1, t) * (1.0 - smoothstep(0.9, 0.985, t));
        albedo = mix(albedo, toLinear(uTendon) * 0.8, tendon * 0.6);
        albedo = mix(albedo, glow * 0.7, lit * 0.45);
        // Deformação: encurtar = tungstênio, alongar = aço (pouco no tendão, que quase não muda).
        float sh = max(vS1.z, 0.0) * (1.0 - tendon * 0.7);
        float st = max(-vS1.z, 0.0) * (1.0 - tendon * 0.7);
        vec3 cool = toLinear(uStretch);
        albedo = mix(albedo, glow * 0.75, sh * 0.8);
        albedo = mix(albedo, cool * 0.7, st * 0.85);
        // Direção da fibra: gradiente de t na superfície.
        vec3 dp1 = dFdx(vView);
        vec3 dp2 = dFdy(vView);
        float dt1 = dFdx(vAlong);
        float dt2 = dFdy(vAlong);
        vec3 T = cross(dp2, n) * dt1 + cross(n, dp1) * dt2;
        T -= n * dot(n, T);
        float tl = length(T);
        T = tl > 1e-14 ? T / tl : normalize(cross(n, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
        col = studio(albedo, n, v, 0.45, vec3(0.9, 0.22, 0.12), ndl);
        float th = dot(T, H);
        float sinTH = sqrt(max(1.0 - th * th, 0.0));
        float facing = smoothstep(-0.1, 0.35, ndl);
        float sheen = (pow(sinTH, 110.0) * 0.55 + pow(sinTH, 14.0) * 0.07) * mix(1.0, 0.45, tendon);
        float tendonSpec = pow(max(dot(n, H), 0.0), 48.0) * 0.3 * tendon;
        col += toLinear(uKeyColor) * smoothstep(0.25, 1.0, uLight) * 1.6 * (sheen + tendonSpec) * facing;
        // Brilho que percorre a fibra da origem à inserção (duas passadas) depois de um destaque novo.
        float ph = (uTime - uPulseStart) / 1.2;
        if (ph >= 0.0 && ph < 2.0) {
          float x = fract(ph) * 1.4 - 0.2;
          emit += glow * exp(-pow((t - x) * 7.0, 2.0)) * 1.6 * hl * (1.0 - smoothstep(1.6, 2.0, ph));
        }
      #elif defined(TRANSLUCENT)
        col = studio(albedo, n, v, 0.6, vec3(1.0, 0.42, 0.3), ndl);
        col += toLinear(uKeyColor) * smoothstep(0.25, 1.0, uLight) * pow(max(dot(n, H), 0.0), 36.0) * 0.5;
      #else
        // Osso: marfim fosco, levemente quente na borda.
        col = studio(albedo, n, v, 0.22, vec3(1.0, 0.75, 0.55), ndl);
        col += toLinear(uKeyColor) * smoothstep(0.25, 1.0, uLight) * pow(max(dot(n, H), 0.0), 20.0) * 0.1;
      #endif

      // Incandescência: o que está em foco ou trabalhando acende.
      emit += glow * lit * (0.1 + 0.22 * lit);
      // Borda da lente: a camada acende onde foi cortada.
      if (peel > 0.0) emit += glow * exp(-pow((lensD - peel) / max(2.0, uLens.z * 0.025), 2.0)) * 1.4;
      #ifdef MUSCLE
        // Frente da montagem.
        if (uGrow < 2.0) emit += glow * exp(-pow((grow - t) * 16.0, 2.0)) * 2.2;
      #endif
      #ifdef MUSCLE
        emit += glow * sh * 0.6 + cool * st * 0.95;
      #endif
      col += emit;

      #ifdef TRANSLUCENT
        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
        float alpha = uAlpha >= 0.999 ? 1.0 : clamp(uAlpha * (0.4 + 1.6 * fres), 0.0, 1.0);
        gl_FragColor = vec4(finish(col), alpha * a);
      #else
        gl_FragColor = vec4(finish(col), 1.0);
      #endif
    #endif
  }
`;

export interface BodyMaterialOptions {
  joints: number;
  muscle: boolean;
  translucent: boolean;
  pick: boolean;
  uniforms: BodyUniforms;
}

export function createBodyMaterial(o: BodyMaterialOptions): ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.muscle) defines.MUSCLE = '';
  if (o.translucent && !o.pick) defines.TRANSLUCENT = '';
  if (o.pick) defines.PICK = '';
  return new ShaderMaterial({
    vertexShader: vertex(o.joints),
    fragmentShader: fragment,
    defines,
    uniforms: o.uniforms,
    side: o.translucent ? FrontSide : DoubleSide,
    transparent: o.translucent && !o.pick,
    depthWrite: !(o.translucent && !o.pick),
  });
}

/** Uniforms de luz para quem não é corpo (equipamento). */
export function rigUniforms(): Rig {
  return rig;
}
