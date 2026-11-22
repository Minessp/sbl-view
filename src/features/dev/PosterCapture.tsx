/**
 * Modo de captura do cartaz (`/exercicios/<slug>?cartaz=1`, só em desenvolvimento): o corpo na tela inteira, fundo
 * transparente, sem interface, alvos acesos, parado em u = 0,35 na vista do clipe. scripts/posters.mjs fotografa.
 */
import { useEffect, useRef } from 'react';
import type { CompiledClip } from '@/engine/motion/evaluate';
import { timeAtU } from '@/engine/motion/keys';
import { usePlayer, type PlayerTargets } from '@/features/library/player/store';
import { useStage } from '@/scene/stageStore';

const CSS = `html.poster-capture, html.poster-capture body { background: transparent !important; }
html.poster-capture .site-header, html.poster-capture footer, html.poster-capture .skip-link, html.poster-capture .stage__loading { display: none !important; }`;

export default function PosterCapture({ name, clip, targets }: { name: string; clip: CompiledClip; targets: PlayerTargets }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('poster-capture');
    const st = usePlayer.getState();
    st.load(clip, targets);
    st.setTelemetry(false);
    st.setShowLoad(false);
    st.setPlaying(false);
    st.setTime(timeAtU(clip.clip.tempo, 0.35));
    st.setSlot(ref.current);
    useStage.getState().setScene('motion');
    return () => {
      root.classList.remove('poster-capture');
      usePlayer.getState().setShowLoad(true);
      usePlayer.getState().setSlot(null);
      useStage.getState().setScene('none');
    };
  }, [clip, targets]);
  return (
    <main id="conteudo">
      <style>{CSS}</style>
      <h1 className="visually-hidden">{name}</h1>
      <div ref={ref} style={{ position: 'fixed', inset: 0 }} />
    </main>
  );
}
