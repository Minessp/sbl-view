/**
 * Material do corpo anatômico. Skinning linear na GPU (reproduz `engine/kinematics/skinning.ts`), estado por vaga
 * lido de uma textura, plano de corte por camada e passe de seleção (a cor codifica o índice da vaga).
 *
 * Estado (2 texels por vaga, RGBA float):
 *   linha 0: destaque, opacidade, calor, ativação (0..1)
 *   linha 1: oculto (> 0,5), volume (fração radial somada ao ventre), —, —
 * Opacidade abaixo de 1 vira pontilhado (sem ordenar transparência); a pele é a única camada com mistura.
 * Iluminação de estúdio fixa no espaço da vista. Cores chegam como sRGB cru (`flat`): Fase 9 refaz a luz.
 */
import { DoubleSide, FrontSide, ShaderMaterial, type DataTexture, type IUniform, type Matrix4, type Vector3 } from 'three';

export const STATE_ROWS = 2;

export interface BodyUniforms {
  [name: string]: IUniform;
  uJoints: IUniform<Matrix4[]>;
  uState: IUniform<DataTexture>;
  uStateW: IUniform<number>;
  uColor: IUniform<Vector3>;
  uAccent: IUniform<Vector3>;
  uInk: IUniform<Vector3>;
  uBg: IUniform<Vector3>;
  /** Alfa da camada (só a pele mistura). */
  uAlpha: IUniform<number>;
  /** Acima desta altura (m) a camada vira fantasma. */
  uCut: IUniform<number>;
  /** Opacidade do fantasma acima do corte. */
  uGhost: IUniform<number>;
  /** Abaixo desta altura (m) a camada não aparece: o que está sob a pele intacta fica escondido. */
  uShowAbove: IUniform<number>;
}

const vertex = (joints: number) => /* glsl */ `
  #define JOINTS ${joints}
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
  attribute float aSlot;
  #ifdef MUSCLE
  attribute float aAlong;
  attribute vec3 aRadial;
  #endif
  uniform mat4 uJoints[JOINTS];
  uniform sampler2D uState;
  uniform float uStateW;
  varying vec3 vN;
  varying vec3 vView;
  varying float vY;
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
    // Volume preservado: ao encurtar, o ventre engrossa; as pontas (tendão) quase não mudam.
    float belly = sin(3.14159265 * clamp(aAlong, 0.0, 1.0));
    p.xyz += mat3(M) * aRadial * (vS1.y * belly);
    #endif
    vec4 w = modelMatrix * p;
    vY = w.y;
    vec4 mv = viewMatrix * w;
    vView = mv.xyz;
    vN = normalize(normalMatrix * (mat3(M) * normal));
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform vec3 uInk;
  uniform vec3 uBg;
  uniform float uAlpha;
  uniform float uCut;
  uniform float uGhost;
  uniform float uShowAbove;
  varying vec3 vN;
  varying vec3 vView;
  varying float vY;
  varying vec4 vS0;
  varying vec4 vS1;
  varying float vSlot;

  // Ruído de gradiente intercalado: pontilhado estável, sem textura.
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  void main() {
    if (vS1.x > 0.5 || vY < uShowAbove) discard;
    float a = vS0.y * (vY > uCut ? uGhost : 1.0);
    #ifdef PICK
      if (a < 0.5) discard;
      float id = floor(vSlot + 0.5) + 1.0;
      gl_FragColor = vec4(mod(id, 256.0) / 255.0, floor(id / 256.0) / 255.0, 0.0, 1.0);
    #else
      #ifndef TRANSLUCENT
      if (a < 0.999 && ign(gl_FragCoord.xy) > a) discard;
      #endif
      vec3 n = normalize(vN);
      if (!gl_FrontFacing) n = -n;
      vec3 v = normalize(-vView);
      vec3 key = normalize(vec3(-0.45, 0.6, 0.66));
      vec3 fill = normalize(vec3(0.7, 0.1, 0.4));
      float lk = max(dot(n, key), 0.0);
      float lf = max(dot(n, fill), 0.0);
      float spec = pow(max(dot(n, normalize(key + v)), 0.0), 36.0);
      float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);
      float stain = max(vS0.x, max(vS0.z, vS0.w));
      vec3 base = mix(uColor, uAccent, stain);
      vec3 col = base * (0.34 + 0.62 * lk + 0.22 * lf) + vec3(0.16) * spec + mix(uBg, uInk, 0.25) * rim * 0.22;
      #ifdef TRANSLUCENT
      gl_FragColor = vec4(col, uAlpha * a);
      #else
      gl_FragColor = vec4(col, 1.0);
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
