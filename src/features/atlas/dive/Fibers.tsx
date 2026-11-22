/**
 * Nível "Fibras" do mergulho: quadro cheio em GLSL (canvas próprio, fora do palco) com fascículos cilíndricos correndo na
 * direção da fibra do ponto de entrada (ângulo na tela, da origem para a inserção). Ilustração: nada aqui é medido.
 * Redução de movimento: um quadro parado.
 */
import { useEffect, useRef } from 'react';

const VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
const FRAG = /* glsl */ `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uAng;
uniform vec3 uMus;
uniform vec3 uGlow;
uniform vec3 uBg;
uniform vec3 uTendon;
float h(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec2 p =(gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float c = cos(uAng), s = sin(uAng);
  vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  // Fascículo: faixa transversal com largura, ondulação e tom próprios; dentro dele, fibras cilíndricas.
  float w = 0.16;
  float cell = floor(q.y / w);
  float jit = h(cell * 7.13 + 1.7);
  float y = fract(q.y / w) + 0.04 * sin(q.x * 2.2 + jit * 6.283);
  float yc = clamp(y, 0.0, 1.0);
  float prof = sin(yc * 3.14159);
  float n = 6.0 + floor(jit * 3.0);
  float fy = fract(yc * n + 0.3 * sin(q.x * 9.0 + cell));
  float fiber = pow(sin(fy * 3.14159), 0.6);
  float flow = q.x + uTime * 0.03 * (0.6 + 0.8 * jit);
  // Estria (bandas do sarcômero): linhas finas e escuras ao longo da fibra.
  float stria = smoothstep(0.82, 1.0, sin(flow * 520.0 + floor(yc * n) * 1.7));
  vec3 col = uMus * (0.25 + 1.0 * prof) * (0.55 + 0.45 * fiber) * (0.85 + 0.3 * jit) * (1.0 - 0.18 * stria);
  col += uGlow * pow(prof * fiber, 10.0) * 0.32;
  // Perimísio: tecido conjuntivo claro e fino entre os fascículos.
  float edge = 1.0 - smoothstep(0.0, 0.05, min(yc, 1.0 - yc));
  col = mix(col, uTendon * 0.55, edge * 0.85);
  float vig = smoothstep(1.25, 0.25, length(p));
  gl_FragColor = vec4(mix(uBg, col, vig), 1.0);
}`;

function rgb(css: CSSStyleDeclaration, name: string, fallback: string): [number, number, number] {
  const h = (css.getPropertyValue(name).trim() || fallback).replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (x) => x + x) : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

/** `angle`: direção da fibra na tela (rad, anti-horário a partir do eixo x, y para cima). */
export function Fibers({ angle, label }: { angle: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl', { antialias: false });
    if (!canvas || !gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const css = getComputedStyle(document.documentElement);
    gl.uniform3fv(u('uMus'), rgb(css, '--c-body-muscle', '#7a2c2a'));
    gl.uniform3fv(u('uGlow'), rgb(css, '--c-glow', '#f8b65d'));
    gl.uniform3fv(u('uBg'), rgb(css, '--c-bg', '#0b0d10'));
    gl.uniform3fv(u('uTendon'), rgb(css, '--c-body-tendon', '#d8cbb4'));
    gl.uniform1f(u('uAng'), angle);
    const uRes = u('uRes'), uTime = u('uTime');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(canvas.clientWidth * scale), h = Math.round(canvas.clientHeight * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, reduce ? 0 : (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [angle]);
  return <canvas ref={ref} className="dive-fibers" role="img" aria-label={label} />;
}
