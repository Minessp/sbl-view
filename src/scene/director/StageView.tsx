/**
 * Vista do palco que atravessa a troca de rota. A `View` do drei segue um procurador (`div` fixo, invisível) em vez do
 * slot da página: parado, ele espelha o slot; no voo, desliza do recorte da cena que saiu até o slot novo.
 *
 * A vista `main` é a protagonista: registra a captura do palco (o que está desenhando agora: recorte, câmera, pose, pele)
 * e, ao montar ou ao receber um plano novo, voa a partir dele. As cenas leem o diretor (`useDirector`) e passam câmera,
 * pose e pele por ele: fora do voo nada muda; no voo, ele mistura com o plano de saída. Sem plano ou com redução de
 * movimento: corte seco, como antes.
 */
import { View } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import type { PerspectiveCamera } from 'three';
import { forwardKinematics } from '@/engine/kinematics/fk';
import type { EngineSkeleton, Pose } from '@/engine/kinematics/types';
import { blendDeg, blendRoot } from '@/engine/motion/blend';
import { DEG, QUAT_IDENTITY, type Transform, type Vec3 } from '@/engine/math/vec';
import type { BodyInstance } from '../body/instance';
import { STANDING } from '../body/poses';
import { cinema } from '../cinema/state';
import { useStage } from '../stageStore';
import { arcCamera, lerpRect, shotEase, SHOT_MS, window01 } from './blend';
import { useHandoff, type Rect, type Shot } from './handoff';

export const STANDING_DEG: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(STANDING).map(([k, v]) => [k, v / DEG]));
/** Pico da puxada de foco no meio do voo (0 = nítido, 1 = tudo desfocado). */
const PULL = 0.28;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Raiz que o FK usa quando não recebe uma (pelve na origem neutra, sem rotação). */
export function restRoot(sk: EngineSkeleton): Transform {
  const root = sk.segments.find((s) => s.parent === null);
  return { position: (root && sk.neutralOrigin.get(root.id)) ?? [0, 0, 0], rotation: QUAT_IDENTITY };
}

export const radToDeg = (rad: Readonly<Record<string, number>>): Record<string, number> => Object.fromEntries(Object.entries(rad).map(([k, v]) => [k, v / DEG]));

/** Só desenvolvimento: `window.__voo = 0.5` (ou `?voo=0.5` na rota de destino) segura o voo naquele ponto. */
function heldK(): number | null {
  if (!import.meta.env.DEV) return null;
  const w = (window as unknown as { __voo?: number }).__voo;
  const q = new URLSearchParams(window.location.search).get('voo');
  const v = w ?? (q === null ? NaN : Number(q));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
}

interface Flight {
  from: Shot;
  /** Primeiro quadro desenhado (o relógio só anda quando a troca já aparece na tela). */
  t0: number | null;
  k: number;
  /** Último quadro (k = 1): as cenas aplicam o próprio estado uma vez e o voo some. */
  final: boolean;
}

export class Director {
  flight: Flight | null = null;
  /** O que a vista desenhou no último quadro (a captura devolve isto). */
  drawn: { camera: Shot['camera'] | null; pose: Shot['pose']; skin: number } = { camera: null, pose: null, skin: 1 };
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  /** Último plano já usado (não voa duas vezes do mesmo). */
  lastAt = -1;

  constructor(readonly frame: HTMLElement) {}

  get flying(): boolean {
    return this.flight !== null;
  }

  /** O voo acabou neste quadro: a cena reaplica o próprio visual. */
  get landed(): boolean {
    return this.flight?.final ?? false;
  }

  /** Progresso suavizado no trecho [a, b] do voo (1 fora do voo). */
  e(a = 0, b = 1): number {
    return this.flight ? shotEase(window01(this.flight.k, a, b)) : 1;
  }

  /** Posiciona a câmera: a própria fora do voo; no voo, em arco a partir da de saída. Devolve a distância ao alvo. */
  camera(cam: PerspectiveCamera, pos: Vec3, target: Vec3): number {
    const own = { pos, target, fovDeg: cam.fov };
    const c = this.flight ? arcCamera(this.flight.from.camera, own, this.e()) : own;
    cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
    cam.fov = c.fovDeg;
    cam.lookAt(c.target[0], c.target[1], c.target[2]);
    this.drawn.camera = c;
    return Math.hypot(c.pos[0] - c.target[0], c.pos[1] - c.target[1], c.pos[2] - c.target[2]);
  }

  /**
   * Pose: fora do voo devolve null (a cena usa a dela) e só anota; no voo, a mistura da pose de saída com a própria
   * (chega em 70% do voo). `deg` em graus por DOF, `root` = raiz dada ao FK.
   */
  pose(sk: EngineSkeleton, deg: Readonly<Record<string, number>>, root: Transform): Pose | null {
    if (!this.flight) {
      this.drawn.pose = { deg, root };
      return null;
    }
    const from = this.flight.from.pose ?? { deg: STANDING_DEG, root: restRoot(sk) };
    const k = this.e(0, 0.7);
    const d = blendDeg(from.deg, deg, k);
    const r = blendRoot(from.root, root, k);
    this.drawn.pose = { deg: d, root: r };
    return forwardKinematics(sk, Object.fromEntries(Object.entries(d).map(([id, v]) => [id, v * DEG])), { root: r, clampToRom: false });
  }

  /**
   * Pele: no voo, alfa da saída → o da cena (70% do voo) e as camadas de dentro à vista; no último quadro, volta o da
   * cena. Fora do voo, só anota.
   */
  skin(body: BodyInstance, visible: boolean, alpha: number) {
    const own = visible ? alpha : 0;
    if (!this.flight) {
      this.drawn.skin = own;
      return;
    }
    if (this.flight.final) {
      body.layer('skin', { visible, alpha });
      this.drawn.skin = own;
      return;
    }
    const a = this.flight.from.look.skin + (own - this.flight.from.look.skin) * this.e(0, 0.7);
    body.layer('skin', { visible: a > 0.002, alpha: a });
    for (const l of ['superficial', 'deep', 'bone'] as const) body.layer(l, { showAbove: -99, lensOnly: 0 });
    this.drawn.skin = a;
  }

  shot(): Shot | null {
    if (!this.drawn.camera) return null;
    return { rect: { ...this.rect }, camera: this.drawn.camera, pose: this.drawn.pose, look: { skin: this.drawn.skin }, at: performance.now() };
  }
}

/** Vistas que podem deixar o plano de saída; a captura do palco escolhe a mais à vista. */
const capturers = new Set<Director>();
function visibleArea(r: Rect): number {
  const w = Math.min(r.x + r.w, window.innerWidth) - Math.max(r.x, 0);
  const h = Math.min(r.y + r.h, window.innerHeight) - Math.max(r.y, 0);
  return Math.max(0, w) * Math.max(0, h);
}
function captureStage(): Shot | null {
  let best: Director | null = null;
  for (const d of capturers) if (visibleArea(d.rect) > (best ? visibleArea(best.rect) : 0)) best = d;
  return best?.shot() ?? null;
}

const DirectorContext = createContext<Director | null>(null);

export function useDirector(): Director {
  const d = useContext(DirectorContext);
  if (!d) throw new Error('useDirector fora de um StageView');
  return d;
}

/**
 * `main`: voa a partir do plano de saída e deixa o seu ao sair. `capture` (padrão = `main`): só deixa o plano (a vitrine
 * da home: quem clica num exercício lá embaixo leva aquele corpo).
 */
export function StageView({ slot, index, main = false, capture = main, children }: { slot: HTMLElement; index: number; main?: boolean; capture?: boolean; children: ReactNode }) {
  const invalidate = useThree((s) => s.invalidate);
  const [frame] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none;contain:strict';
    return el;
  });
  const dir = useMemo(() => new Director(frame), [frame]);
  const track = useMemo(() => ({ current: frame }), [frame]);

  // O procurador nasce com o recorte do slot (a View mede no primeiro efeito).
  useLayoutEffect(() => {
    document.body.appendChild(frame);
    place(frame, dir, slot.getBoundingClientRect());
    return () => frame.remove();
  }, [frame, dir, slot]);

  // Plano novo (montagem ou troca entre duas páginas da mesma cena): voa a partir dele.
  useEffect(() => {
    if (!main) return;
    const start = (s: Shot | null) => {
      if (!s || s.at === dir.lastAt) return;
      dir.lastAt = s.at;
      if (reduceMotion()) return;
      dir.flight = { from: s, t0: null, k: 0, final: false };
      invalidate();
    };
    start(useHandoff.getState().take(1500));
    return useHandoff.subscribe((st) => start(st.shot));
  }, [main, dir, invalidate]);

  useEffect(() => {
    if (!capture) return;
    capturers.add(dir);
    useStage.getState().setCapture(captureStage);
    return () => {
      capturers.delete(dir);
      if (!capturers.size && useStage.getState().capture === captureStage) useStage.getState().setCapture(null);
      if (dir.flight) cinema.pull = 0;
    };
  }, [capture, dir]);

  // Antes das cenas (prioridade −1): o procurador recebe o recorte deste quadro; elas medem por ele.
  useFrame(() => {
    const target = slot.getBoundingClientRect();
    const f = dir.flight;
    if (!f) {
      place(frame, dir, target);
      return;
    }
    if (f.final) {
      dir.flight = null;
      cinema.pull = 0;
      place(frame, dir, target);
      return;
    }
    const now = performance.now();
    f.t0 ??= now;
    const held = heldK();
    f.k = held ?? Math.min(1, (now - f.t0) / SHOT_MS);
    if (f.k >= 1) f.final = true;
    const from = f.from.rect;
    const r = lerpRect(from, { x: target.left, y: target.top, w: target.width, h: target.height }, dir.e());
    place(frame, dir, { left: r.x, top: r.y, width: r.w, height: r.h });
    if (main) cinema.pull = f.final ? 0 : PULL * Math.sin(Math.PI * f.k);
    invalidate();
  }, -1);

  return (
    <View track={track as React.RefObject<HTMLElement>} index={index}>
      <DirectorContext.Provider value={dir}>{children}</DirectorContext.Provider>
    </View>
  );
}

function place(el: HTMLElement, dir: Director, r: { left: number; top: number; width: number; height: number }) {
  const w = Math.max(1, r.width), h = Math.max(1, r.height);
  if (dir.rect.x === r.left && dir.rect.y === r.top && dir.rect.w === w && dir.rect.h === h) return;
  dir.rect = { x: r.left, y: r.top, w, h };
  el.style.transform = `translate(${r.left}px, ${r.top}px)`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}
