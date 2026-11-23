/**
 * A vitrine da home (o corpo do player) passa entre o "Ao vivo" e os Mundos: a seção que cruza a linha do meio da tela
 * fica com ela e aplica o seu visual. Ao sair da home, quem estiver com ela devolve o player como estava.
 */
import { useEffect, type RefObject } from 'react';
import { usePlayer } from '@/features/library/player/store';

type Look = Pick<ReturnType<typeof usePlayer.getState>, 'xray' | 'heat' | 'telemetry' | 'showLoad' | 'speed' | 'compose' | 'joint'>;
let saved: Look | null = null;
const lookOf = ({ xray, heat, telemetry, showLoad, speed, compose, joint }: Look): Look => ({ xray, heat, telemetry, showLoad, speed, compose, joint });

export function useVitrine(section: RefObject<HTMLElement | null>, slot: RefObject<HTMLElement | null>, claim: () => void) {
  useEffect(() => {
    const el = section.current;
    const node = slot.current;
    if (!el) return;
    saved ??= lookOf(usePlayer.getState());
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting) || !saved) return;
        usePlayer.setState({ ...saved, slot: node });
        claim();
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (saved && usePlayer.getState().slot === node) {
        usePlayer.setState({ ...saved, slot: null, playing: false });
        saved = null;
      }
    };
  }, [section, slot, claim]);
}
