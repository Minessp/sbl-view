/**
 * Validação do banco: roda no CI. Garante schema, referências existentes
 * e consistência entre músculos e esqueleto.
 */
import { describe, expect, it } from 'vitest';
import { buildSkeleton } from '@/engine/kinematics/skeleton';
import { buildMusclePaths } from '@/engine/muscle/paths';
import { momentArm } from '@/engine/muscle/momentArm';
import anthropometryJson from './anthropometry.json';
import capacityJson from './capacity.json';
import squatJson from './exercises/squat.json';
import libraryJson from './exercises/library.json';
import movementsJson from './movements.json';
import { baseAngles, sidedDof } from './movement';
import musclesJson from './muscles.json';
import referencesJson from './references.json';
import skeletonJson from './skeleton.json';
import trainingJson from './training.json';
import planningJson from './planning.json';
import musclePathsJson from './muscle-paths.json';
import clipsJson from './exercises/clips.json';
import variationsJson from './exercises/variations.json';
import { LabVariationFile } from './schema/lab';
import { applyPatches } from '@/engine/motion/patch';
import { ClipFile, MotionClip } from './schema/motion';
import { compileClip, evaluateClip } from '@/engine/motion/evaluate';
import { angleBetween, DEG, normalize, rotate, scale, sub } from '@/engine/math/vec';
import { pointToWorld } from '@/engine/kinematics/fk';
import { readJoints } from '@/engine/kinematics/limits';
import { must } from '@/engine/math/arr';
import { expandEntry, motionMasses } from '@/features/library/motion';
import { lengthCurves } from '@/features/library/player/lengths';
import { PlanningFile, TrainingFile } from './schema/planning';
import { E1RM_MAX_REPS } from '@/engine/training/progress';
import { Reference, type Evidence } from './schema/evidence';
import { Exercise as ExerciseSchema, LibraryFile } from './schema/exercise';
import { MovementFile, MuscleFile, MusclePathsFile } from './schema/muscle';
import { resolveMuscleParts } from '@/engine/muscle/resolve';
import { SkeletonDef } from './schema/skeleton';
import { z } from 'zod';

const refs = z.array(Reference).parse(referencesJson);
const refIds = new Set(refs.map((r) => r.id));

/** Coleta todo objeto com forma de Evidence em qualquer profundidade. */
function collectEvidence(node: unknown, out: Evidence[] = []): Evidence[] {
  if (Array.isArray(node)) node.forEach((n) => collectEvidence(n, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (Array.isArray(o.source) && typeof o.confidence === 'string') out.push(o as unknown as Evidence);
    Object.values(o).forEach((v) => collectEvidence(v, out));
  }
  return out;
}

const allEvidence = () =>
  [skeletonJson, musclesJson, anthropometryJson, capacityJson, squatJson, libraryJson, trainingJson, planningJson, clipsJson, variationsJson].flatMap((j) => collectEvidence(j));

describe('banco de dados', () => {
  it('referências: ids únicos', () => {
    expect(refIds.size).toBe(refs.length);
  });

  it('esqueleto segue o schema', () => {
    expect(() => SkeletonDef.parse(skeletonJson)).not.toThrow();
  });

  it('músculos seguem o schema', () => {
    expect(() => MuscleFile.parse(musclesJson)).not.toThrow();
  });

  it('toda fonte citada existe em references.json', () => {
    const all = allEvidence();
    expect(all.length).toBeGreaterThan(20);
    for (const ev of all) for (const s of ev.source) expect(refIds, `refId ${s.refId}`).toContain(s.refId);
  });

  it('caminhos musculares apontam para segmentos existentes e ids são únicos', () => {
    const sk = buildSkeleton(SkeletonDef.parse(skeletonJson));
    const paths = buildMusclePaths(sk, resolveMuscleParts(MuscleFile.parse(musclesJson), MusclePathsFile.parse(musclePathsJson).parts, sk));
    const keys = new Set(paths.map((p) => p.key));
    expect(keys.size).toBe(paths.length);
  });

  it('geometria autoral nunca aparece como "estabelecido"', () => {
    for (const ev of [...collectEvidence(skeletonJson), ...collectEvidence(musclesJson)]) {
      if (ev.source.every((s) => s.refId === 'sbl_authored')) expect(ev.confidence).not.toBe('estabelecido');
    }
  });

  it('"estabelecido" exige ao menos uma fonte conferida', () => {
    const verified = new Set(refs.filter((r) => r.verified).map((r) => r.id));
    for (const ev of allEvidence()) {
      if (ev.confidence !== 'estabelecido') continue;
      expect(ev.source.some((s) => verified.has(s.refId)), JSON.stringify(ev.source)).toBe(true);
    }
  });

  it('tracker: corte do 1RM estimado no motor é o mesmo do banco', () => {
    expect(trainingJson.e1rm.maxReps.value).toBe(E1RM_MAX_REPS);
    expect(() => TrainingFile.parse(trainingJson)).not.toThrow();
  });

  it('raciocínio próprio nunca passa de "especulativo"', () => {
    for (const ev of allEvidence()) {
      if (ev.source.every((s) => s.refId === 'sbl_reasoning' || s.refId === 'sbl_authored')) expect(ev.confidence).toBe('especulativo');
    }
  });
});

describe('biblioteca de exercícios', () => {
  const lib = LibraryFile.parse(libraryJson);
  const muscles = new Map(MuscleFile.parse(musclesJson).map((m) => [m.id, m]));

  it('ids únicos e alvos apontam para músculos e partes existentes', () => {
    expect(new Set(lib.map((e) => e.id)).size).toBe(lib.length);
    for (const e of lib) {
      expect(e.targets.some((t) => t.role === 'alvo'), `${e.id} sem alvo`).toBe(true);
      expect(new Set(e.targets.map((t) => t.muscle)).size, `${e.id}: músculo repetido nos alvos`).toBe(e.targets.length);
      for (const t of e.targets) {
        const m = muscles.get(t.muscle);
        expect(m, `${e.id}: ${t.muscle}`).toBeDefined();
        for (const p of t.parts ?? []) expect(m?.parts.map((x) => x.id), `${e.id}: ${p}`).toContain(p);
      }
    }
  });

  it('exercício com Lab aponta para um exercício do Lab que existe', () => {
    const lab = new Set([ExerciseSchema.parse(squatJson).id]);
    for (const e of lib) if (e.labId) expect(lab, e.id).toContain(e.labId);
  });

  it('hipótese nunca se apoia em "estabelecido"', () => {
    for (const e of lib) if (e.status === 'hipotese') expect(e.length.confidence).not.toBe('estabelecido');
  });
});

describe('ações articulares', () => {
  const movements = MovementFile.parse(movementsJson);
  const byId = new Map(movements.map((m) => [m.id, m]));
  const muscles = MuscleFile.parse(musclesJson);

  it('movimentos com ids únicos; DOF existe no esqueleto', () => {
    expect(byId.size).toBe(movements.length);
    const dofs = new Set(SkeletonDef.parse(skeletonJson).segments.flatMap((s) => s.dofs.map((d) => d.id.replace(/_r$/, ''))));
    for (const m of movements) if (m.dof) expect(dofs, m.id).toContain(m.dof);
  });

  it('toda ação aponta para movimento e partes existentes; sem ação repetida', () => {
    for (const mu of muscles) {
      const parts = new Set(mu.parts.map((p) => p.id));
      const seen = new Set<string>();
      for (const a of mu.actions) {
        expect(byId.has(a.movement), `${mu.id}: ${a.movement}`).toBe(true);
        for (const p of a.parts ?? []) expect(parts, `${mu.id}: parte ${p}`).toContain(p);
        const key = `${a.movement}|${(a.parts ?? []).join(',')}`;
        expect(seen.has(key), `${mu.id}: ${key} repetida`).toBe(false);
        seen.add(key);
      }
    }
  });

  // O caminho desenhado à mão precisa concordar com a anatomia pelo menos no sinal:
  // se a ação é extensão do quadril, o braço de momento do modelo tem de ser de extensor.
  it('braço de momento do modelo tem o sinal da ação, na faixa conferida', () => {
    const sk = buildSkeleton(SkeletonDef.parse(skeletonJson));
    const paths = buildMusclePaths(sk, resolveMuscleParts(muscles, MusclePathsFile.parse(musclePathsJson).parts, sk)).filter((p) => p.side === 'r');
    const dofIds = new Set(sk.segments.flatMap((s) => s.dofs.map((d) => d.id)));
    const failures: string[] = [];
    for (const mu of muscles) {
      for (const a of mu.actions) {
        const mv = byId.get(a.movement);
        if (!mv?.dof || !mv.sign || a.unmodeled) continue;
        const range = a.rangeDeg ?? mv.rangeDeg;
        if (!range) continue;
        const dof = sidedDof(mv.dof, dofIds);
        const base = baseAngles(mv, dofIds);
        for (const p of paths.filter((q) => q.muscleId === mu.id && (!a.parts || a.parts.includes(q.partId)))) {
          for (let d = range[0]; d <= range[1] + 1e-9; d += 10) {
            const r = momentArm(sk, p, base, dof, d) * mv.sign;
            if (r < 0.002) failures.push(`${p.partId} ${a.movement} @${d}°: ${(r * 100).toFixed(1)} cm`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('planejador e malha anatômica', () => {
  it('planning.json segue o schema; ponto de partida fica dentro da faixa', () => {
    const p = PlanningFile.parse(planningJson);
    for (const k of ['priorizar', 'manter'] as const) {
      const [lo, hi] = p.volume[k].value;
      expect(p.defaultSets.value[k]).toBeGreaterThanOrEqual(lo);
      expect(p.defaultSets.value[k]).toBeLessThanOrEqual(hi);
    }
    expect(p.volume.manter.value[1]).toBeLessThanOrEqual(p.volume.priorizar.value[0]);
  });

  it('malhas: toda parte aponta para malhas do pacote; nenhuma malha em duas partes', () => {
    const lines = MusclePathsFile.parse(musclePathsJson).parts;
    const owner = new Map<string, string>();
    for (const m of MuscleFile.parse(musclesJson)) {
      for (const p of m.parts) {
        for (const id of p.mesh) {
          expect(owner.get(id), `${id} em ${owner.get(id)} e ${p.id}`).toBeUndefined();
          owner.set(id, p.id);
          expect(lines[id], `${id} sem linha central`).toBeDefined();
        }
        for (const r of p.path ?? []) if (typeof r === 'string') expect(lines[r], `${p.id}: caminho ${r}`).toBeDefined();
      }
    }
  });

  it('músculos e partes com ids únicos; todo grupo tem região', () => {
    const muscles = MuscleFile.parse(musclesJson);
    expect(new Set(muscles.map((m) => m.id)).size).toBe(muscles.length);
    const parts = muscles.flatMap((m) => m.parts.map((p) => p.id));
    expect(new Set(parts).size).toBe(parts.length);
    expect(parts.length).toBeGreaterThanOrEqual(75);
  });
});


describe('clipes de movimento', () => {
  const lib = LibraryFile.parse(libraryJson);
  const entries = ClipFile.parse(clipsJson);
  const sk = buildSkeleton(SkeletonDef.parse(skeletonJson));
  const rom = new Map(sk.segments.flatMap((s) => s.dofs.map((d) => [d.id, [d.min / DEG, d.max / DEG] as const])));
  const SAMPLES = 24;

  it('todo exercício da biblioteca tem clipe, e todo clipe tem exercício', () => {
    const ids = new Set(entries.map((e) => e.id));
    expect(ids.size).toBe(entries.length);
    for (const e of lib) expect(ids, `${e.id} sem clipe`).toContain(e.id);
    for (const id of ids) expect(lib.map((e) => e.id), `clipe órfão ${id}`).toContain(id);
  });

  const compiled = (id: string) => {
    const e = entries.find((x) => x.id === id);
    if (!e) throw new Error(id);
    return compileClip(MotionClip.parse(expandEntry(e)), sk, motionMasses);
  };

  it('carga guiada vai contra a concêntrica; cabo espelhado tem uma roldana por mão; perna de trás no banco', () => {
    // Supino máquina: empurra para a frente (+Z) na ida, a carga aponta para trás.
    const press = evaluateClip(compiled('machine_chest_press'), 0.5);
    expect(press.load?.dir[2]).toBeLessThan(-0.9);
    const fly = evaluateClip(compiled('cable_fly'), 0.5).equipment.filter((q) => q.kind === 'cable');
    expect(fly).toHaveLength(2);
    expect(fly.map((q) => (q.kind === 'cable' ? Math.sign(q.pulley[0]) : 0)).sort()).toEqual([-1, 1]);
    // Búlgaro: só a perna esquerda tem alvo, e ela fica no banco (atrás, no alto).
    const bss = evaluateClip(compiled('bulgarian_split_squat'), 1);
    const foot = sk.byId.get('foot_l');
    const ball = foot ? pointToWorld(bss.pose, 'foot_l', foot.tip) : [0, 0, 0];
    expect(ball[1]).toBeGreaterThan(0.38);
    expect(ball[2]).toBeLessThan(-0.6);
  });

  // u = 0 é a ponta alongada dos alvos e u = 1 a encurtada. O comprimento sai do caminho do Atlas; onde o caminho
  // pela linha central falha (limites conhecidos), o exercício fica na lista com o motivo.
  const LENGTH_EXCEPTIONS: Record<string, string> = {
    overhead_press: 'deltoide acima de 80° de elevação: a linha central cruza o eixo',
    seated_dumbbell_press: 'deltoide acima de 80° de elevação',
    machine_shoulder_press: 'deltoide acima de 80° de elevação',
    incline_y_raise: 'deltoide acima de 80° de elevação',
    incline_bench_press: 'peitoral clavicular acima de 50° de flexão',
    incline_dumbbell_press: 'peitoral clavicular acima de 50° de flexão',
    low_to_high_cable_fly: 'peitoral clavicular acima de 50° de flexão',
    reverse_wrist_curl: 'extensores do punho com o punho fletido',
    shrug: 'levantador da escápula: caminho frágil na escápula elevada',
    reverse_nordic: 'reto femoral e vasto medial com o joelho além de 120°',
    dumbbell_side_bend: 'carga na mão direita: o alvo é o lado esquerdo, e a curva mede o direito',
    cable_woodchop: 'oblíquos em lâmina larga numa linha central só (rotação)',
  };

  it('u = 0 é a ponta alongada: os alvos não ficam mais curtos lá que em u = 1', () => {
    const wrong: string[] = [];
    for (const ex of lib) {
      const c = compiled(ex.id);
      const prim = ex.targets.filter((t) => t.role === 'alvo').map((t) => t.muscle);
      const { series } = lengthCurves(c, prim);
      if (!series.length) continue;
      const d = series.reduce((a, s) => a + (s.values[0] ?? 0) - (s.values[s.values.length - 1] ?? 0), 0) / series.length;
      const known = ex.id in LENGTH_EXCEPTIONS;
      if (d < -1 && !known) wrong.push(`${ex.id}: ${d.toFixed(1)} pontos`);
      if (d >= -1 && known) wrong.push(`${ex.id} saiu da lista de exceções (${d.toFixed(1)})`);
    }
    expect(wrong).toEqual([]);
  });

  // Barra nas duas mãos: o eixo da palma (polegar → mínimo) corre ao longo da barra. Onde a pronação sozinha não basta
  // (punho ou rotação do ombro teriam de mudar junto), o exercício fica na lista com o motivo.
  const GRIP_EXCEPTIONS: Record<string, string> = {
    front_squat: 'apoio frontal: a barra sobre os deltoides pede extensão do punho que o clipe não tem',
    cable_pullover: 'braços acima da cabeça: a rotação do ombro que o IK escolhe não deixa a pronação alinhar',
    chin_up: 'no alto da barra a supinação completa ainda deixa o punho desviado',
  };

  it('pegada na barra: palma ao longo da barra (supinada ou pronada)', () => {
    const wrong: string[] = [];
    for (const ex of lib) {
      const c = compiled(ex.id);
      if (!c.bar) continue;
      let worst = 0;
      for (let i = 0; i <= 8; i++) {
        const f = evaluateClip(c, i / 8);
        for (const side of ['r', 'l'] as const) {
          const other = side === 'r' ? 'l' : 'r';
          const bar = normalize(sub(f.grips[other], f.grips[side]));
          const ulnar = rotate(must(f.pose.world, `hand_${side}`, 'segmento').rotation, [side === 'r' ? 1 : -1, 0, 0]);
          worst = Math.max(worst, angleBetween(ulnar, c.bar[side] ? bar : scale(bar, -1)) / DEG);
        }
      }
      const known = ex.id in GRIP_EXCEPTIONS;
      if (worst > 30 && !known) wrong.push(`${ex.id}: ${worst.toFixed(0)}°`);
      if (worst <= 30 && known) wrong.push(`${ex.id} saiu da lista de exceções (${worst.toFixed(0)}°)`);
    }
    expect(wrong).toEqual([]);
  });

  /** Regras de todo clipe: DOFs na amplitude, restrições fechadas, sem NaN, nada no chão, limites por plano. */
  function expectValidClip(clip: MotionClip) {
    const c = compileClip(clip, sk, motionMasses);
    for (let i = 0; i <= SAMPLES; i++) {
      const f = evaluateClip(c, i / SAMPLES);
      for (const [dof, v] of Object.entries(f.deg)) {
        expect(Number.isFinite(v), `${dof} em u=${f.u}`).toBe(true);
        const r = rom.get(dof);
        expect(r, dof).toBeDefined();
        if (!r) continue;
        expect(v, `${dof} em u=${f.u.toFixed(2)}`).toBeGreaterThanOrEqual(r[0] - 0.5);
        expect(v, `${dof} em u=${f.u.toFixed(2)}`).toBeLessThanOrEqual(r[1] + 0.5);
      }
      expect(f.error, `restrição aberta em u=${f.u.toFixed(2)}`).toBeLessThan(0.01);
      for (const t of f.pose.world.values()) for (const x of [...t.position, ...t.rotation]) expect(Number.isFinite(x)).toBe(true);
      // Nada atravessa o chão.
      for (const p of f.contacts) expect(p[1]).toBeGreaterThan(-0.02);
      // Sem rotação absurda: coluna, ombro e quadril dentro dos limites por plano (a combinação, não só cada DOF).
      for (const r of readJoints(sk, f.pose)) expect(r.over, `${r.segment} em u=${f.u.toFixed(2)}: torção ${r.twist.toFixed(0)}°, balanço ${r.swing.toFixed(0)}°`).toBeLessThan(1);
      // Pé plantado sem alvo assenta a planta no chão (não rola com a abdução do quadril).
      if (clip.root.mode === 'plant')
        for (const s of ['r', 'l'] as const) {
          if (clip.reach.some((r) => r.limb === 'leg' && (r.side === 'both' || r.side === s))) continue;
          const up = rotate(must(f.pose.world, `foot_${s}`, 'segmento').rotation, [0, 1, 0]);
          expect(Math.acos(Math.min(1, up[1])) / DEG, `pé ${s} rolado em u=${f.u.toFixed(2)}`).toBeLessThan(1);
        }
    }
  }

  it.each(entries.map((e) => [e.id, e] as const))('%s: molde gera clipe válido; DOFs na amplitude, restrições fechadas, sem NaN', (_, entry) => {
    expectValidClip(MotionClip.parse(expandEntry(entry)));
  });

  const variations = LabVariationFile.parse(variationsJson);
  it('variações do Lab: exercício existe, uma opção base sem remendo, ids únicos', () => {
    const keys = new Set<string>();
    for (const v of variations) {
      expect(lib.map((e) => e.id), v.exercise).toContain(v.exercise);
      const k = `${v.exercise}/${v.id}`;
      expect(keys.has(k), k).toBe(false);
      keys.add(k);
      const base = v.options.filter((o) => o.base);
      expect(base, k).toHaveLength(1);
      expect(base[0]?.patches, k).toEqual([]);
      expect(new Set(v.options.map((o) => o.id)).size, k).toBe(v.options.length);
    }
  });

  it.each(variations.flatMap((v) => v.options.filter((o) => !o.base).map((o) => [`${v.exercise} ${v.id}=${o.id}`, v, o] as const)))('variação %s: clipe válido', (_, v, o) => {
    const entry = entries.find((e) => e.id === v.exercise);
    if (!entry) throw new Error(v.exercise);
    const patched = applyPatches(entry, o.patches);
    expect(JSON.stringify(patched)).not.toBe(JSON.stringify(entry));
    expectValidClip(MotionClip.parse(expandEntry(patched)));
  });
});
