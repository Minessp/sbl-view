/**
 * Telemetria do player desenhada no corpo: arco de ângulo na articulação principal, rastro da carga na repetição,
 * linha de ação e braço de momento do músculo isolado. Linhas de espessura constante na tela (Line2, 1,5 px); os
 * números vão para rótulos no DOM (`annotations.ts`), com o texto fixo dado pela página.
 */
import { Group, SRGBColorSpace, Vector3, type Camera } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { add, applyTransform, DEG, dot, length, normalize, QUAT_IDENTITY, quatFromAxisAngle, quatMul, rotate, scale, sub, type Vec3 } from '@/engine/math/vec';
import { evaluateClip, type CompiledClip, type MotionFrame } from '@/engine/motion/evaluate';
import { momentArm } from '@/engine/muscle/momentArm';
import { pathWorldPoints, type MusclePath } from '@/engine/muscle/paths';
import { anchors, HUD_TAGS, hudTrail } from '../annotations';
import { palette } from '../body/rig';

/** Amostras do rastro da carga na repetição (u = 0 → 1). */
const TRAIL = 33;
const ARC_STEPS = 24;

export interface HudInput {
  readonly frame: MotionFrame;
  readonly u: number;
  readonly dof: string | null;
  /** Caminhos do músculo isolado (vazio = sem linha de ação). */
  readonly paths: readonly MusclePath[];
  readonly showLoad: boolean;
  /** Caminho do alvo principal: o rótulo das pontas fica no meio dele. */
  readonly target: MusclePath | null;
  /** false no celular: só arco e rastro. */
  readonly full: boolean;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const lineMat = (opacity: number) => new LineMaterial({ linewidth: 1.5, transparent: true, opacity, depthTest: false, depthWrite: false });

function closestOnPolyline(pts: readonly Vec3[], p: Vec3): Vec3 | null {
  let best: Vec3 | null = null;
  let bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (!a || !b) continue;
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(1e-9, dot(ab, ab))));
    const q = add(a, scale(ab, t));
    const d = length(sub(q, p));
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

export class Telemetry {
  readonly group = new Group();
  private readonly dimMat = lineMat(0.32);
  private readonly mat = lineMat(0.92);
  private readonly trail: Vec3[];
  private readonly dim: LineSegments2;
  private readonly live: LineSegments2;
  private readonly tmp = new Vector3();
  private readonly nf0: Intl.NumberFormat;
  private readonly nf1: Intl.NumberFormat;

  constructor(private readonly clip: CompiledClip) {
    this.trail = Array.from({ length: TRAIL }, (_, i) => evaluateClip(clip, i / (TRAIL - 1)).load?.point).filter((p): p is Vec3 => !!p);
    const pos: number[] = [];
    for (let i = 1; i < this.trail.length; i++) pos.push(...(this.trail[i - 1] ?? [0, 0, 0]), ...(this.trail[i] ?? [0, 0, 0]));
    this.dim = new LineSegments2(new LineSegmentsGeometry(), this.dimMat);
    if (pos.length) this.dim.geometry.setPositions(pos);
    this.dim.visible = pos.length > 0;
    this.live = new LineSegments2(new LineSegmentsGeometry(), this.mat);
    for (const l of [this.dim, this.live]) {
      l.renderOrder = 20;
      l.frustumCulled = false;
      this.group.add(l);
    }
    // Rótulo no idioma da página sem importar o i18n no palco (o palco é igual nos dois idiomas).
    const lang = document.documentElement.lang || undefined;
    this.nf0 = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
    this.nf1 = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  hide() {
    this.group.visible = false;
    hudTrail.pts = [];
    for (const id of Object.values(HUD_TAGS)) this.tag(id, null);
  }

  update(h: HudInput, cam: Camera, rect: Rect) {
    this.group.visible = true;
    const ink = palette.ink;
    this.mat.color.setRGB(ink.x, ink.y, ink.z, SRGBColorSpace);
    this.dimMat.color.setRGB(ink.x, ink.y, ink.z, SRGBColorSpace);
    const segs: number[] = [];
    const seg = (a: Vec3, b: Vec3) => segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    const f = h.frame;

    // ---- Rastro: o trecho já percorrido da repetição aceso ----
    const lit = Math.round(h.u * (this.trail.length - 1));
    for (let i = 1; i <= lit; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      if (a && b) seg(a, b);
    }

    // ---- Arco de ângulo na articulação principal ----
    let angleAt: Vec3 | null = null;
    let angleText = '';
    const c = this.clip;
    const s = h.dof ? c.sk.segments.find((x) => x.dofs.some((d) => d.id === h.dof)) : undefined;
    const parent = s?.parent ? f.pose.world.get(s.parent) : undefined;
    const center = s && parent ? applyTransform(parent, s.jointOffset) : null;
    if (s && parent && center && h.dof) {
      const dofId = h.dof;
      // Direção do segmento com o DOF valendo `deg` e os outros como no quadro: o arco fica no plano do movimento.
      const dirAt = (deg: number): Vec3 => {
        let q = QUAT_IDENTITY;
        for (const d of s.dofs) q = quatMul(q, quatFromAxisAngle(d.axis, (d.id === dofId ? deg : (f.deg[d.id] ?? 0)) * DEG * d.sign));
        return normalize(rotate(parent.rotation, rotate(q, s.tip)));
      };
      const deg = f.deg[dofId] ?? 0;
      const R = Math.min(0.16, Math.max(0.07, length(s.tip) * 0.4));
      const at = (deg: number, r: number) => add(center, scale(dirAt(deg), r));
      let prev = at(0, R);
      for (let i = 1; i <= ARC_STEPS; i++) {
        const p = at((deg * i) / ARC_STEPS, R);
        seg(prev, p);
        prev = p;
      }
      const sg = Math.sign(deg) || 1;
      for (let k = 0; k <= Math.abs(deg) + 1e-6; k += 15) seg(at(sg * k, R), at(sg * k, R * (k % 45 === 0 ? 1.2 : 1.1)));
      seg(center, at(deg, R * 1.3));
      angleAt = at(deg / 2, R * 1.5);
      angleText = `${this.nf0.format(Math.round(deg))}°`;
    }

    // ---- Vetor da carga: só o rótulo (a haste é do equipamento) ----
    const L = f.load;
    const loadAt = h.full && h.showLoad && L ? add(L.point, scale(L.dir, 0.36)) : null;

    // ---- Linha de ação e braço de momento do músculo isolado ----
    let armAt: Vec3 | null = null;
    let armText = '';
    const path = h.paths[0];
    if (h.full && path && center && h.dof) {
      const pts = pathWorldPoints(f.pose, path);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (a && b) seg(a, b);
      }
      const q = closestOnPolyline(pts, center);
      if (q) {
        seg(center, q);
        const rad = Object.fromEntries(Object.entries(f.deg).map(([k, v]) => [k, v * DEG]));
        const cm = Math.abs(momentArm(c.sk, path, rad, h.dof, f.deg[h.dof] ?? 0) * 100);
        // Braço quase nulo (músculo passa sobre o eixo) não tem número confiável no modelo.
        if (Number.isFinite(cm) && cm >= 0.2) {
          armAt = scale(add(center, q), 0.5);
          armText = `${this.nf1.format(cm)} cm`;
        }
      }
    }

    // ---- Pontas da repetição: rótulo no meio do alvo principal ----
    let endAt: Vec3 | null = null;
    if (h.full && h.target && (h.u < 0.06 || h.u > 0.94)) {
      const pts = pathWorldPoints(f.pose, h.target);
      endAt = pts[Math.floor(pts.length / 2)] ?? null;
    }

    // ---- Rastro na tela, para a alça de carga ----
    hudTrail.pts = h.full
      ? this.trail.map((p) => {
          const v = this.tmp.set(p[0], p[1], p[2]).project(cam);
          return [rect.x + (v.x * 0.5 + 0.5) * rect.w, rect.y + (-v.y * 0.5 + 0.5) * rect.h];
        })
      : [];
    const handleAt = h.full && L ? L.point : null;

    if (segs.length) this.live.geometry.setPositions(segs);
    this.live.visible = segs.length > 0;
    this.tag(HUD_TAGS.angle, angleAt, angleText, cam, rect);
    this.tag(HUD_TAGS.load, loadAt, undefined, cam, rect);
    this.tag(HUD_TAGS.arm, armAt, armText, cam, rect);
    this.tag(HUD_TAGS.end, endAt, undefined, cam, rect);
    this.tag(HUD_TAGS.handle, handleAt, undefined, cam, rect);
  }

  private tag(id: string, p: Vec3 | null, text?: string, cam?: Camera, rect?: Rect) {
    const el = anchors.get(id)?.el;
    if (!el) return;
    // Escondido sai do foco e do ponteiro (a alça é um controle).
    if (!p || !cam || !rect) {
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
      return;
    }
    const v = this.tmp.set(p[0], p[1], p[2]).project(cam);
    el.style.opacity = '1';
    el.style.visibility = 'visible';
    el.style.transform = `translate(${(rect.x + (v.x * 0.5 + 0.5) * rect.w).toFixed(1)}px, ${(rect.y + (-v.y * 0.5 + 0.5) * rect.h).toFixed(1)}px)`;
    const out = text === undefined ? null : el.querySelector('[data-v]');
    if (out && out.textContent !== text) out.textContent = text ?? '';
  }

  dispose() {
    this.hide();
    for (const l of [this.dim, this.live]) l.geometry.dispose();
    this.dimMat.dispose();
    this.mat.dispose();
  }
}
