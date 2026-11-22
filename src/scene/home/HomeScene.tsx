/**
 * Página inicial: o corpo anatômico em pé, manipulável desde o primeiro quadro.
 *
 * - Entrada: o osso sobe do chão, as fibras crescem da origem à inserção (frente incandescente) e a pele chega por cima.
 * - Lente: um círculo sob o ponteiro tira a pele (e, se pedido, o músculo superficial e o profundo) em degraus.
 * - Hover acende o músculo; escolher voa a câmera até ele e a página passa a órbita para o Atlas.
 * - Scroll: as quatro camadas abrem lado a lado, com rótulos.
 * - Mais abaixo, uma segunda vista executa exercícios da biblioteca (o mesmo corpo do player).
 * Estado em `useHome` e `useStage` (sem three.js); aqui só se aplica.
 */
import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type PerspectiveCamera as PerspCam, Vector3 } from 'three';
import { skeletonDef } from '@/data';
import { forwardKinematics } from '@/engine/kinematics/fk';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import type { Vec3 } from '@/engine/math/vec';
import { BODY_BOX, dampOrbit, fitDistance, FOV_DEG, orbitPosition, orbitsClose, screenAxes, type Orbit } from '@/features/atlas/explorer/orbit';
import { useAtlas } from '@/features/atlas/store';
import { heroCamera, lens, samePick, useHome, type HomePick } from '@/features/home/store';
import { CUT_OFF, EXPLODE_SLOT, EXPLODE_SPACING, EXPLODE_YAW, explodeAt, introFrame, LAYER_IDS, lensPeel, lensRadius } from '@/features/home/timeline';
import { usePlayer } from '@/features/library/player/store';
import { anchors } from '../annotations';
import { structuresOf } from '../atlas/AtlasScene';
import { ContactShadow } from '../body/ContactShadow';
import { claimMain, releaseMain } from '../cinema/state';
import { restRoot, STANDING_DEG, StageView, useDirector } from '../director/StageView';
import { Studio } from '../set/Studio';
import type { BodyInstance } from '../body/instance';
import type { Box, BodyModel } from '../body/model';
import { footContacts, STANDING } from '../body/poses';
import { pulse } from '../body/rig';
import { useBodyInstance, useBodyModel } from '../body/useBody';
import { PlayerBody } from '../motion/MotionScene';
import { useStage } from '../stageStore';

const sk = buildSkeleton(skeletonDef);
const standing = forwardKinematics(sk, STANDING);
const rest = restRoot(sk);
const feet = footContacts(sk, standing);
const ankles = feet.filter((_, i) => i % 2 === 0);
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PITCH = 0.04;
const TAN = Math.tan((FOV_DEG * Math.PI) / 360);
/** Fantasma das camadas por fora da estrutura escolhida (raio X da transição). */
const GHOST = 0.14;

const keySlots = (model: BodyModel, p: HomePick): readonly number[] =>
  p.kind === 'muscle' ? (model.byMuscle.get(p.id) ?? []) : model.slots.filter((s) => s.anatomyId === p.id).map((s) => s.index);

/** Caixa da estrutura escolhida no lado tocado, com folga (a mesma ideia do voo do Atlas). */
function focusBox(body: BodyInstance, model: BodyModel, p: HomePick): Box | null {
  const all = keySlots(model, p);
  const side = all.filter((i) => model.slots[i]?.side === p.side || model.slots[i]?.side === 'c');
  const b = body.posedBox(side.length ? side : all);
  if (!b) return null;
  return { center: b.center, size: [Math.max(0.3, b.size[0] * 1.5), Math.max(0.42, b.size[1] * 1.5), Math.max(0.25, b.size[2] * 1.4)] };
}

/** Rótulo de camada: id da âncora. */
export const layerAnchor = (l: string) => `home-layer-${l}`;

function HeroBody() {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const camRef = useRef<PerspCam>(null);
  const dir = useDirector();
  const slot = dir.frame;
  const pageSlot = useHome((s) => s.slot);
  const { model } = useBodyModel();
  const body = useBodyInstance(model, 'main');

  /** Início da entrada (s, relógio de parede); só no topo da página e sem redução de movimento. */
  const t0 = useRef<number | null>(null);
  const skipIntro = useRef(reduceMotion() || window.scrollY > 40);
  const cur = useRef<Orbit | null>(null);
  const shown = useRef(useStage.getState().progress);
  const lensCur = useRef({ x: 0, y: 0, r: 0 });
  const leave = useRef({ k: 0, goal: null as Orbit | null, key: '' });
  const spread = useRef({ ex: 0, right: [1, 0, 0] as Vec3 });
  const shadowPts = useMemo(() => [] as Vec3[], []);
  const getFeet = useMemo(
    () => () => {
      const { ex, right } = spread.current;
      if (ex < 0.01) return feet;
      shadowPts.length = 0;
      for (const l of LAYER_IDS) {
        const o = EXPLODE_SLOT[l] * EXPLODE_SPACING * ex;
        for (const a of ankles) shadowPts.push([a[0] + right[0] * o, 0, a[2] + right[2] * o]);
      }
      return shadowPts;
    },
    [shadowPts],
  );
  const tmp = useMemo(() => new Vector3(), []);
  const clock = useRef(0);

  // Corpo pronto: pose em pé, estruturas para os nomes do rótulo (o Atlas usa a mesma lista).
  useEffect(() => {
    if (!body || !model) return;
    body.setPose(sk, standing);
    useAtlas.getState().setStructures(structuresOf(model));
    useStage.getState().setReady(true);
    invalidate();
  }, [body, model, invalidate, pageSlot]);

  useEffect(() => {
    const cam = camRef.current;
    return () => releaseMain(cam);
  }, []);

  // Seleção pelo slot (o canvas fixo não recebe ponteiro).
  useEffect(() => {
    if (!body || !model) return;
    useHome.getState().setPick((x, y) => {
      const cam = camRef.current;
      if (!cam) return null;
      const i = body.pick(gl, cam, x, y, dir.rect.w, dir.rect.h);
      const s = i === null ? undefined : model.slots[i];
      if (!s) return null;
      return s.muscleId ? { kind: 'muscle', id: s.muscleId, side: s.side } : { kind: 'part', id: s.anatomyId, side: s.side };
    });
    return () => useHome.getState().setPick(null);
  }, [body, model, gl, dir]);

  // Destaque: o que está sob o ponteiro acende; o escolhido acende inteiro e o que o cobre vira vulto.
  useEffect(() => {
    if (!body || !model) return;
    let last: [HomePick | null, HomePick | null] = [null, null];
    const apply = () => {
      const { hover, leaving } = useHome.getState();
      if (hover === last[0] && leaving === last[1]) return;
      const fresh = !samePick(leaving ?? hover, last[1] ?? last[0]);
      last = [hover, leaving];
      body.fill('highlight', 0);
      body.fill('opacity', 1);
      const focus = leaving ?? hover;
      if (focus) {
        const sl = keySlots(model, focus);
        if (leaving) {
          const layer = model.slots[sl[0] ?? -1]?.layer;
          if (layer === 'deep' || layer === 'bone') body.fillLayer('superficial', 'opacity', GHOST);
          if (layer === 'bone') body.fillLayer('deep', 'opacity', GHOST);
          for (const s of model.slots) if (s.kind === 'tendon' && s.layer === 'superficial') body.set(s.index, 'opacity', GHOST);
          body.fill('opacity', 1, sl);
        }
        body.fill('highlight', leaving ? 1 : 0.85, sl);
        if (fresh) pulse();
      }
      body.commit();
      invalidate();
    };
    apply();
    return useHome.subscribe(apply);
  }, [body, model, invalidate]);

  useFrame(() => {
    const cam = camRef.current;
    if (!cam || !body || !model) return;
    const now = performance.now() / 1000;
    const gap = now - clock.current;
    const dt = gap > 0 && gap < 0.5 ? gap : 1 / 60;
    clock.current = now;
    const reduce = reduceMotion();
    const st = useHome.getState();

    // ---- Entrada (chegando de outra página o corpo já está montado) ----
    t0.current ??= skipIntro.current || dir.flying ? -99 : now;
    const bp = dir.pose(sk, STANDING_DEG, rest);
    if (bp) body.setPose(sk, bp);
    const intro = introFrame(now - t0.current);
    if (!intro.done) invalidate();
    else if (!st.live) st.setLive(true);
    body.grow.value = intro.grow;
    body.layer('bone', { cut: intro.boneCut, ghost: 0 });
    for (const l of ['skin', 'superficial', 'deep'] as const) body.layer(l, { cut: CUT_OFF, ghost: 0 });

    // ---- Scroll: abertura das camadas ----
    const goalP = useStage.getState().progress;
    shown.current = reduce ? goalP : shown.current + (goalP - shown.current) * (1 - Math.exp(-dt * 7));
    if (Math.abs(goalP - shown.current) < 1e-4) shown.current = goalP;
    else invalidate();
    const ex = explodeAt(shown.current);

    // ---- Transição para o Atlas ----
    const lv = leave.current;
    const leavingKey = st.leaving ? `${st.leaving.kind}:${st.leaving.id}` : '';
    if (leavingKey !== lv.key) {
      lv.key = leavingKey;
      lv.goal = null;
    }
    lv.k = st.leaving ? (reduce ? 1 : lv.k + (1 - lv.k) * (1 - Math.exp(-dt * 5))) : 0;
    if (st.leaving && lv.k < 0.999) invalidate();

    // ---- Camadas: pele, lente, vedação ----
    const sealed = intro.skin >= 0.999 && ex < 0.001 && !st.leaving && !dir.flying;
    // Fim da entrada: o que está sob a pele some pontilhado junto com a pele que fica opaca (corte em −99 = tudo fantasma).
    if (!intro.done && ex < 0.001 && !st.leaving && intro.under < 1) {
      for (const l of ['superficial', 'deep', 'bone'] as const) body.layer(l, { cut: -99, ghost: intro.under });
    }
    const skinAlpha = st.leaving ? 1 + (0.16 - 1) * lv.k : intro.skin;
    body.layer('skin', { alpha: skinAlpha });
    const canvas = gl.domElement.getBoundingClientRect();
    const dpr = gl.getPixelRatio();
    const rect = { left: dir.rect.x, top: dir.rect.y, width: dir.rect.w, height: dir.rect.h };
    const lensOn = st.live && lens.on && ex < 0.02 && !st.leaving;
    const goalR = lensOn ? lensRadius(rect.width) * dpr : 0;
    const px = (lens.x - canvas.left) * dpr, py = (canvas.bottom - lens.y) * dpr;
    const L = lensCur.current;
    if (L.r < 0.5 || reduce) {
      L.x = px;
      L.y = py;
    } else {
      const k = 1 - Math.exp(-dt * 30);
      L.x += (px - L.x) * k;
      L.y += (py - L.y) * k;
    }
    L.r = reduce ? goalR : L.r + (goalR - L.r) * (1 - Math.exp(-dt * (goalR > L.r ? 12 : 16)));
    if (Math.abs(goalR - L.r) < 0.3) L.r = goalR;
    if (L.r !== goalR || Math.hypot(px - L.x, py - L.y) > 0.3) invalidate();
    body.lens.value.set(L.x, L.y, L.r);
    const peel = lensPeel(st.depth);
    for (const l of LAYER_IDS) body.layer(l, { lensPeel: L.r > 0 ? peel[l] : 0, lensOnly: l !== 'skin' && sealed ? 1 : 0, showAbove: -99 });
    dir.skin(body, true, skinAlpha);

    // ---- Câmera ----
    const aspect = rect.width / Math.max(1, rect.height);
    const wide = aspect > 1.15;
    const portrait = aspect < 0.8;
    const yaw = st.yaw + EXPLODE_YAW * ex + intro.orbit;
    const H = BODY_BOX.size[1] + 0.08;
    const depth = BODY_BOX.size[2] / 2;
    const hpx = Math.max(1, rect.height);
    // Fechado: desktop, o corpo cabe na altura, à direita do texto; celular, na faixa de baixo (o título fica em cima).
    const heroTop = hpx * 0.4, heroBottom = hpx * 0.97;
    const distHero = portrait
      ? Math.max((H / 2 / TAN) * (hpx / (heroBottom - heroTop)), (BODY_BOX.size[0] / 2 / (TAN * aspect)) * 1.1) + depth
      : Math.max(H / 2 / TAN, BODY_BOX.size[0] / 2 / (TAN * aspect)) * 1.1 + depth;
    // Abertas: as quatro cabem entre o cabeçalho com os rótulos (em cima) e o texto (embaixo).
    const top = Math.max(118, hpx * 0.15), bottom = hpx - Math.max(150, hpx * 0.19);
    const W = BODY_BOX.size[0] + 3 * EXPLODE_SPACING;
    const distOpen = Math.max((H / 2 / TAN) * (hpx / Math.max(80, bottom - top)), (W / 2 / (TAN * aspect)) * 1.04) + depth;
    const dist = (distHero + (distOpen - distHero) * ex) * intro.dolly;
    const base: Orbit = { yaw, pitch: PITCH, dist, target: BODY_BOX.center };
    const { right, up } = screenAxes(base);
    const sx = wide ? -dist * TAN * aspect * 0.3 * (1 - ex) : 0;
    // Deslocamento vertical (m, + = o corpo desce na tela).
    const openDy = (((top + bottom) / 2 - hpx / 2) / hpx) * 2 * dist * TAN;
    const heroDy = portrait ? (((heroTop + heroBottom) / 2 - hpx / 2) / hpx) * 2 * dist * TAN : 0;
    const sy = heroDy * (1 - ex) + openDy * ex;
    let goal: Orbit = { ...base, target: [BODY_BOX.center[0] + right[0] * sx + up[0] * sy, BODY_BOX.center[1] + up[1] * sy, BODY_BOX.center[2] + right[2] * sx + up[2] * sy] };
    if (st.leaving) {
      if (!lv.goal) {
        let box = focusBox(body, model, st.leaving);
        if (box && ex > 0.001) {
          const l = model.slots[keySlots(model, st.leaving)[0] ?? -1]?.layer ?? 'deep';
          const o = EXPLODE_SLOT[l] * EXPLODE_SPACING * ex;
          const r = spread.current.right;
          box = { center: [box.center[0] + r[0] * o, box.center[1], box.center[2] + r[2] * o], size: box.size };
        }
        if (box) lv.goal = { yaw: cur.current?.yaw ?? yaw, pitch: PITCH, dist: fitDistance(box.size, cur.current?.yaw ?? yaw, aspect), target: box.center };
      }
      if (lv.goal) goal = lv.goal;
    }
    cur.current = !cur.current || reduce || (!intro.done && !st.leaving) ? goal : dampOrbit(cur.current, goal, 1 - Math.exp(-dt * (st.leaving ? 4.5 : 9)));
    if (orbitsClose(cur.current, goal)) cur.current = goal;
    else invalidate();
    heroCamera.orbit = cur.current;
    const c = cur.current;
    cam.aspect = aspect;
    const drawn = dir.camera(cam, orbitPosition(c), c.target);
    cam.near = Math.max(0.05, Math.min(drawn, c.dist) * 0.05);
    cam.far = Math.max(drawn, c.dist) + 14;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // Herói fora da tela (o leitor desceu ao "Ao vivo"): sem feixe, que lavava a vitrine.
    claimMain(cam, slot, gl.domElement, drawn, 0.35, rect.top + rect.height > 1 ? 1 : 0);

    // ---- Camadas lado a lado no eixo lateral da câmera ----
    const ax = screenAxes(c).right;
    spread.current = { ex, right: ax };
    for (const l of LAYER_IDS) {
      const o = EXPLODE_SLOT[l] * EXPLODE_SPACING * ex;
      body.meshes[l].position.set(ax[0] * o, 0, ax[2] * o);
    }

    // ---- Rótulos das camadas abertas (sobre a cabeça de cada uma) ----
    const w = Math.max(0, Math.min(1, (ex - 0.55) / 0.35));
    for (const l of LAYER_IDS) {
      const a = anchors.get(layerAnchor(l));
      if (!a?.el) continue;
      if (w <= 0.001) {
        a.el.style.opacity = '0';
        continue;
      }
      const o = EXPLODE_SLOT[l] * EXPLODE_SPACING * ex;
      const v = tmp.set(ax[0] * o, BODY_BOX.size[1] + 0.06, ax[2] * o).project(cam);
      const x = rect.left + (v.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
      a.el.style.opacity = String(w);
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    body.commit();
  });

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault manual fov={FOV_DEG} near={0.05} far={30} position={[0, 1, 4]} />
      <Studio body={body} boxes />
      {body && <ContactShadow feet={getFeet} />}
      {body && <primitive object={body.group} />}
    </>
  );
}

export function HomeScene() {
  const hero = useHome((s) => s.slot);
  const show = usePlayer((s) => s.slot);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const unsub = [useHome.subscribe(() => invalidate()), useStage.subscribe(() => invalidate())];
    const onMove = () => invalidate();
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    const ro = new ResizeObserver(onMove);
    if (hero) ro.observe(hero);
    if (show) ro.observe(show);
    return () => {
      for (const u of unsub) u();
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      ro.disconnect();
    };
  }, [invalidate, hero, show]);
  useEffect(() => () => useStage.getState().setReady(false), []);

  return (
    <>
      {hero && (
        <StageView slot={hero} index={1} main>
          <HeroBody />
        </StageView>
      )}
      {show && (
        <StageView slot={show} index={2} capture>
          <PlayerBody />
        </StageView>
      )}
    </>
  );
}
