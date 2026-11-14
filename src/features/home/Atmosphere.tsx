/**
 * Atmosfera do herói: feixe de tungstênio vindo de cima, fumaça lenta dentro dele e poeira que só brilha onde a luz
 * passa. Um quadro em tela cheia, WebGL puro (GLSL ES 1.0), atrás do corpo (o palco transparente desenha por cima).
 * O feixe acompanha o ponteiro de leve e a poeira abre caminho em volta dele.
 *
 * Custo: meia resolução, só desenha com o herói na tela e a aba visível. Redução de movimento: um quadro parado.
 * Tema claro: desligado (luz somada em fundo claro não aparece). Sem WebGL: nada (a poça de luz em CSS continua).
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
uniform vec3 uRim;
uniform float uFade;

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

/* Poeira: uma partícula por célula, deriva para cima e oscila; tamanho e brilho por célula. */
float dust(vec2 p, float scale, float speed, float seed) {
  vec2 q = p * scale;
  q.y -= uTime * speed;
  vec2 id = floor(q);
  vec2 f = fract(q);
  float h = hash(id + seed);
  if (h < 0.55) return 0.0;
  vec2 c = vec2(hash(id + seed + 3.1), hash(id + seed + 7.7));
  c += 0.18 * vec2(sin(uTime * (0.3 + h) + h * 40.0), cos(uTime * (0.25 + h) + h * 23.0));
  float d = length(f - c);
  float size = mix(0.035, 0.11, hash(id + seed + 1.3));
  float tw = 0.55 + 0.45 * sin(uTime * (1.0 + 2.0 * h) + h * 60.0);
  return (1.0 - smoothstep(0.0, size, d)) * tw;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  vec2 body = vec2(uBody.x * aspect, uBody.y);
  vec2 ptr = vec2(uPtr.x * aspect, uPtr.y);

  /* Feixe: fonte acima do quadro, mira no corpo; o ponteiro desloca a fonte. */
  vec2 src = vec2(body.x + (uPtr.x - 0.5) * 0.35 * aspect + 0.18, 1.45);
  vec2 axis = normalize(body - src);
  vec2 rel = p - src;
  float along = dot(rel, axis);
  float across = abs(rel.x * axis.y - rel.y * axis.x);
  float width = 0.08 + along * 0.26;
  float cone = (1.0 - smoothstep(width * 0.15, width, across)) * smoothstep(0.0, 0.35, along);
  float fall = exp(-max(along, 0.0) * 0.55);
  float smoke = fbm(p * 2.6 + vec2(uTime * 0.03, -uTime * 0.05));
  float shaft = cone * fall * (0.35 + 0.9 * smoke);

  /* Poeira em três profundidades; só acende dentro do feixe (e um pouco fora, pela luz refletida). */
  vec2 away = p - ptr;
  float push = 0.06 * exp(-dot(away, away) * 18.0);
  vec2 pd = p + normalize(away + 1e-4) * push;
  float motes = dust(pd, 9.0, 0.020, 0.0) * 0.9 + dust(pd + 3.7, 16.0, 0.035, 11.0) * 0.6 + dust(pd + 9.1, 27.0, 0.05, 23.0) * 0.4;
  float lit = cone * fall * 1.6 + 0.08;
  float glow = exp(-dot(away, away) * 10.0) * 0.12;

  vec3 col = clamp(uKey * (shaft * 0.16 + motes * lit * 0.9) + uRim * glow * 0.6, 0.0, 1.0) * clamp(uFade, 0.0, 1.0);
  /* Pré-multiplicado: com a mistura "screen" do CSS, preto = nada; alfa = o canal mais forte. */
  gl_FragColor = vec4(col, max(max(col.r, col.g), col.b));
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
    if (!canvas || mode === 'light') return;
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
    const uRes = u('uRes'), uTime = u('uTime'), uPtr = u('uPtr'), uBody = u('uBody'), uKey = u('uKey'), uRim = u('uRim'), uFade = u('uFade');
    const css = getComputedStyle(document.documentElement);
    gl.uniform3fv(uKey, hexToRgb(css.getPropertyValue('--c-light-key') || '#fff1dc'));
    gl.uniform3fv(uRim, hexToRgb(css.getPropertyValue('--c-light-rim') || '#9fd0f0'));

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ptr = { x: 0.62, y: 0.6, tx: 0.62, ty: 0.6 };
    let visible = true;
    let raf = 0;
    const t0 = performance.now();

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
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

  if (mode === 'light') return null;
  return <canvas ref={ref} className="home-atmos" aria-hidden="true" />;
}
