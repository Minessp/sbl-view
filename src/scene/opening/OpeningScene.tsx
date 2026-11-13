import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, type Mesh, type PerspectiveCamera, Vector3 } from 'three';
import { muscleDefs, skeletonDef } from '@/data';
import { forwardKinematics, pointToWorld } from '@/engine/kinematics/fk';
import { bilateral, buildSkeleton, degToAngles } from '@/engine/kinematics/skeleton';
import { buildMusclePaths, pathFlat, pathWorldPoints, type MusclePath } from '@/engine/muscle/paths';
import { sampleCurve, spindleIndices, spindleUVs, vertexCount, writeSpindle, type SpindleFlat } from '@/engine/geometry/spindle';
import { at, must } from '@/engine/math/arr';
import { scale, type Vec3 } from '@/engine/math/vec';
import { CALLOUTS } from '@/features/abertura/callouts';
import { CUT_OFF, INTRO_SECONDS, introCut, introDolly, LAYER_WINDOWS, openingFrame, windowWeight } from '@/features/abertura/timeline';
import { useTheme } from '@/ui/theme';
import { anchors, setAnchorWorld, type Anchor } from '../annotations';
import { buildBones } from '../body/bones';
import { buildSkinGeometry } from '../body/skin';
import { createPlateMaterial, createShared, type PlateMaterial } from '../materials/plate';
import { createPalette, readPalette } from '../palette';
import { useStage } from '../stageStore';

const LAYOUT = { rings: 30, sides: 12 } as const;
const OPENING_POSE = degToAngles(bilateral({ shoulder_abd: 13, elbow_flex: 8, hip_abd: 2.5 }));
const BASE_STAIN = { superficial: 0.26, deep: 0.4 } as const;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function spindleGeometry(points: Vec3[], path: MusclePath, flat: SpindleFlat | null): BufferGeometry {
  const n = vertexCount(LAYOUT);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  writeSpindle(LAYOUT, points, path.radius, path.tendon, pos, nor, flat);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(spindleUVs(LAYOUT), 2));
  g.setIndex(new BufferAttribute(spindleIndices(LAYOUT), 1));
  g.computeBoundingSphere();
  return g;
}

export function OpeningScene() {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  // ---- Modelo: tudo derivado do motor ----
  const model = useMemo(() => {
    const sk = buildSkeleton(skeletonDef);
    const pose = forwardKinematics(sk, OPENING_POSE);
    const paths = buildMusclePaths(sk, muscleDefs);
    const muscles = paths.map((p) => {
      const pts = pathWorldPoints(pose, p);
      return { path: p, points: pts, geometry: spindleGeometry(pts, p, pathFlat(pose, p)) };
    });
    const bones = buildBones(sk);
    const skin = buildSkinGeometry(sk, pose);
    return { sk, pose, muscles, bones, skin };
  }, []);

  // ---- Materiais e uniforms compartilhados ----
  const palette = useMemo(() => readPalette(createPalette()), []);
  const shared = useMemo(() => createShared(palette, dpr), [palette, dpr]);
  const layer = useMemo(
    () => ({
      skin: { cut: { value: CUT_OFF }, ghost: { value: 0.34 } },
      superficial: { cut: { value: CUT_OFF }, ghost: { value: 0.42 } },
      deep: { cut: { value: CUT_OFF }, ghost: { value: 0.32 } },
      bone: { cut: { value: CUT_OFF }, ghost: { value: 0 } },
    }),
    [],
  );
  const mats = useMemo(() => {
    const skin = createPlateMaterial(shared, { base: palette.bone, ...layer.skin, contour: 1, hatch: 0.7 });
    // Sob a pele intacta nada aparece, mesmo onde a geometria estilizada encosta no envelope.
    const showAbove = layer.skin.cut;
    const bone = createPlateMaterial(shared, { base: palette.bone, ...layer.bone, showAbove, hatch: 1 });
    const muscle = new Map<string, PlateMaterial>();
    for (const m of model.muscles) {
      const L = m.path.layer === 'deep' ? layer.deep : layer.superficial;
      muscle.set(
        m.path.key,
        createPlateMaterial(shared, { base: palette.bone, ...L, showAbove, fiber: 1, hatch: 0.85, stain: BASE_STAIN[m.path.layer === 'deep' ? 'deep' : 'superficial'] }),
      );
    }
    return { skin, bone, muscle };
  }, [shared, palette, layer, model]);

  useEffect(
    () => () => {
      model.skin.dispose();
      model.bones.forEach((g) => g.dispose());
      model.muscles.forEach((m) => m.geometry.dispose());
      mats.skin.dispose();
      mats.bone.dispose();
      mats.muscle.forEach((m) => m.dispose());
    },
    [model, mats],
  );

  // ---- Tema: relê tokens do CSS ----
  const resolved = useTheme((s) => s.resolved);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      readPalette(palette);
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [resolved, palette, invalidate]);

  // ---- Âncoras das chamadas ----
  useLayoutEffect(() => {
    for (const c of CALLOUTS) {
      if (c.target.kind === 'muscle') {
        const key = c.target.key;
        const m = model.muscles.find((x) => x.path.key === key);
        if (m) setAnchorWorld(c.id, at(sampleCurve(m.points, 9), 4));
      } else {
        const seg = must(model.sk.byId, c.target.segment, 'segmento');
        setAnchorWorld(c.id, pointToWorld(model.pose, seg.id, scale(seg.tip, c.target.at)));
      }
    }
  }, [model]);

  // ---- Laço: progresso amortecido → cortes, câmera, chamadas ----
  const shown = useRef(useStage.getState().progress);
  // Entrada só na primeira pintura, no topo da página e sem redução de movimento.
  const intro = useRef(reduceMotion() || useStage.getState().progress > 0.02 ? 1 : 0);
  const target = new Vector3(0, 0.93, 0);
  const tmp = useRef(new Vector3());
  const skinRef = useRef<Mesh>(null);

  useEffect(() => useStage.subscribe(() => invalidate()), [invalidate]);
  useEffect(() => {
    useStage.getState().setReady(true);
    return () => useStage.getState().setReady(false);
  }, []);

  useFrame((_, dt) => {
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
    layer.skin.cut.value = Math.min(f.cuts.skin, ic);
    layer.superficial.cut.value = Math.min(f.cuts.superficial, ic);
    layer.deep.cut.value = Math.min(f.cuts.deep, ic);
    layer.bone.cut.value = ic;

    // Músculos chamados "acendem" enquanto a camada deles está em evidência.
    for (const c of CALLOUTS) {
      if (c.target.kind !== 'muscle') continue;
      const mat = mats.muscle.get(c.target.key);
      if (!mat) continue;
      const w = windowWeight(p, LAYER_WINDOWS[c.layer], 0.04);
      const base = c.layer === 'deep' ? BASE_STAIN.deep : BASE_STAIN.superficial;
      mat.uniforms.uStain.value = base + (0.92 - base) * w;
    }

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

  return (
    <group>
      <mesh ref={skinRef} geometry={model.skin} material={mats.skin} renderOrder={3} />
      {model.muscles.map((m) => (
        <mesh key={m.path.key} geometry={m.geometry} material={must(mats.muscle, m.path.key)} renderOrder={m.path.layer === 'deep' ? 1 : 2} />
      ))}
      {[...model.bones.entries()].map(([seg, g]) => {
        const tr = must(model.pose.world, seg, 'segmento');
        return (
          <mesh
            key={seg}
            geometry={g}
            material={mats.bone}
            position={tr.position as [number, number, number]}
            quaternion={tr.rotation as [number, number, number, number]}
          />
        );
      })}
    </group>
  );
}
