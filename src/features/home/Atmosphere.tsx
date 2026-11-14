/**
 * Atmosfera do herói: feixe de tungstênio vindo de cima, fumaça lenta dentro dele e poeira luminosa nítida em duas
 * profundidades, acesa no feixe e em volta do corpo. Um quadro em tela cheia, WebGL puro (GLSL ES 1.0),
 * atrás do corpo (o palco transparente desenha por cima). O feixe acompanha o ponteiro e a poeira abre caminho.
 *
 * Custo: resolução cheia (o shader é leve), só desenha com o herói na tela e a aba visível. Redução de movimento: um quadro parado.
 * Tema claro: o feixe clareia o ciclorama e a poeira vira faísca âmbar (mistura normal).
 * Sem WebGL: nada (a poça de luz em CSS continua).
 */
import { useEffect, useRef } from 'react';
import { useTheme } from '@/ui/theme';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPtr;
uniform vec2 uBody;
uniform vec3 uKey;
uniform vec3 uLine;
uniform float uFade;
uniform float uLight;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

/*
 * Uma partícula por célula (algumas células vazias): núcleo nítido (disco de cr, borda de ~1 px) e halo curto. Tudo em
 * unidades da célula; a partícula fica a ≥ 0,25 da borda e o halo zera antes disso (nada de quadrado cortado).
 * Deriva para cima balançando, cintila e, rara, lampeja.
 */
float dust(vec2 p, float scale, float speed, float seed, float cr, float density) {
  vec2 q = p * scale;
  q.y -= uTime * speed * scale;
  q.x += sin(q.y * 0.6 + seed) * 0.25;
  vec2 id = floor(q);
  vec2 f = fract(q);
  float h = hash(id + seed);
  if (h > density) return 0.0;
  vec2 c = vec2(hash(id + seed + 3.1), hash(id + seed + 7.7)) * 0.4 + 0.3;
  c += 0.05 * vec2(sin(uTime * (0.3 + h) + h * 40.0), cos(uTime * (0.25 + h) + h * 23.0));
  float r = length(f - c);
  float rr = cr * mix(0.6, 1.0, hash(id + seed + 1.3));
  float aa = 0.9 * scale / uRes.y; /* ~1 px em unidades da célula */
  float core = 1.0 - smoothstep(rr - aa, rr + aa, r);
  float glow = exp(-(r * r) / (0.0036)) * 0.22;
  float tw = 0.45 + 0.55 * sin(uTime * (0.9 + 2.0 * h) + h * 60.0);
  float flash = pow(max(0.0, sin(uTime * (0.35 + h) + h * 90.0)), 60.0) * 1.4;
  return (core + glow) * max(0.0, tw + flash);
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  vec2 body = vec2(uBody.x * aspect, uBody.y);
  vec2 ptr = vec2(uPtr.x * aspect, uPtr.y);
  float t = uTime;

  /* Feixe: fonte acima do quadro, mira no corpo; o ponteiro desloca a fonte. */
  vec2 src = vec2(body.x + (uPtr.x - 0.5) * 0.35 * aspect + 0.18, 1.45);
  vec2 axis = normalize(body - src);
  vec2 rel = p - src;
  float along = dot(rel, axis);
  float across = abs(rel.x * axis.y - rel.y * axis.x);
  float width = 0.08 + max(along, 0.0) * 0.26;
  float cone = (1.0 - smoothstep(width * 0.15, width, across)) * smoothstep(0.0, 0.35, along);
  float fall = exp(-max(along, 0.0) * 0.55);
  float beam = cone * fall;

  /* Poeira em duas profundidades (perto maior e mais lenta, longe fina). O ponteiro abre caminho. */
  vec2 away = p - ptr;
  float near = exp(-dot(away, away) * 14.0);
  vec2 pd = p + normalize(away + 1e-4) * near * 0.07;
  float motes = dust(pd + 3.7, 9.0, 0.018, 11.0, 0.028, 0.42) * 1.0
              + dust(pd + 9.1, 17.0, 0.03, 23.0, 0.034, 0.38) * 0.6;
  float smoke = fbm(p * 2.4 + vec2(t * 0.03, -t * 0.05));
  vec2 db = (p - body) * vec2(1.2, 0.8);
  float halo = exp(-dot(db, db) * 1.4);
  /* Presente na sala inteira, acesa de verdade dentro do feixe e em volta do corpo. */
  float lit = 0.16 + beam * 1.8 + halo * 0.35 + near * 0.5;
  /* Desktop (corpo à direita): sobre a coluna de texto a poeira recua, para não brigar com a leitura. */
  float text = uBody.x > 0.6 ? mix(0.28, 1.0, smoothstep(0.26, 0.5, vUv.x)) : 1.0;
  motes *= text;

  float fade = clamp(uFade, 0.0, 1.0);
  if (uLight < 0.5) {
    vec3 tint = mix(uKey, vec3(1.0), clamp(motes * 0.6, 0.0, 1.0));
    vec3 col = uKey * beam * (0.12 + 0.18 * smoke) + tint * motes * lit * 0.6;
    col = clamp(col, 0.0, 1.0) * fade;
    gl_FragColor = vec4(col, max(max(col.r, col.g), col.b));
  } else {
    /* Ciclorama: o feixe clareia o fundo e a poeira vira faísca âmbar. */
    float sh = clamp(beam * (0.35 + 0.4 * smoke), 0.0, 1.0) * 0.55 * fade;
    float ln = clamp(motes * lit * 0.5, 0.0, 1.0) * fade;
    vec3 c = vec3(1.0) * sh * (1.0 - ln) + uLine * ln;
    gl_FragColor = vec4(c, sh + ln - sh * ln);
  }
}`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

export default function Atmosphere() {
  const ref = useRef<HTMLCanvasElement>(null);
  const mode = useTheme((s) => s.mode);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('uRes'), uTime = u('uTime'), uPtr = u('uPtr'), uBody = u('uBody'), uKey = u('uKey'), uLine = u('uLine'), uFade = u('uFade'), uLight = u('uLight');
    const css = getComputedStyle(document.documentElement);
    gl.uniform3fv(uKey, hexToRgb(css.getPropertyValue('--c-light-key') || '#fff1dc'));
    gl.uniform3fv(uLine, hexToRgb(css.getPropertyValue('--c-glow') || '#f2a03c'));
    gl.uniform1f(uLight, mode === 'light' ? 1 : 0);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ptr = { x: 0.62, y: 0.6, tx: 0.62, ty: 0.6 };
    let visible = true;
    let raf = 0;
    const t0 = performance.now();

    const resize = () => {
      // Resolução cheia (até 2×): a partícula é um disco de 2–3 px e precisa de borda nítida.
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      // Corpo à direita do texto no desktop; no meio no celular.
      gl.uniform2f(uBody, window.innerWidth >= 900 ? 0.66 : 0.5, 0.45);
    };

    const draw = (now: number) => {
      raf = 0;
      ptr.x += (ptr.tx - ptr.x) * 0.06;
      ptr.y += (ptr.ty - ptr.y) * 0.06;
      // Abertura das camadas: a Home escreve inline no html (ler o estilo calculado a cada quadro custaria um recálculo).
      const ex = parseFloat(document.documentElement.style.getPropertyValue('--home-ex')) || 0;
      gl.uniform1f(uTime, reduce ? 12 : (now - t0) / 1000);
      gl.uniform2f(uPtr, ptr.x, ptr.y);
      gl.uniform1f(uFade, Math.max(0, 1 - ex * 0.7));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce && visible && document.visibilityState === 'visible') raf = requestAnimationFrame(draw);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ptr.tx = (e.clientX - r.left) / Math.max(1, r.width);
      ptr.ty = 1 - (e.clientY - r.top) / Math.max(1, r.height);
      if (reduce) kick();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) kick();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      kick();
    });
    ro.observe(canvas);
    const onVis = () => document.visibilityState === 'visible' && kick();
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    resize();
    kick();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      // Sem loseContext: no StrictMode o efeito roda duas vezes no mesmo canvas e a segunda pegaria o contexto perdido.
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [mode]);

  // Canvas novo por tema (o efeito relê as cores e o modo de mistura muda no CSS).
  return <canvas key={mode} ref={ref} className="home-atmos" data-mode={mode} aria-hidden="true" />;
}
