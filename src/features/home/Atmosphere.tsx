/**
 * Atmosfera do herói: feixe de tungstênio vindo de cima com fumaça lenta dentro dele. Um quadro em tela cheia, WebGL
 * puro (GLSL ES 1.0), atrás do corpo (o palco transparente desenha por cima). O feixe acompanha o ponteiro.
 *
 * Custo: meia resolução (feixe e fumaça são suaves), só desenha com o herói na tela e a aba visível. Redução de
 * movimento: um quadro parado. Tema claro: o feixe clareia o ciclorama (mistura normal).
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

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  vec2 body = vec2(uBody.x * aspect, uBody.y);
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

  float smoke = fbm(p * 2.4 + vec2(t * 0.03, -t * 0.05));

  float fade = clamp(uFade, 0.0, 1.0);
  if (uLight < 0.5) {
    vec3 col = clamp(uKey * beam * (0.12 + 0.18 * smoke), 0.0, 1.0) * fade;
    gl_FragColor = vec4(col, max(max(col.r, col.g), col.b));
  } else {
    /* Ciclorama: o feixe clareia o fundo. */
    float sh = clamp(beam * (0.35 + 0.4 * smoke), 0.0, 1.0) * 0.55 * fade;
    gl_FragColor = vec4(vec3(sh), sh);
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
    const uRes = u('uRes'), uTime = u('uTime'), uPtr = u('uPtr'), uBody = u('uBody'), uKey = u('uKey'), uFade = u('uFade'), uLight = u('uLight');
    const css = getComputedStyle(document.documentElement);
    gl.uniform3fv(uKey, hexToRgb(css.getPropertyValue('--c-light-key') || '#fff1dc'));
    gl.uniform1f(uLight, mode === 'light' ? 1 : 0);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ptr = { x: 0.62, y: 0.6, tx: 0.62, ty: 0.6 };
    let visible = true;
    let raf = 0;
    const t0 = performance.now();

    const resize = () => {
      // Meia resolução: feixe e fumaça não têm borda nítida.
      const scale = 0.5;
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
