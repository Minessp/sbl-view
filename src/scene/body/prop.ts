/** Material do equipamento (barra, anilha): metal escovado sob a mesma luz do corpo. */
import { ShaderMaterial, Vector3 } from 'three';
import { LIGHT_GLSL } from './material';
import { rig } from './rig';

const vertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vN;
  varying vec3 vView;
  ${LIGHT_GLSL}
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(-vView);
    float ndl;
    vec3 col = studio(toLinear(uColor), n, v, 0.1, vec3(0.0), ndl);
    vec3 H = normalize(normalize(uKeyDir) + v);
    col += toLinear(uKeyColor) * smoothstep(0.25, 1.0, uLight) * (pow(max(dot(n, H), 0.0), 60.0) * 1.4 + pow(max(dot(n, H), 0.0), 8.0) * 0.12);
    gl_FragColor = vec4(finish(col), 1.0);
  }
`;

export function createPropMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { ...rig, uColor: { value: new Vector3(0.5, 0.52, 0.55) } },
  });
}
