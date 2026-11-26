/**
 * Material do corpo: skinning linear na GPU (espelha `engine/kinematics/skinning.ts`), estado por vaga numa textura,
 * corte por camada e passe de seleção (cor = índice da vaga).
 *
 * Estado (2 texels RGBA float por vaga):
 *   linha 0: destaque, opacidade, calor, ativação (0..1)
 *   linha 1: oculto (> 0,5), volume (fração radial no ventre), deformação (−1 alongado … +1 encurtado), pontas (0..1)
 * Opacidade < 1 vira pontilhado (sem ordenar transparência); com `uGlass`, um passe de vidro desenha por cima.
 * Tom e pontilhado ficam dentro do material: o palco desenha várias vistas recortadas e um compositor por vista custaria caro.
 */
import { DoubleSide, FrontSide, ShaderMaterial, type DataTexture, type IUniform, type Matrix4, type Vector2, type Vector3 } from 'three';
import { skeletonDef } from '@/data';
import { FOLD_HALF, gripRig, handSpec, THUMB_MASK } from '@/engine/kinematics/grip';
import type { Rig } from './rig';

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
  /** > 0,5: opacidade abaixo de 1 é vidro, não pontilhado. Um objeto por instância. */
  uGlass: IUniform<number>;
  /** Mão que fecha: direita, esquerda (0 aberta … 1 fechada). Um objeto por instância. */
  uGrip: IUniform<Vector2>;
  /** Pronação de cada lado (rad, giro em Y da mão no antebraço), repartida ao longo do antebraço. Um objeto por instância. */
  uTwist: IUniform<Vector2>;
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
  uniform float uHdr;
  uniform float uRimMode;

  vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
  vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  // Ruído de gradiente intercalado: pontilhado estável, sem textura.
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  // Contraluz: atrás, à direita e acima da câmera (espaço da vista).
  const vec3 RIM_DIR = vec3(0.6, 0.42, -0.68);

  // Com o pipeline de cinema (scene/cinema), sai linear e sem teto: o tom, o bloom e o grão vêm depois.
  vec3 finish(vec3 linearColor) {
    if (uHdr > 0.5) return linearColor * uExposure;
    vec3 c = toSrgb(aces(linearColor * uExposure));
    return c + (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  }

  // Ambiente + key envolvente + contraluz. albedo linear; wrap 0..1; sss = cor que atravessa a borda;
  // rimTint = quanto a contraluz toma a cor do material (0 = luz fria pura, 1 = toda na cor da superfície).
  vec3 studioRim(vec3 albedo, vec3 n, vec3 v, float wrap, vec3 sss, float rimTint, out float ndl) {
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
    vec3 base = albedo * (key * (max(ndl, 0.0) + sss * scatter) + amb);
    // Claro (uRimMode 1): a contraluz vira borda escura por Fresnel; recorta a silhueta contra o ciclorama claro.
    return mix(base + rim * mix(vec3(1.0), albedo * 2.0, rimTint), base * (1.0 - 0.55 * fres * rimOn), uRimMode);
  }
  vec3 studio(vec3 albedo, vec3 n, vec3 v, float wrap, vec3 sss, out float ndl) { return studioRim(albedo, n, v, wrap, sss, 0.35, ndl); }
`;

const f = (x: number) => x.toFixed(6);
const v = (p: readonly number[]) => `vec3(${p.map(f).join(', ')})`;

/** Mão que fecha (`engine/kinematics/grip.ts`, mesma conta): números da mão direita na ligação viram constantes. */
function gripGlsl(): string {
  const r = gripRig(handSpec(skeletonDef));
  const fold = (k: number) => {
    const fd = r.folds[k];
    if (!fd) return '';
    const j = fd.joints;
    const pair = (i: number) => `vec2(${f(j[i]?.[0] ?? 0)}, ${f(j[i]?.[2] ?? 0)})`;
    const w = (i: number) => f(j[i]?.[1] ?? 0);
    return /* glsl */ `
    {
      vec2 J = l.y >= ${w(0)} ? ${pair(0)}
        : l.y >= ${w(1)} ? mix(${pair(0)}, ${pair(1)}, (${w(0)} - l.y) / (${w(0)} - ${w(1)}))
        : l.y >= ${w(2)} ? mix(${pair(1)}, ${pair(2)}, (${w(1)} - l.y) / (${w(1)} - ${w(2)}))
        : l.y >= ${w(3)} ? mix(${pair(2)}, ${pair(3)}, (${w(2)} - l.y) / (${w(2)} - ${w(3)}))
        : ${pair(3)};
      float phi = ${f(fd.angle)} * g * (1.0 - m) * smoothstep(${f(-FOLD_HALF)}, ${f(FOLD_HALF)}, l.x - J.x);
      vec2 d = vec2(s, h) - J;
      float c = cos(phi), sn = sin(phi);
      s = J.x + d.x * c - d.y * sn;
      h = J.y + d.x * sn + d.y * c;
      tot += phi;
    }`;
  };
  return /* glsl */ `
  const vec3 H_O = ${v(handSpec(skeletonDef).origin)};
  const vec3 H_S = ${v(handSpec(skeletonDef).axis)};
  const vec3 H_W = ${v(r.across)};
  const vec3 H_H = ${v(handSpec(skeletonDef).palm)};
  const vec3 T_B = ${v(r.thumb.base)};
  const vec2 T_BL = vec2(${f(r.thumb.baseL[0])}, ${f(r.thumb.baseL[1])});
  const vec2 T_TL = vec2(${f(r.thumb.tipL[0])}, ${f(r.thumb.tipL[1])});
  const vec3 T_K = ${v(r.thumb.axis)};
  vec3 rotK(vec3 p, vec3 k, float a) {
    float c = cos(a), sn = sin(a);
    return p * c + cross(k, p) * sn + k * dot(k, p) * (1.0 - c);
  }
  // Mão direita na ligação: dobra dos dedos (ponta → base) e oposição do polegar; a normal gira junto.
  vec3 gripBend(vec3 p, float g, inout vec3 n) {
    vec3 q = p - H_O;
    vec3 l = vec3(dot(q, H_S), dot(q, H_W), dot(q, H_H));
    vec2 tb = T_TL - T_BL;
    float tt = clamp(dot(l.xy - T_BL, tb) / dot(tb, tb), 0.0, 1.0);
    float m = 1.0 - smoothstep(${f(THUMB_MASK[0])}, ${f(THUMB_MASK[1])}, length(l.xy - (T_BL + tb * tt)));
    float s = l.x, h = l.z, tot = 0.0;
    ${fold(0)}
    ${fold(1)}
    ${fold(2)}
    vec3 r = H_O + H_S * s + H_W * l.y + H_H * h;
    vec3 nl = vec3(dot(n, H_S), dot(n, H_W), dot(n, H_H));
    float c = cos(tot), sn = sin(tot);
    n = H_S * (nl.x * c - nl.z * sn) + H_W * nl.y + H_H * (nl.x * sn + nl.z * c);
    if (m > 0.0) {
      float a = ${f(r.thumb.angle)} * g * m;
      r = T_B + rotK(r - T_B, T_K, a);
      n = rotK(n, T_K, a);
    }
    return r;
  }`;
}
const GRIP_GLSL = gripGlsl();

const vertex = (joints: number, h: HandJoints) => /* glsl */ `
  #define JOINTS ${joints}
  #define HAND_R ${h.hand[0].toFixed(1)}
  #define HAND_L ${h.hand[1].toFixed(1)}
  #define FORE_R ${h.fore[0]}
  #define FORE_L ${h.fore[1]}
  const vec3 WRIST_R = ${v(h.wrist)};
  const float ELBOW_Y = ${f(h.elbowY)};
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
  attribute float aSlot;
  #ifdef MUSCLE
  // x = t ao longo da linha central, y = fração tendínea; direção da fibra na ligação (xyz).
  attribute vec4 aMuscle;
  attribute vec4 aFiber;
  attribute vec3 aRadial;
  varying float vAlong;
  varying float vTendon;
  varying vec3 vT;
  varying vec3 vF;
  #endif
  uniform mat4 uJoints[JOINTS];
  uniform sampler2D uState;
  uniform float uStateW;
  uniform vec2 uGrip;
  uniform vec2 uTwist;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vW;
  varying vec3 vP;
  varying mat3 vMv;
  varying vec4 vS0;
  varying vec4 vS1;
  varying float vSlot;
  ${GRIP_GLSL}
  // Pronação repartida: o termo do antebraço gira em Y pelo punho, de 0 no cotovelo à pronação inteira no punho (a mão
  // leva a pronação toda; sem isto a pele do punho torcia num ponto só e rasgava).
  mat4 twist(float y, vec3 w, float a) {
    float t = a * clamp((ELBOW_Y - y) / (ELBOW_Y - w.y), 0.0, 1.0);
    float c = cos(t), s = sin(t);
    vec3 o = w - vec3(c * w.x + s * w.z, w.y, -s * w.x + c * w.z);
    return mat4(c, 0.0, -s, 0.0, 0.0, 1.0, 0.0, 0.0, s, 0.0, c, 0.0, o, 1.0);
  }

  void main() {
    vec3 pos = position;
    vec3 nrm = normal;
    // Peso do vértice no segmento da mão escala a dobra (o punho não rasga). Esquerda: espelho da direita.
    float wr = dot(skinWeight, vec4(equal(skinIndex, vec4(HAND_R))));
    float wl = dot(skinWeight, vec4(equal(skinIndex, vec4(HAND_L))));
    if (uGrip.x > 0.0 && wr > 0.0) {
      vec3 n2 = nrm;
      pos = mix(pos, gripBend(pos, uGrip.x, n2), wr);
      nrm = normalize(mix(nrm, n2, wr));
    }
    if (uGrip.y > 0.0 && wl > 0.0) {
      const vec3 X = vec3(-1.0, 1.0, 1.0);
      vec3 n2 = nrm * X;
      pos = mix(pos, gripBend(pos * X, uGrip.y, n2) * X, wl);
      nrm = normalize(mix(nrm, n2 * X, wl));
    }
    mat4 M = uJoints[int(skinIndex.x)] * skinWeight.x + uJoints[int(skinIndex.y)] * skinWeight.y
           + uJoints[int(skinIndex.z)] * skinWeight.z + uJoints[int(skinIndex.w)] * skinWeight.w;
    #if FORE_R >= 0
    float fr = dot(skinWeight, vec4(equal(skinIndex, vec4(float(FORE_R)))));
    float fl = dot(skinWeight, vec4(equal(skinIndex, vec4(float(FORE_L)))));
    if (fr > 0.0 && uTwist.x != 0.0) M += uJoints[FORE_R] * (twist(pos.y, WRIST_R, uTwist.x) - mat4(1.0)) * fr;
    if (fl > 0.0 && uTwist.y != 0.0) M += uJoints[FORE_L] * (twist(pos.y, WRIST_R * vec3(-1.0, 1.0, 1.0), uTwist.y) - mat4(1.0)) * fl;
    #endif
    float u = (aSlot + 0.5) / uStateW;
    vS0 = texture2D(uState, vec2(u, 0.25));
    vS1 = texture2D(uState, vec2(u, 0.75));
    vSlot = aSlot;
    // Relevo procedural na pose de ligação: fica preso ao corpo quando ele se move.
    vP = position;
    // Ligação → vista (posado): leva o gradiente do relevo para a superfície posada.
    vMv = mat3(modelViewMatrix) * mat3(M);
    vec4 p = M * vec4(pos, 1.0);
    #ifdef MUSCLE
    vAlong = aMuscle.x;
    vTendon = aMuscle.y;
    vF = aFiber.xyz;
    vT = mat3(modelViewMatrix) * (mat3(M) * aFiber.xyz);
    // Volume preservado: ao encurtar, o ventre engrossa; as pontas (tendão) quase não mudam.
    float belly = sin(3.14159265 * clamp(aMuscle.x, 0.0, 1.0));
    p.xyz += mat3(M) * aRadial * (vS1.y * belly);
    #endif
    vec4 w = modelMatrix * p;
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vView = mv.xyz;
    vN = normalize(normalMatrix * (mat3(M) * nrm));
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
  uniform float uGlass;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vW;
  varying vec3 vP;
  varying mat3 vMv;
  varying vec4 vS0;
  varying vec4 vS1;
  varying float vSlot;
  #ifdef MUSCLE
  varying float vAlong;
  varying float vTendon;
  varying vec3 vT;
  varying vec3 vF;
  #endif

  ${LIGHT_GLSL}

  // Ruído de valor 3D (hash sem textura).
  float hash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  // Ruído de valor 3D com gradiente analítico (Quilez): x = valor 0..1, yzw = derivadas.
  vec4 noised(vec3 x) {
    vec3 i = floor(x);
    vec3 w = fract(x);
    vec3 u = w * w * (3.0 - 2.0 * w);
    vec3 du = 6.0 * w * (1.0 - w);
    float a = hash3(i);
    float b = hash3(i + vec3(1.0, 0.0, 0.0));
    float c = hash3(i + vec3(0.0, 1.0, 0.0));
    float d = hash3(i + vec3(1.0, 1.0, 0.0));
    float e = hash3(i + vec3(0.0, 0.0, 1.0));
    float f = hash3(i + vec3(1.0, 0.0, 1.0));
    float g = hash3(i + vec3(0.0, 1.0, 1.0));
    float h = hash3(i + vec3(1.0, 1.0, 1.0));
    float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f, k7 = -a + b + c - d + e - f - g + h;
    return vec4(
      a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
      du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y));
  }
  // Relevo: gradiente da altura (m/m) na ligação → vista; a normal inclina contra o gradiente. Sem derivada de tela
  // (os quadrados de 2 × 2 pixels pontilhavam o brilho).
  vec3 relief(vec3 n, vec3 gradBind) {
    vec3 g = vMv * gradBind;
    return normalize(n - (g - n * dot(n, g)));
  }
  // Some quando o padrão de comprimento de onda lambda (m) fica menor que ~3 pixels: sem cintilação ao longe.
  float detailFade(float lambda, float px) { return 1.0 - smoothstep(lambda * 0.08, lambda * 0.25, px); }

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
      #if defined(GLASS)
      if (a >= 0.999 || a <= 0.001) discard;
      #elif !defined(TRANSLUCENT)
      if (a < 0.999 && (uGlass > 0.5 || ign(gl_FragCoord.xy) > a)) discard;
      #endif
      vec3 n = dot(vN, vN) > 1e-12 ? normalize(vN) : vec3(0.0, 0.0, 1.0);
      if (!gl_FrontFacing) n = -n;
      // Tamanho do pixel na superfície (m).
      float px = length(fwidth(vView));
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
        // Estrias: fascículos (~3,6 mm) que correm ao longo da fibra e ondulam devagar no comprimento. Coordenada na
        // ligação (o desenho fica preso ao músculo), sem costura: ruído 3D esticado na direção da fibra,
        // x' = A x com A = 280 I − 266 F Fᵀ (280/m através da fibra, 14/m ao longo).
        vec3 F = normalize(vF + vec3(1e-5));
        vec3 ng = n;
        float seed = floor(vSlot + 0.5) * 7.31;
        vec4 fn = noised(280.0 * vP - 266.0 * F * dot(vP, F) + seed);
        float fa = fn.x;
        vec3 dfa = 280.0 * fn.yzw - 266.0 * F * dot(F, fn.yzw);
        // Crista: 1 − |2 fa − 1|, suavizada.
        float r0 = 1.0 - abs(fa * 2.0 - 1.0);
        float ridge = r0 * r0 * (3.0 - 2.0 * r0);
        vec3 dRidge = 6.0 * r0 * (1.0 - r0) * (-2.0 * sign(fa * 2.0 - 1.0)) * dfa;
        // Transição músculo-tendão com borda irregular (as fibras entram na aponeurose em alturas diferentes).
        float tendon = smoothstep(0.3, 0.7, vTendon + (fa - 0.5) * 0.35);
        float a1 = detailFade(0.0036, px) * (1.0 - tendon);
        n = relief(n, 0.0002 * a1 * dRidge);
        albedo *= 1.0 - 0.18 * a1 * (1.0 - ridge);
        albedo = mix(albedo, toLinear(uTendon) * 0.8, tendon * 0.6);
        // No claro destaque e deformação pesam no pigmento (o brilho aditivo some no fundo claro).
        albedo = mix(albedo, glow * 0.7, lit * mix(0.45, 0.7, uRimMode));
        // Deformação: encurtar = tungstênio, alongar = aço (pouco no tendão, que quase não muda).
        float sh = max(vS1.z, 0.0) * (1.0 - tendon * 0.7);
        float st = max(-vS1.z, 0.0) * (1.0 - tendon * 0.7);
        vec3 cool = toLinear(uStretch);
        albedo = mix(albedo, glow * 0.75, sh * mix(0.8, 0.95, uRimMode));
        albedo = mix(albedo, cool * mix(0.7, 0.8, uRimMode), st * mix(0.85, 0.95, uRimMode));
        // Direção da fibra: atributo por vértice (linha central projetada na superfície), posado; suave entre triângulos.
        // O brilho estreito da fibra usa a normal geométrica (com o relevo ele cintilava); o relevo vai no difuso.
        vec3 T = vT - ng * dot(ng, vT);
        float tl = length(T);
        T = tl > 1e-6 ? T / tl : normalize(cross(ng, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
        // Contraluz quase toda na cor do músculo: luz fria pura deixava a borda dos músculos branca.
        col = studioRim(albedo, n, v, 0.45, vec3(0.9, 0.22, 0.12), mix(0.85, 0.35, tendon), ndl);
        float th = dot(T, H);
        float sinTH = sqrt(max(1.0 - th * th, 0.0));
        float facing = smoothstep(-0.1, 0.35, dot(ng, L));
        // Brilho da fibra: fraco e tingido pelo músculo (tecido úmido avermelhado). Branco a 0,9 virava faixas brancas
        // sobre o ventre; o tendão segue com o brilho claro dele.
        float sheen = pow(sinTH, 110.0) * 0.16 + pow(sinTH, 14.0) * 0.025;
        vec3 sheenCol = mix(vec3(1.0), normalize(albedo + vec3(1e-4)) * 1.5, 0.65 * (1.0 - tendon));
        float tendonSpec = pow(max(dot(ng, H), 0.0), 48.0) * 0.3 * tendon;
        col += toLinear(uKeyColor) * smoothstep(0.25, 1.0, uLight) * 1.6 * (sheen * mix(1.0, 0.45, tendon) * sheenCol + tendonSpec) * facing;
        // Brilho que percorre a fibra da origem à inserção (duas passadas) depois de um destaque novo.
        float ph = (uTime - uPulseStart) / 1.2;
        if (ph >= 0.0 && ph < 2.0) {
          float x = fract(ph) * 1.4 - 0.2;
          emit += glow * exp(-pow((t - x) * 7.0, 2.0)) * 1.6 * hl * (1.0 - smoothstep(1.6, 2.0, ph));
        }
      #elif defined(TRANSLUCENT)
        // Microrrelevo da pele (~1,7 mm), só de perto.
        n = relief(n, 0.00006 * 600.0 * detailFade(0.0017, px) * noised(vP * 600.0).yzw);
        col = studio(albedo, n, v, 0.6, vec3(1.0, 0.42, 0.3), ndl);
        col += toLinear(uKeyColor) * smoothstep(0.25, 1.0, uLight) * pow(max(dot(n, H), 0.0), 36.0) * 0.5;
      #else
        // Osso: marfim fosco com textura porosa leve, levemente quente na borda.
        vec4 pore = noised(vP * 450.0);
        n = relief(n, 0.00012 * 450.0 * detailFade(0.0022, px) * pore.yzw);
        albedo *= 0.94 + 0.06 * pore.x;
        col = studio(albedo, n, v, 0.22, vec3(1.0, 0.75, 0.55), ndl);
        col += toLinear(uKeyColor) * smoothstep(0.25, 1.0, uLight) * pow(max(dot(n, H), 0.0), 20.0) * 0.1;
      #endif

      // Incandescência: o que está em foco ou trabalhando acende.
      float add = mix(1.0, 0.35, uRimMode);
      emit += glow * lit * (0.1 + 0.22 * lit) * add;
      // Borda da lente: a camada acende onde foi cortada.
      if (peel > 0.0) emit += glow * exp(-pow((lensD - peel) / max(2.0, uLens.z * 0.025), 2.0)) * 1.4;
      // Frente do corte: a superfície acende onde o plano a atravessa.
      if (uCut < 90.0) emit += glow * exp(-pow((dot(vW, uCutN) - uCut) / 0.005, 2.0)) * 1.2 * add;
      #ifdef MUSCLE
        // Frente da montagem.
        if (uGrow < 2.0) emit += glow * exp(-pow((grow - t) * 16.0, 2.0)) * 2.2;
      #endif
      #ifdef MUSCLE
        emit += (glow * sh * 0.6 + cool * st * 0.95) * add;
        // Origem e inserção do músculo em foco: as pontas da linha central acendem.
        float tt = clamp(vAlong, 0.0, 1.0);
        emit += glow * vS1.w * max(1.0 - smoothstep(0.035, 0.07, tt), smoothstep(0.93, 0.965, tt)) * 1.3 * add;
        // Halo de pigmento (claro): a silhueta do que está aceso puxa para laranja escuro em vez de brilhar.
        col = mix(col, glow * 0.3, pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0) * lit * uRimMode * 0.6);
      #endif
      col += emit;

      #if defined(GLASS)
        // Vidro: transparente de frente, a silhueta acende fria (no claro, escurece no pigmento). O que está aceso (destaque,
        // deformação) segue na cor dele.
        float edge = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.2);
        vec3 cold = toLinear(uRimColor) * mix(1.4, 0.35, uRimMode);
        vec3 gc = mix(cold, col, clamp(lit + 0.25, 0.0, 1.0));
        gl_FragColor = vec4(finish(gc * (0.35 + 1.3 * edge)), clamp(a * (0.1 + 1.6 * edge), 0.0, 0.9));
      #elif defined(TRANSLUCENT)
        float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
        // Translúcida (vulto, mais opaca na silhueta) até a metade; dali até 1 vai junto para opaca. Antes o alfa pulava
        // de ~0,4 para 1 no fim da entrada da pele (uAlpha 0,998 → 1).
        float alpha = mix(clamp(uAlpha * (mix(0.4, 0.55, uRimMode) + 1.6 * fres), 0.0, 1.0), 1.0, smoothstep(0.5, 1.0, uAlpha));
        gl_FragColor = vec4(finish(col), alpha * a);
      #else
        gl_FragColor = vec4(finish(col), 1.0);
      #endif
    #endif
  }
`;

export interface HandJoints {
  /** Índices das juntas `hand_r`, `hand_l`. */
  readonly hand: readonly [number, number];
  /** Índices de `forearm_r`, `forearm_l`. */
  readonly fore: readonly [number, number];
  /** Centro do punho direito e altura do cotovelo na ligação (o esquerdo é o espelho em X). */
  readonly wrist: readonly [number, number, number];
  readonly elbowY: number;
}

export interface BodyMaterialOptions {
  joints: number;
  muscle: boolean;
  translucent: boolean;
  pick: boolean;
  glass?: boolean;
  /** Juntas da mão e do antebraço (−1 = sem) e o punho e cotovelo na ligação. */
  hands: HandJoints;
  uniforms: BodyUniforms;
}

export function createBodyMaterial(o: BodyMaterialOptions): ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.muscle) defines.MUSCLE = '';
  if (o.translucent && !o.pick) defines.TRANSLUCENT = '';
  if (o.pick) defines.PICK = '';
  if (o.glass) defines.GLASS = '';
  const blend = (o.translucent || !!o.glass) && !o.pick;
  return new ShaderMaterial({
    vertexShader: vertex(o.joints, o.hands),
    fragmentShader: fragment,
    defines,
    uniforms: o.uniforms,
    side: blend ? FrontSide : DoubleSide,
    transparent: blend,
    depthWrite: !blend,
  });
}
