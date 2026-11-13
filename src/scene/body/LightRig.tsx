/**
 * Anima a luz do estúdio (rig.ts) uma vez por quadro, para todo o palco:
 * - acende quando a cena fica pronta (contraluz primeiro, depois a key; ~1,6 s, saída exponencial);
 * - a key segue o ponteiro de leve (ponteiro fino, sem redução de movimento);
 * - relógio do brilho que percorre o músculo destacado.
 * Com frameloop="demand", só pede quadro novo enquanto algo está mudando.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useStage } from '../stageStore';
import { KEY_BASE, PULSE_SECONDS, refreshPalette, rig } from './rig';

const LIGHT_SECONDS = 1.6;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => window.matchMedia('(pointer: fine)').matches;

export function LightRig() {
  const invalidate = useThree((s) => s.invalidate);
  const aim = useRef({ x: 0, y: 0 });
  const cur = useRef({ x: 0, y: 0 });
  const start = useRef(performance.now());
  const tmp = useRef(new Vector3());

  useLayoutEffect(() => {
    refreshPalette();
  }, []);

  // Acende a cada cena nova (pronta); apaga quando ela sai.
  useEffect(
    () =>
      useStage.subscribe((s, prev) => {
        if (s.ready === prev.ready) return;
        rig.uLight.value = s.ready && reduceMotion() ? 1 : 0;
        invalidate();
      }),
    [invalidate],
  );

  useEffect(() => {
    if (!finePointer() || reduceMotion()) return;
    const onMove = (e: PointerEvent) => {
      aim.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      aim.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      invalidate();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [invalidate]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 1 / 30);
    rig.uTime.value = (performance.now() - start.current) / 1000;
    let busy = false;

    if (useStage.getState().ready && rig.uLight.value < 1) {
      rig.uLight.value = Math.min(1, rig.uLight.value + step / LIGHT_SECONDS);
      busy = true;
    }

    // Key acompanha o ponteiro: até ~20° para os lados, ~12° na vertical.
    const k = 1 - Math.exp(-step * 5);
    const c = cur.current, a = aim.current;
    c.x += (a.x - c.x) * k;
    c.y += (a.y - c.y) * k;
    if (Math.abs(a.x - c.x) + Math.abs(a.y - c.y) > 1e-3) busy = true;
    const v = tmp.current.copy(KEY_BASE);
    v.x += c.x * 0.38;
    v.y -= c.y * 0.22;
    rig.uKeyDir.value.copy(v.normalize());

    if (rig.uTime.value - rig.uPulseStart.value < PULSE_SECONDS) busy = true;
    if (busy) invalidate();
  });

  return null;
}

