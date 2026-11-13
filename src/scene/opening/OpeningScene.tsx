import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type PerspectiveCamera, Vector3 } from 'three';
import { skeletonDef } from '@/data';
import { forwardKinematics, pointToWorld } from '@/engine/kinematics/fk';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import { skinMatrices, skinPositions } from '@/engine/kinematics/skinning';
import { at, must } from '@/engine/math/arr';
import { scale, type Vec3 } from '@/engine/math/vec';
import { CALLOUTS } from '@/features/abertura/callouts';
import { CUT_OFF, INTRO_SECONDS, introCut, introDolly, LAYER_WINDOWS, openingFrame, windowWeight } from '@/features/abertura/timeline';
import { anchors, setAnchorWorld, type Anchor } from '../annotations';
import type { BodyModel } from '../body/model';
import { STANDING } from '../body/poses';
import { useBodyInstance, useBodyModel } from '../body/useBody';
import { useStage } from '../stageStore';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sk = buildSkeleton(skeletonDef);
const pose = forwardKinematics(sk, STANDING);
/** Opacidade de cada camada acima do corte (fantasma). */
const GHOST = { skin: 0.1, superficial: 0.16, deep: 0.12, bone: 0 } as const;
const BASE_HIGHLIGHT = 0;

/** Centróide posado da malha (lado direito), para ancorar a chamada. */
function meshAnchor(model: BodyModel, id: string): Vec3 | null {
  const part = model.pack.parts.find((p) => p.id === id);
  if (!part) return null;
  const M = skinMatrices(sk, pose, model.jointIds, { bind: new Map(model.pack.joints.map((j) => [j.id, j.origin])) });
  const P = skinPositions(part, M);
  let x = 0, y = 0, z = 0;
  const n = P.length / 3;
  for (let i = 0; i < n; i++) {
    x += P[i * 3] ?? 0;
    y += P[i * 3 + 1] ?? 0;
    z += P[i * 3 + 2] ?? 0;
  }
  return n ? [x / n, y / n, z / n] : null;
}

export function OpeningScene() {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const { model } = useBodyModel();
  const body = useBodyInstance(model);

  /** Vagas que cada chamada acende (os dois lados da malha). */
  const lit = useMemo(() => {
    if (!model) return new Map<string, number[]>();
    return new Map(
      CALLOUTS.flatMap((c) => (c.target.kind === 'muscle' ? [[c.id, model.slots.filter((s) => s.anatomyId === (c.target as { mesh: string }).mesh).map((s) => s.index)] as const] : [])),
    );
  }, [model]);

  useEffect(() => {
    if (!body || !model) return;
    body.setPose(sk, pose);
    for (const l of ['skin', 'superficial', 'deep', 'bone'] as const) body.layer(l, { ghost: GHOST[l], cut: CUT_OFF });
    body.layer('skin', { alpha: 1 });
    for (const c of CALLOUTS) {
      if (c.target.kind === 'muscle') {
        const w = meshAnchor(model, c.target.mesh);
        if (w) setAnchorWorld(c.id, w);
      } else {
        const seg = must(sk.byId, c.target.segment, 'segmento');
        setAnchorWorld(c.id, pointToWorld(pose, seg.id, scale(seg.tip, c.target.at)));
      }
    }
    useStage.getState().setReady(true);
    invalidate();
    return () => useStage.getState().setReady(false);
  }, [body, model, invalidate]);

  // ---- Laço: progresso amortecido → cortes, câmera, chamadas ----
  const shown = useRef(useStage.getState().progress);
  // Entrada só na primeira pintura, no topo da página e sem redução de movimento.
  const intro = useRef(reduceMotion() || useStage.getState().progress > 0.02 ? 1 : 0);
  const target = useMemo(() => new Vector3(0, 0.93, 0), []);
  const tmp = useRef(new Vector3());

  useEffect(() => useStage.subscribe(() => invalidate()), [invalidate]);

  useFrame((_, dt) => {
    if (!body) return;
    const goal = useStage.getState().progress;
    const k = reduceMotion() ? 1 : 1 - Math.exp(-dt * 7);
    shown.current += (goal - shown.current) * k;
    if (Math.abs(goal - shown.current) < 1e-4) shown.current = goal;
    else invalidate();
    const p = shown.current;
    const f = openingFrame(p);

    if (intro.current < 1) {
      // Primeiro quadro pode vir com dt enorme (aba carregando): limita o passo.
      intro.current = Math.min(1, intro.current + Math.min(dt, 1 / 30) / INTRO_SECONDS);
      invalidate();
    }
    const ic = introCut(intro.current);
    const skinCut = Math.min(f.cuts.skin, ic);
    // Sob a pele intacta nada aparece, mesmo onde a malha de dentro encosta na pele.
    body.layer('skin', { cut: skinCut });
    body.layer('superficial', { cut: Math.min(f.cuts.superficial, ic), showAbove: skinCut });
    body.layer('deep', { cut: Math.min(f.cuts.deep, ic), showAbove: skinCut });
    body.layer('bone', { cut: ic, showAbove: skinCut });

    // Músculos chamados "acendem" enquanto a camada deles está em evidência.
    for (const c of CALLOUTS) {
      const slots = lit.get(c.id);
      if (!slots) continue;
      const w = windowWeight(p, LAYER_WINDOWS[c.layer], 0.04);
      body.fill('highlight', BASE_HIGHLIGHT + (0.9 - BASE_HIGHLIGHT) * w, slots);
    }
    body.commit();

    // Câmera: enquadra 1,9 m de altura; recua em telas estreitas.
    const aspect = size.width / Math.max(1, size.height);
    const fitH = 0.98 / Math.tan((camera.fov * Math.PI) / 360);
    const fitW = 0.5 / (Math.tan((camera.fov * Math.PI) / 360) * aspect);
    // Celular (retrato): o corpo ocupa a metade de cima; o cartão de texto fica embaixo.
    const portrait = aspect < 0.8;
    const dist = Math.max(fitH, fitW) * (portrait ? 1.75 : 1.04) * introDolly(intro.current);
    camera.position.set(Math.sin(f.azimuth) * dist, 1.02, Math.cos(f.azimuth) * dist);
    camera.lookAt(target);
    if (portrait) camera.setViewOffset(size.width, size.height, 0, size.height * 0.22, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateMatrixWorld();

    // Chamadas: projeta; rótulo vai para a borda do lado do ponto; rótulos do mesmo lado
    // são empurrados para não se sobreporem (folga mínima de 26 px).
    const placed: { a: Anchor; w: number; x: number; y: number; ly: number; left: boolean }[] = [];
    for (const c of CALLOUTS) {
      const a = anchors.get(c.id);
      if (!a?.el || !a.world) continue;
      const w = windowWeight(p, LAYER_WINDOWS[c.layer], 0.03);
      if (w <= 0.001) {
        a.el.style.visibility = 'hidden';
        if (a.line) a.line.style.opacity = '0';
        continue;
      }
      const v = tmp.current.set(a.world[0], a.world[1], a.world[2]).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      placed.push({ a, w, x, y, ly: y, left: x < size.width * 0.5 });
    }
    for (const side of [true, false]) {
      const list = placed.filter((q) => q.left === side).sort((m, n) => m.y - n.y);
      for (let i = 1; i < list.length; i++) {
        const prev = at(list, i - 1), cur = at(list, i);
        cur.ly = Math.max(cur.ly, prev.ly + 26);
      }
    }
    for (const q of placed) {
      const { a, w, x, y, ly, left } = q;
      if (!a.el) continue;
      const lx = left ? Math.min(x - 24, size.width * 0.22) : Math.max(x + 24, size.width * 0.78);
      a.el.style.opacity = String(w);
      a.el.style.visibility = 'visible';
      a.el.dataset.side = left ? 'left' : 'right';
      a.el.style.setProperty('--ax', `${x.toFixed(1)}px`);
      a.el.style.setProperty('--ay', `${y.toFixed(1)}px`);
      a.el.style.setProperty('--lx', `${lx.toFixed(1)}px`);
      a.el.style.setProperty('--ly', `${ly.toFixed(1)}px`);
      if (a.line) {
        a.line.setAttribute('x1', x.toFixed(1));
        a.line.setAttribute('y1', y.toFixed(1));
        a.line.setAttribute('x2', lx.toFixed(1));
        a.line.setAttribute('y2', ly.toFixed(1));
        a.line.style.opacity = String(w);
      }
    }
  });

  return body ? <primitive object={body.group} /> : null;
}
