/**
 * Folha de contato (só desenvolvimento): `/dev/clipes?folha=1&id=<id>` desenha 6 × 2 quadros num canvas só (u = 0, 0,2 …
 * 1 × vista lateral e 3/4) com o corpo e o equipamento de verdade (mesmos materiais do palco), o id, os graus
 * principais, o erro das restrições e o atravessamento medido (`engine/motion/collide.ts` e, contra a malha desenhada,
 * `scene/motion/gearContacts.ts`). `&ids=a,b,c` empilha várias.
 * `&estacao=power_rack,...` e `&halter=hex` (prévias sem mexer no clipe), `&tema=claro`, `&foco=mao` (perto da mão direita), `&dedos=0..1` (força o fechamento das mãos), `&pele=vidro|nao`, `&lod=lo|mid|hi|ultra` (padrão mid).
 * Quando termina de desenhar, `<html data-sheet="ready">` (para o script de captura, que fica fora do repositório).
 * Texto fora do i18n: é ferramenta.
 */
import { useEffect, useRef, useState } from 'react';
import { Color, Mesh, SRGBColorSpace, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { muscleDefs } from '@/data';
import { penetrations } from '@/engine/motion/collide';
import { evaluateClip, type CompiledClip } from '@/engine/motion/evaluate';
import type { Vec3 } from '@/engine/math/vec';
import { fitDistance, orbitPosition } from '@/features/atlas/explorer/orbit';
import { clipEntries, compiledClip, compileLoose, expandEntry } from '@/features/library/motion';
import { StationId } from '@/data/schema/motion';
import { BodyInstance } from '@/scene/body/instance';
import { buildBodyModel } from '@/scene/body/model';
import { palette, refreshPalette, rig } from '@/scene/body/rig';
import { isLod } from '@/scene/anatomy/lod';
import { loadAnatomyPack } from '@/scene/anatomy/pack';
import { clipBox } from '@/scene/motion/MotionScene';
import { EquipmentView } from '@/scene/motion/equipment';
import { gearAppear } from '@/scene/motion/gear/material';
import { gearHits } from '@/scene/motion/gearContacts';

const US = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
const q = new URLSearchParams(location.search);
const ids = (q.get('ids') ?? q.get('id') ?? '').split(',').filter(Boolean);
const hand = q.get('foco') === 'mao';
// `&dedos=0..1`: força quanto as mãos fecham (comparar aberta e fechada).
const fingers = q.has('dedos') ? Number(q.get('dedos')) : null;
// `&estacao=power_rack,flat_bench`: põe estações no clipe só aqui (prévia antes de ir para clips.json).
const stations = (q.get('estacao') ?? '').split(',').filter((x): x is StationId => StationId.safeParse(x).success);

// `&halter=hex`: halter sextavado (prévia).
const hex = q.get('halter') === 'hex';

function clipFor(id: string): CompiledClip | null {
  if (!stations.length && !hex) return compiledClip(id);
  const e = clipEntries.find((x) => x.id === id);
  if (!e) return null;
  const c = expandEntry(e);
  const gear = c.equipment.map((g) => (hex && g.kind === 'dumbbell' ? { ...g, style: 'hex' as const } : g));
  return compileLoose({ ...c, equipment: [...gear, ...stations.map((sid) => ({ kind: 'station' as const, id: sid }))] });
}
// Perto da mão a vista lateral cairia dentro das anilhas: duas diagonais, por fora e por dentro.
const VIEWS = hand
  ? [
      { name: 'mão, por fora', yaw: -0.75, pitch: 0.45 },
      { name: 'mão, por dentro', yaw: 0.8, pitch: -0.25 },
    ]
  : [
      // Lado um pouco de frente: de perfil puro as anilhas tapam o tronco nos exercícios com barra.
      { name: 'lado', yaw: -1.2, pitch: 0.06 },
      { name: '3/4', yaw: -Math.PI / 4, pitch: 0.22 },
    ];
const CELL = { w: 480, h: 430 };

interface Cell {
  readonly id: string;
  readonly u: number;
  readonly view: string;
  readonly text: string[];
}

const fmt = (v: number) => `${Math.round(v)}°`;

function mainDegrees(c: CompiledClip, deg: Readonly<Record<string, number>>): string {
  const ids = [...new Set(c.tracks.map((t) => t.dof))].filter((d) => !d.endsWith('_l')).slice(0, 6);
  return ids.map((d) => `${d.replace(/_r$/, '')} ${fmt(deg[d] ?? 0)}`).join(' · ');
}

export default function ContactSheet() {
  const host = useRef<HTMLDivElement>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const light = q.get('tema') === 'claro' || q.get('tema') === 'light';
    if (light) document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    refreshPalette();
    rig.uLight.value = 1;
    gearAppear.value = 1;
    const clips = ids.map(clipFor);
    const missing = ids.filter((_, i) => !clips[i]);
    if (missing.length) {
      setError(`sem clipe: ${missing.join(', ')}`);
      return;
    }
    const lodQ = q.get('lod');
    let alive = true;
    const W = CELL.w * US.length;
    const H = CELL.h * VIEWS.length * ids.length;
    const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H);
    renderer.setScissorTest(true);
    el.appendChild(renderer.domElement);
    const bg = new Color().setRGB(palette.bg.x, palette.bg.y, palette.bg.z, SRGBColorSpace);
    loadAnatomyPack(isLod(lodQ) ? lodQ : 'mid')
      .then((pack) => {
        if (!alive) return;
        const model = buildBodyModel(pack, muscleDefs);
        const body = new BodyInstance(model, palette);
        body.reset();
        const skin = q.get('pele');
        body.layer('skin', skin === 'nao' ? { visible: false } : { visible: true, alpha: skin === 'vidro' ? 0.22 : 1 });
        const scene = new Scene();
        scene.add(body.group);
        const floor = new Mesh(new PlaneGeometry(8, 8), new MeshBasicMaterial({ color: new Color().setRGB(palette.floor.x, palette.floor.y, palette.floor.z, SRGBColorSpace) }));
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        const cam = new PerspectiveCamera(30, CELL.w / CELL.h, 0.02, 40);
        const out: Cell[] = [];
        clips.forEach((c, row) => {
          if (!c) return;
          const frames = US.map((u) => evaluateClip(c, u));
          const gear = new EquipmentView([0, 0.25, 0.5, 0.75, 1].map((u) => evaluateClip(c, u)));
          gear.refreshColors();
          scene.add(gear.group);
          const box = clipBox(c);
          frames.forEach((f, col) => {
            body.setPose(c.sk, f.pose);
            body.setGrip(fingers ?? f.fingers.r, fingers ?? f.fingers.l);
            body.commit();
            gear.update(f, false);
            const hits = [...penetrations(f, c), ...gearHits(gear, c, f, 0.01)].sort((a, b) => b.depthM - a.depthM);
            const worst = hits[0];
            VIEWS.forEach((v, vi) => {
              const target: Vec3 = hand ? f.grips.r : box.center;
              const dist = hand ? 0.42 : fitDistance(box.size, v.yaw, CELL.w / CELL.h, 1.08);
              const p = orbitPosition({ yaw: v.yaw, pitch: v.pitch, dist, target });
              cam.position.set(p[0], p[1], p[2]);
              cam.lookAt(target[0], target[1], target[2]);
              cam.near = Math.max(0.02, dist * 0.05);
              cam.updateProjectionMatrix();
              const x = col * CELL.w;
              const y = H - (row * VIEWS.length + vi + 1) * CELL.h;
              renderer.setViewport(x, y, CELL.w, CELL.h);
              renderer.setScissor(x, y, CELL.w, CELL.h);
              renderer.setClearColor(bg, 1);
              renderer.clear();
              renderer.render(scene, cam);
              out.push({
                id: c.clip.id,
                u: US[col] ?? 0,
                view: v.name,
                text:
                  vi === 0
                    ? [
                        `${c.clip.id} · u ${US[col]} · ${v.name}`,
                        mainDegrees(c, f.deg),
                        `restrições ${(f.error * 100).toFixed(1)} cm · mãos ${f.fingers.r.toFixed(2)}/${f.fingers.l.toFixed(2)}`,
                        worst ? `atravessa: ${hits.slice(0, 3).map((h) => `${h.a}×${h.b} ${(h.depthM * 100).toFixed(1)} cm`).join(', ')}` : 'sem atravessamento',
                      ]
                    : [`${v.name}`],
              });
            });
          });
          scene.remove(gear.group);
          gear.dispose();
        });
        setCells(out);
        document.documentElement.dataset.sheet = 'ready';
        body.dispose();
      })
      .catch((e: unknown) => setError(String(e)));
    return () => {
      alive = false;
      renderer.dispose();
      renderer.domElement.remove();
      delete document.documentElement.dataset.sheet;
    };
  }, []);

  if (error) return <p style={{ padding: 24, color: 'tomato' }}>{error}</p>;
  return (
    <div className="contact-sheet" style={{ position: 'fixed', inset: 0, zIndex: 999, overflow: 'auto', background: 'var(--c-bg)' }}>
      <div ref={host} style={{ position: 'relative', width: CELL.w * US.length }}>
        {cells.map((c, i) => {
          const row = Math.floor(i / (US.length * VIEWS.length));
          const k = i % (US.length * VIEWS.length);
          const col = Math.floor(k / VIEWS.length);
          const vi = k % VIEWS.length;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: col * CELL.w + 8,
                top: (row * VIEWS.length + vi) * CELL.h + 6,
                width: CELL.w - 16,
                font: '11px/1.35 ui-monospace, monospace',
                color: 'var(--c-text)',
                textShadow: '0 0 3px var(--c-bg)',
                pointerEvents: 'none',
              }}
            >
              {c.text.map((t) => (
                <div key={t}>{t}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
