/**
 * Passes do pipeline de cinema (GLSL próprio). Todos desenham um triângulo de tela cheia.
 * Convenções: cor HDR linear pré-multiplicada pelo alfa (o fundo do canvas é transparente: o CSS atrás aparece);
 * `uRect` = recorte da vista principal em px do alvo cheio (x, y a partir de baixo, largura, altura).
 */

export const QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Profundidade → distância (m) na câmera principal, e o círculo de confusão em px do alvo cheio (sinal: − perto, + longe). */
const DEPTH_GLSL = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uNearFar;
  uniform vec4 uRect;
  uniform vec2 uFull;
  uniform float uFocus;
  uniform float uCocScale;
  uniform float uCocMax;
  uniform float uPull;
  float viewZ(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    float n = uNearFar.x, f = uNearFar.y;
    return (2.0 * n * f) / (f + n - (d * 2.0 - 1.0) * (f - n));
  }
  bool inMain(vec2 uv) {
    vec2 p = uv * uFull;
    return p.x >= uRect.x && p.y >= uRect.y && p.x <= uRect.x + uRect.z && p.y <= uRect.y + uRect.w;
  }
  float cocAt(vec2 uv) {
    if (!inMain(uv)) return 0.0;
    float d = texture2D(tDepth, uv).r;
    // Fundo vazio (transparente): nada a desfocar; desfocar vazaria a cor do corpo para fora da silhueta.
    if (d >= 0.99999) return 0.0;
    float z = viewZ(uv);
    float c = uCocScale * (z - uFocus) / max(z, 1e-3);
    // Puxada de foco: tudo abre para o raio máximo.
    c = mix(c, uCocMax * (c >= 0.0 ? 1.0 : -1.0), uPull);
    return clamp(c, -uCocMax, uCocMax);
  }
`;

/**
 * Profundidade de campo em meia resolução: disco de bokeh por espiral áurea (espalhar-como-reunir, Gustafsson 2018).
 * Amostra mais distante que o centro só contribui até 2× o círculo do centro (o fundo não vaza sobre o nítido da frente).
 */
export const DOF_FS = /* glsl */ `
  uniform sampler2D tColor;
  ${DEPTH_GLSL}
  varying vec2 vUv;
  const float GOLDEN = 2.39996323;
  void main() {
    float cc = abs(cocAt(vUv));
    vec4 center = texture2D(tColor, vUv);
    if (cc < 0.75 && uPull < 0.001) { gl_FragColor = center; return; }
    // Meia resolução: o raio em px do alvo cheio vale metade aqui; passo em px cheios.
    vec2 texel = 1.0 / uFull;
    float zc = viewZ(vUv);
    vec4 acc = center;
    float tot = 1.0;
    float radius = 1.5;
    float ang = 0.0;
    for (int i = 0; i < 96; i++) {
      if (radius >= uCocMax) break;
      ang += GOLDEN;
      vec2 tc = vUv + vec2(cos(ang), sin(ang)) * texel * radius;
      vec4 s = texture2D(tColor, tc);
      float sz = abs(cocAt(tc));
      if (viewZ(tc) > zc) sz = clamp(sz, 0.0, cc * 2.0);
      float m = smoothstep(radius - 0.5, radius + 0.5, sz);
      acc += mix(acc / tot, s, m);
      tot += 1.0;
      radius += 2.2 / radius;
    }
    gl_FragColor = acc / tot;
  }
`;

/**
 * Oclusão de ambiente (estilo SAO, McGuire 2012) em meia resolução, só pela profundidade: posição na vista
 * reconstruída, normal pela derivada; 12 amostras em espiral girada por pixel. Raio em metros.
 */
export const AO_FS = /* glsl */ `
  ${DEPTH_GLSL}
  uniform mat4 uProjInv;
  uniform float uProjScale;
  uniform float uRadius;
  uniform float uIntensity;
  varying vec2 vUv;
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    float d = texture2D(tDepth, vUv).r;
    if (d >= 0.99999 || !inMain(vUv)) { gl_FragColor = vec4(1.0); return; }
    vec3 p = viewPos(vUv);
    // Normal pela menor diferença de cada lado (dFdx em blocos 2 × 2 mistura frente e fundo na borda de cavidade:
    // a normal saltava e a oclusão piscava no umbigo, axila, orelha).
    vec2 tx = 2.0 / uFull;
    vec3 pr = viewPos(vUv + vec2(tx.x, 0.0)) - p, pl = p - viewPos(vUv - vec2(tx.x, 0.0));
    vec3 pu = viewPos(vUv + vec2(0.0, tx.y)) - p, pd = p - viewPos(vUv - vec2(0.0, tx.y));
    vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl;
    vec3 dy = abs(pu.z) < abs(pd.z) ? pu : pd;
    vec3 n = normalize(cross(dx, dy));
    float rpx = uRadius * uProjScale / max(-p.z, 1e-3);
    float ao = 0.0;
    // Giro em padrão 4 × 4 fixo por pixel: o desfoque 4 × 4 depois cobre o período inteiro e o ruído some (sem piscar).
    vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);
    float spin = (cell.x * 4.0 + mod(cell.y * 3.0 + cell.x, 4.0)) / 16.0 * 6.2831853;
    const int N = 12;
    for (int i = 0; i < N; i++) {
      float a = (float(i) + 0.5) / float(N);
      float ang = a * 7.0 * 6.2831853 + spin;
      vec2 off = vec2(cos(ang), sin(ang)) * rpx * a / uFull;
      vec3 q = viewPos(vUv + off);
      vec3 v = q - p;
      float vv = dot(v, v);
      float vn = dot(v, n);
      float f = max(uRadius * uRadius - vv, 0.0);
      ao += f * f * f * max((vn - 0.002 * -p.z) / (0.0001 + vv), 0.0);
    }
    ao /= pow(uRadius, 6.0) * float(N);
    gl_FragColor = vec4(vec3(clamp(1.0 - uIntensity * ao, 0.0, 1.0)), 1.0);
  }
`;

/** Desfoque da oclusão que respeita a profundidade (4 × 4). */
export const AO_BLUR_FS = /* glsl */ `
  uniform sampler2D tAo;
  uniform sampler2D tDepth;
  uniform vec2 uHalf;
  varying vec2 vUv;
  void main() {
    float dc = texture2D(tDepth, vUv).r;
    float s = 0.0, w = 0.0;
    for (int y = -2; y < 2; y++) {
      for (int x = -2; x < 2; x++) {
        vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) / uHalf;
        float k = 1.0 / (1e-5 + abs(texture2D(tDepth, uv).r - dc) * 4000.0);
        s += texture2D(tAo, uv).r * k;
        w += k;
      }
    }
    gl_FragColor = vec4(vec3(s / w), 1.0);
  }
`;

/**
 * Bloom: descida em 13 amostras (Jimenez 2014) com limiar suave e média de Karis no primeiro degrau (sem vaga-lume),
 * subida em tenda 3 × 3 somada.
 */
export const BLOOM_DOWN_FS = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uSrcTexel;
  uniform float uFirst;
  uniform vec2 uThreshold;
  varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  vec3 pre(vec3 c) {
    float br = max(c.r, max(c.g, c.b));
    float soft = clamp(br - uThreshold.x + uThreshold.y, 0.0, 2.0 * uThreshold.y);
    soft = soft * soft / (4.0 * uThreshold.y + 1e-4);
    float k = max(soft, br - uThreshold.x) / max(br, 1e-4);
    return c * k;
  }
  vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uSrcTexel).rgb; }
  vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) {
    if (uFirst < 0.5) return (a + b + c + d) * 0.25;
    a = pre(a); b = pre(b); c = pre(c); d = pre(d);
    float wa = 1.0 / (1.0 + lum(a)), wb = 1.0 / (1.0 + lum(b)), wc = 1.0 / (1.0 + lum(c)), wd = 1.0 / (1.0 + lum(d));
    return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  }
  void main() {
    vec3 A = tap(vec2(-2.0, 2.0)), B = tap(vec2(0.0, 2.0)), C = tap(vec2(2.0, 2.0));
    vec3 D = tap(vec2(-2.0, 0.0)), E = tap(vec2(0.0, 0.0)), F = tap(vec2(2.0, 0.0));
    vec3 G = tap(vec2(-2.0, -2.0)), H = tap(vec2(0.0, -2.0)), I = tap(vec2(2.0, -2.0));
    vec3 J = tap(vec2(-1.0, 1.0)), K = tap(vec2(1.0, 1.0)), L = tap(vec2(-1.0, -1.0)), M = tap(vec2(1.0, -1.0));
    vec3 c = karis(J, K, L, M) * 0.5
      + (karis(A, B, D, E) + karis(B, C, E, F) + karis(D, E, G, H) + karis(E, F, H, I)) * 0.125;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export const BLOOM_UP_FS = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uSrcTexel;
  uniform float uRadius;
  uniform float uWeight;
  varying vec2 vUv;
  void main() {
    vec2 r = uSrcTexel * uRadius;
    vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
    c += (texture2D(tSrc, vUv + vec2(-r.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(r.x, 0.0)).rgb
        + texture2D(tSrc, vUv + vec2(0.0, -r.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, r.y)).rgb) * 2.0;
    c += texture2D(tSrc, vUv + vec2(-r.x, -r.y)).rgb + texture2D(tSrc, vUv + vec2(r.x, -r.y)).rgb
       + texture2D(tSrc, vUv + vec2(-r.x, r.y)).rgb + texture2D(tSrc, vUv + vec2(r.x, r.y)).rgb;
    gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);
  }
`;

/**
 * Feixe: o ar atrás do corpo brilha perto da fonte e o corpo faz sombra nele (desfoque radial rumo à fonte,
 * Mitchell 2007). Meia resolução. Só onde não há corpo na frente fica o brilho direto; os raios passam pelas frestas.
 */
export const RAYS_FS = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uLight;
  uniform float uAspect;
  uniform float uSpread;
  uniform vec3 uTint;
  uniform float uStrength;
  uniform vec4 uRect;
  uniform vec2 uFull;
  varying vec2 vUv;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  float source(vec2 uv) {
    vec2 p = uv * uFull;
    if (p.x < uRect.x || p.y < uRect.y || p.x > uRect.x + uRect.z || p.y > uRect.y + uRect.w) return 0.0;
    vec2 d = (uv - uLight) * vec2(uAspect, 1.0);
    float glow = exp(-dot(d, d) / (uSpread * uSpread));
    return glow * (1.0 - texture2D(tColor, uv).a);
  }
  void main() {
    const int N = 56;
    vec2 delta = (vUv - uLight) / float(N) * 0.92;
    vec2 uv = vUv - delta * ign(gl_FragCoord.xy);
    float acc = 0.0;
    float w = 1.0;
    for (int i = 0; i < N; i++) {
      acc += source(uv) * w;
      w *= 0.975;
      uv -= delta;
    }
    gl_FragColor = vec4(uTint * acc * uStrength / float(N) * 3.0, 1.0);
  }
`;

/**
 * Composição final na tela: profundidade de campo (mistura nítido/desfocado pelo círculo de confusão), aberração
 * cromática de borda, oclusão, bloom, feixe; tom (AgX), sRGB, vinheta e grão sobre a cena, pontilhado de 8 bits.
 */
export const COMPOSITE_FS = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDof;
  uniform sampler2D tAo;
  uniform sampler2D tBloom;
  uniform sampler2D tRays;
  uniform float uUseDof;
  uniform float uUseAo;
  uniform float uUseBloom;
  uniform float uUseRays;
  uniform float uBloom;
  uniform float uCA;
  uniform float uGrain;
  uniform float uTime;
  uniform float uLightTheme;
  ${DEPTH_GLSL}
  varying vec2 vUv;

  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  // AgX (Sobotka), ajuste polinomial de Missing Deadlines; olhar "punchy" leve.
  vec3 agxCurve(vec3 x) {
    vec3 x2 = x * x, x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  }
  vec3 agx(vec3 c) {
    const mat3 inM = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                          0.0784335999999992, 0.878468636469772, 0.0784336,
                          0.0792237451477643, 0.0791661274605434, 0.879142973793104);
    const mat3 outM = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                           -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                           -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
    c = inM * max(c, 0.0);
    c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
    c = agxCurve(c);
    // Punch: um pouco mais de saturação e contraste que o AgX base.
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = l + 1.12 * (c - l);
    c = outM * c;
    return clamp(pow(max(c, 0.0), vec3(2.2)), 0.0, 1.0);
  }

  vec4 lens(vec2 uv) {
    vec4 s = texture2D(tColor, uv);
    if (uUseDof > 0.5) {
      float c = abs(cocAt(uv));
      s = mix(s, texture2D(tDof, uv), smoothstep(1.4, 4.0, c));
    }
    return s;
  }

  void main() {
    vec2 dir = vUv - 0.5;
    vec2 ca = dir * dot(dir, dir) * uCA;
    vec4 base = lens(vUv);
    vec4 col = base;
    if (uCA > 0.0) {
      col.r = lens(vUv + ca).r;
      col.b = lens(vUv - ca).b;
    }
    if (uUseAo > 0.5) col.rgb *= mix(1.0, texture2D(tAo, vUv).r, col.a);
    vec3 light = vec3(0.0);
    if (uUseBloom > 0.5) light += texture2D(tBloom, vUv).rgb * uBloom;
    // Raios só dentro da vista principal (fora dela vazavam pela página ao rolar).
    if (uUseRays > 0.5 && inMain(vUv)) light += texture2D(tRays, vUv).rgb;
    col.rgb += light;
    vec3 rgb = agx(col.rgb);
    // Pré-multiplicado: luz sobre o fundo transparente cobre o fundo na medida do próprio brilho.
    float a = clamp(max(col.a, max(rgb.r, max(rgb.g, rgb.b)) * (1.0 - uLightTheme * 0.6)), 0.0, 1.0);
    rgb = pow(rgb, vec3(1.0 / 2.2));
    // Grão de película só sobre o que a cena desenhou (o resto da tela tem a película do CSS).
    float g = hash(gl_FragCoord.xy + fract(uTime) * 917.0) - 0.5;
    rgb += g * uGrain * a;
    rgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(max(rgb, 0.0), a);
  }
`;

/**
 * Antisserrilhado depois do tom (FXAA, Lottes 2009, versão compacta): o MSAA resolve em HDR, antes do tom, e a borda
 * acesa da silhueta (contraluz acima de 1) volta a serrilhar quando o tom comprime. Cor pré-multiplicada, alfa junto.
 */
export const FXAA_FS = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  float luma(vec4 c) { return dot(c.rgb, vec3(0.299, 0.587, 0.114)); }
  void main() {
    vec4 cM = texture2D(tSrc, vUv);
    vec4 cNW = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel);
    vec4 cNE = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel);
    vec4 cSW = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel);
    vec4 cSE = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel);
    float lM = luma(cM), lNW = luma(cNW), lNE = luma(cNE), lSW = luma(cSW), lSE = luma(cSE);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = cM; return; }
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
    vec4 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)) + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)));
    vec4 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5) + texture2D(tSrc, vUv + dir * 0.5));
    float lB = luma(b);
    gl_FragColor = (lB < lMin || lB > lMax) ? a : b;
  }
`;
