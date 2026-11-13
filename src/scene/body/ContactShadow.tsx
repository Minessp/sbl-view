/**
 * Sombra de contato: elipse suave no chão, virada para a câmera, com um núcleo mais escuro sob cada pé.
 * Analítica (sem passe de profundidade): as vistas do site olham quase na horizontal, onde um plano de chão
 * apareceria de perfil. Os pontos de apoio chegam em coordenadas de mundo e o shader os projeta no eixo
 * lateral da câmera. Desenhada antes do corpo, sem profundidade, e acende junto com a luz do palco.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { Vec3 } from '@/engine/math/vec';
import { rig } from './rig';

const MAX_FEET = 8;

const vertex = /* glsl */ `
  uniform vec3 uCenter;
  uniform vec2 uSize;
  varying vec2 vUv;
  varying vec3 vRight;
  void main() {
    vUv = position.xy;
    vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
    vRight = right;
    vec3 w = uCenter + right * position.x * uSize.x + vec3(0.0, 1.0, 0.0) * position.y * uSize.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uCenter;
  uniform vec2 uSize;
  uniform vec3 uFeet[${MAX_FEET}];
  uniform float uCount;
  uniform float uLight;
  uniform vec3 uShadow;
  uniform float uStrength;
  varying vec2 vUv;
  varying vec3 vRight;
  void main() {
    vec2 q = vUv * 2.0;
    float broad = exp(-dot(q, q) * 2.4) * 0.45;
    float core = 0.0;
    for (int i = 0; i < ${MAX_FEET}; i++) {
      if (float(i) >= uCount) break;
      float fx = dot(uFeet[i] - uCenter, vRight);
      float dx = (vUv.x * uSize.x - fx) / 0.075;
      float dy = (vUv.y * uSize.y) / 0.012;
      core = max(core, exp(-(dx * dx + dy * dy)));
    }
    float s = clamp(broad + core * 0.6, 0.0, 1.0) * uStrength * smoothstep(0.0, 0.8, uLight);
    gl_FragColor = vec4(uShadow, s);
  }
`;

export function ContactShadow({ feet, strength = 0.8 }: { feet: () => readonly Vec3[]; strength?: number }) {
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uCenter: { value: new Vector3() },
          uSize: { value: [0.9, 0.09] },
          uFeet: { value: Array.from({ length: MAX_FEET }, () => new Vector3()) },
          uCount: { value: 0 },
          uLight: rig.uLight,
          uShadow: rig.uShadow,
          uStrength: { value: strength },
        },
      }),
    [strength],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    const pts = feet();
    const u = material.uniforms;
    const list = u.uFeet?.value as Vector3[];
    const center = u.uCenter?.value as Vector3;
    center.set(0, 0.002, 0);
    const n = Math.min(MAX_FEET, pts.length);
    for (let i = 0; i < n; i++) {
      const p = pts[i] ?? [0, 0, 0];
      list[i]?.set(p[0], 0.002, p[2]);
      center.x += p[0] / n;
      center.z += p[2] / n;
    }
    if (u.uCount) u.uCount.value = n;
    // Largura acompanha o espalhamento dos apoios (camadas abertas na abertura).
    let r = 0;
    for (let i = 0; i < n; i++) {
      const q = list[i];
      if (q) r = Math.max(r, Math.hypot(q.x - center.x, q.z - center.z));
    }
    const size = u.uSize?.value as number[];
    size[0] = Math.max(0.9, 2 * r + 0.5);
  });

  return <mesh geometry={geometry} material={material} renderOrder={-1} frustumCulled={false} />;
}
