/**
 * Palco WebGL (chunk lazy: é aqui que three.js entra).
 * frameloop="demand": só desenha quando algo muda. DPR limitado no celular.
 * `flat`: o tom (ACES) e a conversão para sRGB ficam nos materiais (body/material.ts).
 */
import { Canvas } from '@react-three/fiber';
import { AtlasScene } from './atlas/AtlasScene';
import { LightRig } from './body/LightRig';
import { HeatScene } from './heat/HeatScene';
import { HomeScene } from './home/HomeScene';
import { LabScene } from './lab/LabScene';
import { MotionScene } from './motion/MotionScene';
import { useStage } from './stageStore';

const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const MAX_DPR = coarse ? 1.5 : 2;

export default function Stage() {
  const scene = useStage((s) => s.scene);
  return (
    <Canvas
      className="stage__canvas"
      frameloop="demand"
      dpr={[1, MAX_DPR]}
      flat
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ fov: 28, near: 0.1, far: 30, position: [0, 1.02, 4] }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <LightRig />
      {scene === 'home' && <HomeScene />}
      {scene === 'lab' && <LabScene />}
      {scene === 'atlas' && <AtlasScene />}
      {scene === 'heat' && <HeatScene />}
      {scene === 'motion' && <MotionScene />}
    </Canvas>
  );
}
