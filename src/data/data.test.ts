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
import { PENETRATION_LIMIT, penetrations } from '@/engine/motion/collide';
import { add, angleBetween, DEG, dot, normalize, rotate, scale, sub } from '@/engine/math/vec';
import { pointToWorld } from '@/engine/kinematics/fk';
import { readJoints } from '@/engine/kinematics/limits';
import { at, must } from '@/engine/math/arr';
import { expandEntry, motionMasses } from '@/features/library/motion';
import { lengthCurves } from '@/features/library/player/lengths';
import { PlanningFile, TrainingFile } from './schema/planning';
import { E1RM_MAX_REPS } from '@/engine/training/progress';
import { Reference, type Evidence } from './schema/evidence';
import { Exercise as ExerciseSchema, LibraryFile } from './schema/exercise';
import { MovementFile, MuscleFile, MusclePathsFile } from './schema/muscle';
import { resolveMuscleParts } from '@/engine/muscle/resolve';
import { BodyVolumes, SkeletonDef } from './schema/skeleton';
import bodyVolumesJson from './body-volumes.json';
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

  it('todo exercício tem "como fazer" (posição, movimento com u nas duas pontas, erros) e apelidos', () => {
    for (const e of lib) {
      expect(e.how, `${e.id} sem how`).toBeDefined();
      expect(e.how?.setup.length, e.id).toBeGreaterThan(0);
      expect(e.how?.mistakes.length, e.id).toBeGreaterThan(0);
      const us = e.how?.execution.map((s) => s.u) ?? [];
      expect(us, `${e.id}: passo em u = 0`).toContain(0);
      expect(us, `${e.id}: passo em u = 1`).toContain(1);
      expect(e.aliases?.length, `${e.id} sem apelidos`).toBeGreaterThan(0);
    }
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
  }, 30_000);

  // Atravessamento (corpo × peças, chão, barra; mãos × coxas e tronco) em 9 amostras por clipe. Por ora só RELATA: a
  // lista é o trabalho das auditorias de execução; cada lote passa a falhar de verdade ao fechar (`COLLISION_ENFORCED`).
  const COLLISION_ENFORCED = new Set<string>([
    // Barra e halteres.
    'squat', 'front_squat', 'romanian_deadlift', 'hip_thrust', 'stiff_leg_deadlift', 'deadlift', 'preacher_curl',
    'barbell_curl', 'spider_curl', 'reverse_curl', 'skull_crusher', 'wrist_curl', 'reverse_wrist_curl', 'bench_press',
    'incline_bench_press', 'close_grip_bench_press', 'overhead_press', 'barbell_row', 'goblet_squat', 'bulgarian_split_squat',
    'reverse_lunge', 'incline_dumbbell_curl', 'dumbbell_pullover', 'shrug', 'lateral_raise', 'incline_y_raise', 'hammer_curl',
    'overhead_dumbbell_extension', 'dumbbell_bench_press', 'incline_dumbbell_press', 'seated_dumbbell_press', 'chest_supported_row',
    'one_arm_dumbbell_row',
    // Cabos e peso corporal.
    'overhead_triceps_extension', 'triceps_pushdown', 'cable_fly', 'low_to_high_cable_fly', 'cable_pullover',
    'behind_back_cable_lateral_raise', 'cable_external_rotation', 'bayesian_curl', 'lat_pulldown',
    'single_arm_pulldown', 'seated_cable_row', 'face_pull', 'cable_crunch',
    'sissy_squat', 'back_extension', 'reverse_nordic', 'nordic_curl', 'tibialis_raise', 'push_up', 'chest_dip', 'pull_up', 'chin_up',
    'crunch', 'hanging_leg_raise',
    // Máquinas.
    'hack_squat', 'pendulum_squat', 'leg_press', 'leg_extension', 'reclined_leg_extension', 'seated_leg_curl', 'lying_leg_curl',
    'standing_calf_raise', 'seated_calf_raise', 'seated_hip_abduction', 'leaned_hip_abduction', 'seated_hip_adduction',
    'leg_press_calf_raise', 'pec_deck', 'reverse_pec_deck', 'machine_chest_press', 'machine_shoulder_press',
  ]);
  const COLLISION_EXCEPTIONS: Record<string, string> = {
    preacher_curl: 'peito encostado no alto da almofada, como deve; a cápsula do tronco é centrada na coluna e acusa ~12 cm',
  };

  it('atravessamento: nada passa do limite fora dos contatos declarados (relato)', () => {
    expect(() => BodyVolumes.parse(bodyVolumesJson)).not.toThrow();
    const lines: string[] = [];
    const wrong: string[] = [];
    for (const ex of lib) {
      const c = compiled(ex.id);
      const worst = new Map<string, { depth: number; u: number; kind: keyof typeof PENETRATION_LIMIT }>();
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        for (const h of penetrations(evaluateClip(c, u), c)) {
          if (h.depthM <= PENETRATION_LIMIT[h.kind]) continue;
          const k = `${h.a}×${h.b}`;
          if ((worst.get(k)?.depth ?? 0) < h.depthM) worst.set(k, { depth: h.depthM, u, kind: h.kind });
        }
      }
      if (!worst.size) continue;
      const desc = [...worst].sort((a, b) => b[1].depth - a[1].depth).map(([k, v]) => `${k} ${(v.depth * 100).toFixed(1)} cm (u ${v.u})`);
      lines.push(`${ex.id}: ${desc.join('; ')}`);
      if (COLLISION_ENFORCED.has(ex.id) && !(ex.id in COLLISION_EXCEPTIONS)) wrong.push(`${ex.id}: ${desc.join('; ')}`);
    }
    console.log(`[colisão] ${lines.length} de ${lib.length} exercícios com atravessamento\n${lines.join('\n')}`);
    expect(wrong).toEqual([]);
  }, 60_000);

  // Pose plausível em 49 amostras: pé plantado parado no chão, joelho no rumo da ponta do pé, nenhum segmento que
  // "estala" entre amostras vizinhas (salto de ramo do IK) e cabeça alinhada ao tronco. Exceção só com motivo.
  const POSE_EXCEPTIONS: Record<string, string> = {};

  it('pose plausível: pé parado, joelho × ponta do pé, sem estalo, cabeça no tronco', () => {
    const qAngle = (a: readonly number[], b: readonly number[]) =>
      (2 * Math.acos(Math.min(1, Math.abs((a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0) + (a[3] ?? 0) * (b[3] ?? 0))))) / DEG;
    const flat = (v: readonly number[]) => normalize([v[0] ?? 0, 0, v[2] ?? 0]);
    const wrong: string[] = [];
    for (const ex of lib) {
      const c = compiled(ex.id);
      const frames = Array.from({ length: 49 }, (_, i) => evaluateClip(c, i / 48));
      const bad: string[] = [];
      const planted = c.clip.root.mode === 'plant' ? (['r', 'l'] as const).filter((s) => !c.legs.some((r) => r.sides.includes(s))) : [];
      for (const s of ['r', 'l'] as const) {
        const foot = must(sk.byId, `foot_${s}`, 'segmento');
        const tips = frames.map((f) => pointToWorld(f.pose, foot.id, foot.tip));
        if (planted.includes(s)) {
          const t0 = at(tips, 0);
          const slide = Math.max(...tips.map((t) => Math.hypot(t[0] - t0[0], t[2] - t0[2])));
          if (slide > 0.005) bad.push(`pé ${s} desliza ${(slide * 100).toFixed(1)} cm`);
        }
        let knee = 0;
        frames.forEach((f, i) => {
          const tip = at(tips, i);
          const ankle = must(f.pose.world, foot.id, 'segmento').position;
          const kn = must(f.pose.world, `shank_${s}`, 'segmento').position;
          const hip = must(f.pose.world, `thigh_${s}`, 'segmento').position;
          if (Math.min(tip[1], ankle[1]) > 0.12 || kn[1] < ankle[1] + 0.2 || (f.deg[`knee_flex_${s}`] ?? 0) < 30) return;
          const ha = sub(ankle, hip);
          const k = dot(sub(kn, hip), ha) / dot(ha, ha);
          knee = Math.max(knee, angleBetween(flat(sub(kn, add(hip, scale(ha, k)))), flat(sub(tip, ankle))) / DEG);
        });
        if (knee > 20) bad.push(`joelho ${s} fora da ponta do pé ${knee.toFixed(0)}°`);
      }
      for (const seg of sk.segments) {
        const steps = frames.slice(1).map((f, i) => qAngle(at(frames, i).pose.world.get(seg.id)?.rotation ?? [], f.pose.world.get(seg.id)?.rotation ?? []));
        const med = [...steps].sort((a, b) => a - b)[24] ?? 0;
        const i = steps.reduce((b, x, j) => (x > (steps[b] ?? 0) ? j : b), 0);
        const step = steps[i] ?? 0;
        if (step > Math.max(2 * med, 3) + 4) bad.push(`${seg.id} estala ${step.toFixed(0)}° em u ${(i / 48).toFixed(2)}`);
      }
      const head = Math.max(...frames.map((f) => angleBetween(rotate(must(f.pose.world, 'head', 'segmento').rotation, [0, 1, 0]), rotate(must(f.pose.world, 'trunk', 'segmento').rotation, [0, 1, 0])) / DEG));
      if (head > 60) bad.push(`cabeça ${head.toFixed(0)}° fora do tronco`);
      const known = ex.id in POSE_EXCEPTIONS;
      if (bad.length && !known) wrong.push(`${ex.id}: ${bad.join('; ')}`);
      if (!bad.length && known) wrong.push(`${ex.id} saiu da lista de exceções`);
    }
    expect(wrong).toEqual([]);
  }, 60_000);

  // Barra nas duas mãos: o eixo da palma (polegar → mínimo) corre ao longo da barra. Onde a pronação sozinha não basta
  // (punho ou rotação do ombro teriam de mudar junto), o exercício fica na lista com o motivo.
  const GRIP_EXCEPTIONS: Record<string, string> = {
    chin_up: 'no alto da barra a supinação completa ainda deixa o punho desviado',
    reverse_wrist_curl: 'antebraços em diagonal sobre as coxas: nem a pronação no limite (160°) alinha a palma com a barra',
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
