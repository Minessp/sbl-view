/**
 * Liga o pipeline de cinema ao laço do R3F: antes das vistas (prioridade 0,5; as `View` usam 1, 2…) troca o alvo para
 * o HDR; depois de todas (1000), roda os passes e compõe na tela. Sem pipeline (GPU por software, escolha do usuário)
 * os materiais voltam a fazer o tom sozinhos (`rig.uHdr` = 0) e nada muda no resto do palco.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { rig } from '../body/rig';
import { effectsFor, type Effects } from '../perf/tiers';
import { CinemaPipeline } from './pipeline';
import { cinema } from './state';

const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** Efeitos ligados neste aparelho (o palco expõe em `data-fx` para teste e diagnóstico). */
function useEffectsFor(gl: { getContext(): WebGLRenderingContext | WebGL2RenderingContext }, shed: number): Effects {
  const renderer = useMemo(() => {
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  }, [gl]);
  return useMemo(() => effectsFor({ renderer, coarse, shed }), [renderer, shed]);
}

/** Pipeline com os efeitos deste aparelho; o governador de quadro tira efeitos pela `shed` (perf/tiers.ts). */
export function Cinema({ shed = 0 }: { shed?: number }) {
  const gl = useThree((s) => s.gl);
  const fx = useEffectsFor(gl, shed);
  const invalidate = useThree((s) => s.invalidate);
  const pipe = useMemo(() => (fx.hdr ? new CinemaPipeline(fx.msaa) : null), [fx]);

  useEffect(() => {
    cinema.fx = fx;
    rig.uHdr.value = pipe ? 1 : 0;
    gl.domElement.dataset.fx = Object.entries(fx)
      .filter(([k, v]) => k !== 'msaa' && v)
      .map(([k]) => k)
      .join(' ') || 'off';
    invalidate();
    return () => {
      rig.uHdr.value = 0;
      pipe?.dispose();
    };
  }, [pipe, fx, gl, invalidate]);

  useFrame(() => {
    pipe?.begin(gl);
  }, 0.5);

  useFrame((state, delta) => {
    if (!pipe) return;
    const dt = Math.min(0.1, Math.max(0, delta));
    const size = state.size;
    pipe.end(gl, {
      fx,
      dt,
      time: state.clock.elapsedTime,
      lightTheme: document.documentElement.dataset.theme === 'light',
      cssWidth: size.width,
      cssHeight: size.height,
      dpr: gl.getPixelRatio(),
      rimColor: rig.uRimColor.value,
      keyColor: rig.uKeyColor.value,
    });
    if (Math.abs(cinema.focus - cinema.focusGoal) > 0.002 || Math.abs(cinema.aperture - cinema.apertureGoal) > 0.002) invalidate();
  }, 1000);

  return null;
}
