/**
 * Rótulos vivos: o palco mede quais músculos mais aparecem na vista e onde (useLabelFeed); aqui eles viram rótulos em
 * duas colunas com linha-guia até o músculo (`labels.ts` arruma sem colisão). Clicar seleciona; passar o ponteiro
 * acende o músculo. Com uma seleção, origem e inserção ganham marca própria que leva a câmera até a ponta.
 * Mora na camada do palco (#stage-overlay), acima do canvas. Teclado: os rótulos são botões; a lista completa está na gaveta.
 */
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { muscleDefs } from '@/data';
import { t } from '@/i18n/app';
import { useAtlas, useLabelFeed, type Pick } from '../store';
import { LABEL_GAP, layout } from './labels';

const names = new Map(muscleDefs.map((m) => [m.id, m.name]));
/** Largura típica de um rótulo (px): a coluna para antes de a ponta do texto entrar na alavanca ou no cartão. */
const LABEL_W = 170;
const coarse = () => window.matchMedia('(pointer: coarse)').matches;

/** `muscles` falso: só as pontas da seleção (página do músculo). */
export function LiveLabels({ muscles = true }: { muscles?: boolean }) {
  const feed = useLabelFeed();
  const selection = useAtlas((s) => s.selection);
  useEffect(() => {
    // Celular: o corpo ocupa a largura e não sobra coluna para rótulo; ficam o toque e as pontas da seleção.
    const wide = window.matchMedia('(min-width: 700px)');
    const sync = () => useLabelFeed.setState({ on: true, labels: muscles && wide.matches, ...(!(muscles && wide.matches) && { items: [] }) });
    sync();
    wide.addEventListener('change', sync);
    return () => {
      wide.removeEventListener('change', sync);
      useLabelFeed.setState({ on: false, labels: false, items: [], ends: null, body: null, rect: null });
    };
  }, [muscles]);
  const gap = useMemo(() => (coarse() ? 44 : LABEL_GAP), []);
  const overlay = typeof document === 'undefined' ? null : document.getElementById('stage-overlay');
  const r = feed.rect;
  if (!overlay || !r) return null;

  const body = feed.body ? { left: feed.body.left - r.x, right: feed.body.right - r.x } : { left: r.w / 2 - 120, right: r.w / 2 + 120 };
  // O selecionado não ganha rótulo: o cartão já dá o nome e as pontas têm marca própria.
  const items = feed.items.filter((i) => !(selection?.kind === 'muscle' && selection.id === i.muscleId));
  const byKey = new Map(items.map((i) => [i.key, i]));
  // Faixa livre: entre a alavanca e o cartão (com a largura de um rótulo), abaixo das ferramentas, acima do trilho.
  const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
  const peel = box('.atlas-full__peel'), card = box('.atlas-card'), tools = box('.atlas-tools'), rail = box('.region-rail');
  const narrow = r.w < 700;
  const placed = layout(
    items.map((i) => ({ key: i.key, x: i.x - r.x, y: i.y - r.y })),
    body,
    r.w,
    r.h,
    {
      gap,
      top: (tools ? tools.bottom - r.y : 72) + 8,
      bottom: (rail ? r.y + r.h - rail.top : 72) + (narrow ? 64 : 8),
      xMin: (peel ? peel.right - r.x : 16) + (narrow ? 8 : LABEL_W),
      xMax: (card && !narrow ? card.left - r.x : r.w - 16) - LABEL_W,
    },
  );
  const pickOf = (key: string): Pick | null => {
    const i = byKey.get(key);
    return i ? { kind: 'muscle', id: i.muscleId, side: i.side } : null;
  };
  const hover = (p: Pick | null) => useAtlas.getState().setHover(p);
  const ends = feed.ends;
  const st = useAtlas.getState;

  return createPortal(
    <div className="live-labels" role="group" aria-label={t.atlas.ex.labels}>
      <svg className="live-labels__lines" aria-hidden="true">
        {placed.map((p) => (
          <g key={p.key}>
            <line x1={p.ax + r.x} y1={p.ay + r.y} x2={p.x + r.x} y2={p.y + r.y} pathLength={1} />
            <circle cx={p.ax + r.x} cy={p.ay + r.y} r={2.5} />
          </g>
        ))}
      </svg>
      {placed.map((p) => {
        const pick = pickOf(p.key);
        const i = byKey.get(p.key);
        if (!pick || !i) return null;
        return (
          <button
            key={p.key}
            type="button"
            className="live-label"
            data-side={p.side}
            style={{ transform: `translate(${(p.x + r.x).toFixed(1)}px, ${(p.y + r.y).toFixed(1)}px)` }}
            onPointerEnter={() => hover(pick)}
            onPointerLeave={() => hover(null)}
            onFocus={() => hover(pick)}
            onBlur={() => hover(null)}
            onClick={() => st().select(pick, { fly: true })}
          >
            {names.get(i.muscleId) ?? i.muscleId}
          </button>
        );
      })}
      {ends &&
        (['origin', 'insertion'] as const).map((end) => {
          const [x, y] = ends[end];
          return (
            <button
              key={end}
              type="button"
              className="end-mark"
              data-end={end}
              aria-label={end === 'origin' ? t.atlas.ex.goOrigin : t.atlas.ex.goInsertion}
              style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}
              onClick={() => st().flyToEnd(end)}
            >
              <span className="end-mark__dot" aria-hidden="true" />
              <span className="end-mark__name" aria-hidden="true">
                {end === 'origin' ? t.atlas.origin : t.atlas.insertion}
              </span>
            </button>
          );
        })}
    </div>,
    overlay,
  );
}
