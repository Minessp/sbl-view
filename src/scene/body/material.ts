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
 * Músculo: brilho anisotrópico ao longo da fibra (Kajiya-Kay; direção da fibra = atributo por vértice, a linha central
 * projetada na superfície), estrias em relevo (fascículos e fibras: ruído 3D esticado ao longo da fibra, na pose de
 * ligação, gradiente analítico levado à superfície posada) e transição para o tendão pela fração tendínea do vértice, com borda
 * irregular. O relevo some antes de o padrão ficar menor que alguns pixels. Osso: marfim fosco, poroso de perto.
 * Pele: translúcida, mais opaca na silhueta (Fresnel), microrrelevo de perto.
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

const vertex = (joints: number) => /* glsl */ `
  #define JOINTS ${joints}
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
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vW;
  varying vec3 vP;
  varying mat3 vMv;
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
    // Relevo procedural na pose de ligação: fica preso ao corpo quando ele se move.
    vP = position;
    // Ligação → vista (posado): leva o gradiente do relevo para a superfície posada.
    vMv = mat3(modelViewMatrix) * mat3(M);
    vec4 p = M * vec4(position, 1.0);
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
      #ifndef TRANSLUCENT
      if (a < 0.999 && ign(gl_FragCoord.xy) > a) discard;
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
      #ifdef MUSCLE
        // Frente da montagem.
        if (uGrow < 2.0) emit += glow * exp(-pow((grow - t) * 16.0, 2.0)) * 2.2;
      #endif
      #ifdef MUSCLE
        emit += (glow * sh * 0.6 + cool * st * 0.95) * add;
        // Halo de pigmento (claro): a silhueta do que está aceso puxa para laranja escuro em vez de brilhar.
        col = mix(col, glow * 0.3, pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0) * lit * uRimMode * 0.6);
      #endif
      col += emit;

      #ifdef TRANSLUCENT
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
