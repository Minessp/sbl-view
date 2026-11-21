/**
 * Palco WebGL (chunk lazy: é aqui que three.js entra).
 * frameloop="demand": só desenha quando algo muda. DPR limitado no celular e ajustado pelo orçamento de quadro
 * (perf/FrameGovernor.tsx): primeiro tira efeitos do cinema (tiers.ts, `SHED_ORDER`), depois cai até 0,75.
 * `flat`: o tom e a conversão para sRGB ficam no pipeline de cinema (cinema/), ou nos materiais quando ele está desligado.
 */
import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { AtlasScene } from './atlas/AtlasScene';
import { Cinema } from './cinema/Cinema';
import { LightRig } from './body/LightRig';
import { HeatScene } from './heat/HeatScene';
import { HomeScene } from './home/HomeScene';
import { CompareScene } from './lab/CompareScene';
import { LabScene } from './lab/LabScene';
import { MotionScene } from './motion/MotionScene';
import { FrameGovernor } from './perf/FrameGovernor';
import { SHED_ORDER } from './perf/tiers';
import { useStage } from './stageStore';

const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const MAX_DPR = coarse ? 1.5 : 2;
const MIN_DPR = 0.75;

export default function Stage() {
  const scene = useStage((s) => s.scene);
  // Efeitos que o governador já tirou: borrar (DPR) só depois de tirar todos.
  const [shed, setShed] = useState(0);
  return (
    <Canvas
      className="stage__canvas"
      frameloop="demand"
      dpr={[MIN_DPR, MAX_DPR]}
      flat
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ fov: 28, near: 0.1, far: 30, position: [0, 1.02, 4] }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <FrameGovernor min={MIN_DPR} max={MAX_DPR} shed={shed < SHED_ORDER.length ? () => setShed(shed + 1) : undefined} />
      <LightRig />
      <Cinema shed={shed} />
      {scene === 'home' && <HomeScene />}
      {scene === 'lab' && <LabScene />}
      {scene === 'compare' && <CompareScene />}
      {scene === 'atlas' && <AtlasScene />}
      {scene === 'heat' && <HeatScene />}
      {scene === 'motion' && <MotionScene />}
    </Canvas>
  );
}
