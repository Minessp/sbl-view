/**
 * Orçamento de quadro no palco: mede o intervalo entre quadros seguidos e ajusta o DPR do canvas pelo governador
 * (governor.ts). O palco é sob demanda: um intervalo só conta se, ao fim do quadro anterior, o próximo já estava pedido
 * (`internal.frames > 0` no efeito "after" do R3F). Assim um quadro de 200 ms num aparelho fraco conta como lento, e
 * uma pausa da cena não conta. Teto = DPR da tela (acima disso seria supersampling). Carência de 4 s depois de cada
 * cena ficar pronta: subida de malha, compilação de shader e a troca de nível (3,4 s) soluçam e não dizem nada sobre o
 * aparelho. O canvas mostra o DPR e o p75 em `data-dpr` / `data-frame-ms`.
 */
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useStage } from '../stageStore';
import { createGovernor } from './governor';

const WARMUP_MS = 4000;

/** `shed`: chamado no lugar de baixar o DPR enquanto houver efeito do cinema para tirar (shortcut: efeito tirado não volta na sessão). */
export function FrameGovernor({ min, max, shed }: { min: number; max: number; shed?: (() => void) | undefined }) {
  const setDpr = useThree((s) => s.setDpr);
  const get = useThree((s) => s.get);
  const gl = useThree((s) => s.gl);
  const rendered = useRef(false);
  const shedRef = useRef(shed);
  shedRef.current = shed;

  useFrame(() => {
    rendered.current = true;
  });

  useEffect(() => {
    const top = Math.max(min, Math.min(window.devicePixelRatio || 1, max));
    let gov = createGovernor({ min, max: top }, top);
    gl.domElement.dataset.dpr = String(gov.dpr);
    let hold = performance.now() + WARMUP_MS;
    let last = 0;
    let continuing = false;
    let shown = 0;
    const offStage = useStage.subscribe((s, p) => {
      if (s.ready !== p.ready || s.scene !== p.scene) hold = performance.now() + WARMUP_MS;
    });
    const offAfter = addAfterEffect((t) => {
      if (!rendered.current) return;
      rendered.current = false;
      const was = continuing;
      continuing = get().internal.frames > 0;
      const ms = last ? t - last : 0;
      last = t;
      if (!was || t < hold) return;
      const prev = gov.dpr;
      const next = gov.sample(ms, t);
      const shedNow = shedRef.current;
      if (next !== null && next < prev && shedNow) {
        // Tira um efeito em vez de borrar; governador recomeça no DPR atual e espera a recompilação.
        shedNow();
        gov = createGovernor({ min, max: top }, prev);
        hold = t + WARMUP_MS;
      } else if (next !== null) {
        setDpr(next);
        gl.domElement.dataset.dpr = String(next);
      }
      if (t - shown > 1000) {
        shown = t;
        gl.domElement.dataset.frameMs = gov.p75.toFixed(1);
      }
    });
    return () => {
      offStage();
      offAfter();
    };
  }, [gl, get, setDpr, min, max]);

  return null;
}
