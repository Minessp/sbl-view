import { describe, expect, it } from 'vitest';
import { pointToWorld } from '@/engine/kinematics/fk';
import { at } from '@/engine/math/arr';
import { cross, dot, rotate, sub } from '@/engine/math/vec';
import { evaluateClip } from '@/engine/motion/evaluate';
import { loadAttachment, loadMoment } from '@/engine/motion/resistance';
import { analyze, comparableTargets, compiledFor, exercisesTargeting, specKey, specLabel, variations } from './analysis';

const peakU = (v: readonly number[]) => v.indexOf(Math.max(...v)) / (v.length - 1);

describe('braço da carga (trabalho virtual)', () => {
  it('rosca em pé: peso na mão, momento no cotovelo = distância horizontal da pegada ao cotovelo', () => {
    const c = compiledFor({ exercise: 'barbell_curl', options: {} });
    const a = loadAttachment(c);
    for (const u of [0, 0.3, 0.6, 1]) {
      const f = evaluateClip(c, u);
      const p = pointToWorld(f.pose, a.segment, a.local);
      const elbow = pointToWorld(f.pose, 'forearm_r', [0, 0, 0]);
      expect(Math.abs(loadMoment(c, f, 'elbow_flex_r'))).toBeCloseTo(Math.abs(p[2] - elbow[2]), 2);
    }
  });

  it('barra fixa: carga no tronco, a mão fica parada e o corpo gira em torno do cotovelo', () => {
    const c = compiledFor({ exercise: 'pull_up', options: {} });
    const a = loadAttachment(c);
    expect(a.segment).toBe('trunk');
    const f = evaluateClip(c, 0.5);
    const p = pointToWorld(f.pose, a.segment, a.local);
    const elbow = pointToWorld(f.pose, 'forearm_r', [0, 0, 0]);
    // Eixo do cotovelo no mundo (frame do braço): com o braço acima da cabeça ele não é mais o X do mundo.
    const dof = c.sk.byId.get('forearm_r')?.dofs.find((d) => d.id === 'elbow_flex_r');
    const upper = f.pose.world.get('upperarm_r');
    if (!dof || !upper || !f.load) throw new Error('cotovelo');
    const axis = rotate(upper.rotation, dof.axis);
    expect(Math.abs(loadMoment(c, f, 'elbow_flex_r'))).toBeCloseTo(Math.abs(dot(cross(sub(p, elbow), f.load.dir), axis)), 3);
  });
});

describe('comparação', () => {
  it('alvos comparáveis têm dois exercícios ou mais', () => {
    const t = comparableTargets();
    expect(t).toContain('biceps_brachii');
    for (const m of t) expect(exercisesTargeting(m).length).toBeGreaterThanOrEqual(2);
  });

  it('rosca inclinada com halter: pico da carga perto de 90° de cotovelo; bayesiana: no alongado', () => {
    const inc = analyze({ exercise: 'incline_dumbbell_curl', options: {} }, 'biceps_brachii');
    const bay = analyze({ exercise: 'bayesian_curl', options: {} }, 'biceps_brachii');
    expect(inc?.dof).toBe('elbow_flex_r');
    expect(inc?.motion).toBe('Flexão do cotovelo');
    if (!inc || !bay) throw new Error('sem análise');
    const iPeak = inc.load.indexOf(Math.max(...inc.load));
    expect(at(inc.angle, iPeak)).toBeGreaterThan(70);
    expect(at(inc.angle, iPeak)).toBeLessThan(110);
    expect(peakU(bay.load)).toBeLessThan(0.2);
    expect(bay.loadAtLongest).toBeGreaterThan(0.9);
    // u = 0 é a ponta alongada.
    expect(at(inc.length, 0)).toBeGreaterThan(at(inc.length, inc.length.length - 1));
  });

  it('polia mais alta na bayesiana leva o pico da carga mais para o alongado', () => {
    const low = analyze({ exercise: 'bayesian_curl', options: { pulley: 'low' } }, 'biceps_brachii');
    const high = analyze({ exercise: 'bayesian_curl', options: { pulley: 'high' } }, 'biceps_brachii');
    if (!low || !high) throw new Error('sem análise');
    expect(peakU(high.load)).toBeLessThan(peakU(low.load));
  });

  it('pegada aberta no supino alonga mais o peitoral que a fechada', () => {
    const close = analyze({ exercise: 'bench_press', options: { grip: 'close' } }, 'pectoralis_major');
    const wide = analyze({ exercise: 'bench_press', options: { grip: 'wide' } }, 'pectoralis_major');
    if (!close || !wide) throw new Error('sem análise');
    expect(Math.max(...wide.length)).toBeGreaterThan(Math.max(...close.length) + 3);
  });

  it('opção base não entra na chave nem no nome', () => {
    for (const v of variations) {
      const base = v.options.find((o) => o.base);
      if (!base) continue;
      expect(specKey({ exercise: v.exercise, options: { [v.id]: base.id } })).toBe(v.exercise);
      const other = v.options.find((o) => !o.base);
      if (other) expect(specLabel({ exercise: v.exercise, options: { [v.id]: other.id } })).toContain(other.label);
    }
  });

  it('análise determinística e sem NaN em todo par exercício × alvo', () => {
    for (const m of comparableTargets())
      for (const e of exercisesTargeting(m)) {
        const a = analyze({ exercise: e.id, options: {} }, m);
        if (!a) continue;
        for (const s of [a.length, a.angle, a.arm, a.load, a.profile]) for (const v of s) expect(Number.isFinite(v), `${e.id}/${m}`).toBe(true);
      }
  }, 60_000);
});
