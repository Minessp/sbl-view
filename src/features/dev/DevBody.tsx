/**
 * Rota só de desenvolvimento (/dev/corpo): posa o corpo anatômico inteiro pelo FK e mostra o skinning.
 * Não entra no build de produção (App.tsx só registra a rota com import.meta.env.DEV).
 * Texto fica aqui, fora do i18n: é ferramenta, não interface do site.
 *
 * Parâmetros de URL: ?pose=<id de REFERENCE_POSES>&lod=hi|lo&camadas=pele,musculo,osso&vista=frente|lado|costas|cima
 * &dist=<fator da distância>&fundo=nenhum (transparente, para scripts/fallback-images.mjs)&painel=nao
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { skeletonDef as skeletonJson } from '@/data';
import { anchorPose, forwardKinematics } from '@/engine/kinematics/fk';
import { buildSkeleton, degToAngles, mirrorId } from '@/engine/kinematics/skeleton';
import { skinMatrices, skinPositions } from '@/engine/kinematics/skinning';
import { loadAnatomyPack, type AnatomyKind, type AnatomyLod, type AnatomyPack } from '@/scene/anatomy/pack';
import { REFERENCE_POSES } from '@/scene/anatomy/poses';

type Layer = 'pele' | 'musculo' | 'osso';
const LAYER_OF: Record<AnatomyKind, Layer> = { skin: 'pele', muscle: 'musculo', tendon: 'musculo', bone: 'osso', cartilage: 'osso' };
const COLOR: Record<AnatomyKind, string> = { skin: '#d9a98c', muscle: '#a8323a', tendon: '#e8dcc4', bone: '#efe6d2', cartilage: '#9fb6c8' };
const VIEWS = { frente: [0, 1, 3.2], lado: [3.2, 1, 0], costas: [0, 1, -3.2], diagonal: [-2.2, 1.4, -2.2], ombro: [-1.1, 1.25, 0.55], cima: [0.6, 3.6, 1.2] } as const;

interface Item {
  readonly mesh: Mesh;
  readonly part: AnatomyPack['parts'][number];
  readonly mirror: Uint8Array | undefined;
}

const sk = buildSkeleton(skeletonJson);
const dofs = skeletonJson.segments.flatMap((s) => s.dofs.map((d) => ({ ...d, segment: s.id, bilateral: s.bilateral })));
const query = new URLSearchParams(location.search);

export default function DevBody() {
  const host = useRef<HTMLDivElement>(null);
  const [pack, setPack] = useState<AnatomyPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deg, setDeg] = useState<Record<string, number>>(() => ({ ...(REFERENCE_POSES.find((p) => p.id === query.get('pose'))?.deg ?? {}) }));
  const [sym, setSym] = useState(false);
  const [layers, setLayers] = useState<ReadonlySet<Layer>>(() => new Set((query.get('camadas') ?? 'musculo,osso').split(',') as Layer[]));
  const lod: AnatomyLod = query.get('lod') === 'lo' ? 'lo' : 'hi';
  const world = useRef<{ scene: Scene; render: () => void; items: Item[] } | null>(null);

  useEffect(() => {
    loadAnatomyPack(lod).then(setPack, (e: unknown) => setError(String(e)));
  }, [lod]);

  // Cena: um renderizador próprio (não usa o palco do site).
  useEffect(() => {
    const el = host.current;
    if (!el || !pack) return;
    const clear = query.get('fundo') === 'nenhum';
    const renderer = new WebGLRenderer({ antialias: true, alpha: clear, preserveDrawingBuffer: clear });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new Scene();
    if (!clear) scene.background = new Color('#15171a');
    const camera = new PerspectiveCamera(30, el.clientWidth / el.clientHeight, 0.05, 50);
    const v = VIEWS[(query.get('vista') ?? 'frente') as keyof typeof VIEWS] ?? VIEWS.frente;
    const k = Number(query.get('dist')) || 1;
    camera.position.set(v[0] * k, v[1], v[2] * k);
    const controls = new OrbitControls(camera, renderer.domElement);
    const alvo = Number(query.get('alvo'));
    controls.target.set(0, alvo || (query.get('pose') === 'deep_squat' || query.get('pose') === 'squat_overhead' ? 0.55 : 0.9), 0);
    controls.update();
    scene.add(new AmbientLight('#ffffff', 0.55));
    const key = new DirectionalLight('#ffffff', 1.6);
    key.position.set(2, 3, 2.5);
    scene.add(key);
    const rim = new DirectionalLight('#9fb4ff', 0.7);
    rim.position.set(-2, 1.5, -2.5);
    scene.add(rim);
    const materials = new Map<AnatomyKind, MeshStandardMaterial>();
    const mat = (k: AnatomyKind) => {
      let m = materials.get(k);
      if (!m) {
        m = new MeshStandardMaterial({ color: COLOR[k], roughness: k === 'bone' ? 0.6 : 0.5, side: DoubleSide });
        if (k === 'skin' && query.get('pele') !== 'opaca') Object.assign(m, { transparent: true, opacity: 0.35, depthWrite: false });
        materials.set(k, m);
      }
      return m;
    };
    const items: Item[] = [];
    for (const part of pack.parts) {
      for (const mirror of part.mirror ? [undefined, pack.jointMirror] : [undefined]) {
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(part.positions.length), 3));
        const idx = Uint32Array.from(part.indices);
        // Espelho inverte a orientação: troca dois vértices de cada triângulo.
        if (mirror) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2] ?? 0, idx[t + 1] ?? 0];
        g.setIndex(new BufferAttribute(idx, 1));
        const mesh = new Mesh(g, mat(part.kind));
        mesh.frustumCulled = false;
        mesh.renderOrder = part.kind === 'skin' ? 1 : 0;
        scene.add(mesh);
        items.push({ mesh, part, mirror });
      }
    }
    let frame = 0;
    const render = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => renderer.render(scene, camera));
    };
    controls.addEventListener('change', render);
    const onResize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      render();
    };
    addEventListener('resize', onResize);
    world.current = { scene, render, items };
    return () => {
      removeEventListener('resize', onResize);
      cancelAnimationFrame(frame);
      controls.dispose();
      for (const it of items) it.mesh.geometry.dispose();
      for (const m of materials.values()) m.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      world.current = null;
    };
  }, [pack]);

  const angles = useMemo(() => {
    const out: Record<string, number> = { ...deg };
    if (sym) for (const [id, v] of Object.entries(deg)) if (id.endsWith('_r')) out[mirrorId(id)] = v;
    return out;
  }, [deg, sym]);

  // Pose → FK → skinning na CPU.
  useEffect(() => {
    const w = world.current;
    if (!w || !pack) return;
    const t0 = performance.now();
    // Pé direito plantado onde está na pose neutra: o resto do corpo se acomoda.
    const neutralFoot = forwardKinematics(sk, {}).world.get('foot_r');
    let pose = forwardKinematics(sk, degToAngles(angles));
    if (neutralFoot) pose = anchorPose(pose, 'foot_r', neutralFoot);
    const M = skinMatrices(sk, pose, pack.joints.map((j) => j.id));
    for (const it of w.items) {
      it.mesh.visible = layers.has(LAYER_OF[it.part.kind]);
      if (!it.mesh.visible) continue;
      const attr = it.mesh.geometry.getAttribute('position') as BufferAttribute;
      skinPositions(it.part, M, it.mirror, attr.array as Float32Array);
      attr.needsUpdate = true;
      it.mesh.geometry.computeVertexNormals();
    }
    w.render();
    document.documentElement.dataset.devBody = `pronto ${Math.round(performance.now() - t0)} ms`;
  }, [angles, layers, pack]);

  const setOne = (id: string, v: number) => setDeg((d) => ({ ...d, [id]: v }));
  const toggle = (l: Layer) =>
    setLayers((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: query.get('painel') === 'nao' ? '1fr' : 'minmax(0, 1fr) 320px', height: 'calc(100dvh - 4rem)', gap: 12 }}>
      <div ref={host} style={{ position: 'relative', minHeight: 0 }} aria-label="Corpo anatômico posado">
        {error && <p role="alert">Falha ao carregar o pacote: {error}</p>}
      </div>
      <aside style={{ overflow: 'auto', fontSize: 13 }} hidden={query.get('painel') === 'nao'}>
        <h1 style={{ fontSize: 18 }}>Corpo: pose (dev)</h1>
        <p>{pack ? `${pack.parts.length} partes, LOD ${pack.lod}` : 'carregando…'}</p>
        <fieldset>
          <legend>Poses</legend>
          {REFERENCE_POSES.map((p) => (
            <button key={p.id} type="button" data-pose={p.id} onClick={() => setDeg({ ...p.deg })} style={{ margin: 2 }}>
              {p.label}
            </button>
          ))}
        </fieldset>
        <fieldset>
          <legend>Camadas</legend>
          {(['pele', 'musculo', 'osso'] as const).map((l) => (
            <label key={l} style={{ marginRight: 8 }}>
              <input type="checkbox" checked={layers.has(l)} onChange={() => toggle(l)} /> {l}
            </label>
          ))}
          <label style={{ display: 'block' }}>
            <input type="checkbox" checked={sym} onChange={(e) => setSym(e.target.checked)} /> lado esquerdo copia o direito
          </label>
        </fieldset>
        {dofs.map((d) => (
          <label key={d.id} style={{ display: 'grid', gridTemplateColumns: '9.5rem 1fr 2.5rem', alignItems: 'center' }}>
            <span>{d.id}</span>
            <input type="range" min={d.romDeg[0]} max={d.romDeg[1]} step={1} value={deg[d.id] ?? 0} onChange={(e) => setOne(d.id, +e.target.value)} />
            <output>{deg[d.id] ?? 0}</output>
          </label>
        ))}
      </aside>
    </div>
  );
}
