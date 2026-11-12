import { describe, expect, it } from 'vitest';
import { skeletonDef } from '@/data';
import { at, must } from '../math/arr';
import { angleBetween, distance, DEG, sub, type Vec3 } from '../math/vec';
import { anchorPose, forwardKinematics, jointPosition, pointToWorld } from './fk';
import { bilateral, buildSkeleton, degToAngles } from './skeleton';

const sk = buildSkeleton(skeletonDef);
const seg = (id: string) => must(sk.byId, id, 'segmento');
const close = (a: Vec3, b: Vec3, digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(at(b, i), digits));

describe('buildSkeleton', () => {
  it('espelha segmentos bilaterais e mantém ordem topológica', () => {
    const ids = sk.segments.map((s) => s.id);
    expect(ids).toContain('thigh_l');
    expect(ids).toContain('hand_l');
    for (const s of sk.segments) {
      if (s.parent) expect(ids.indexOf(s.parent)).toBeLessThan(ids.indexOf(s.id));
    }
  });

  it('inverte sinal de rotações em Y/Z no espelho, preserva X', () => {
    const r = seg('thigh_r').dofs;
    const l = seg('thigh_l').dofs;
    expect(at(l, 0).sign).toBe(at(r, 0).sign); // flexão (x)
    expect(at(l, 1).sign).toBe(-at(r, 1).sign); // abdução (z)
    expect(at(l, 2).sign).toBe(-at(r, 2).sign); // rotação (y)
  });

  it('escala com a estatura', () => {
    const tall = buildSkeleton(skeletonDef, 1.9);
    const p = forwardKinematics(tall, {});
    expect(jointPosition(p, 'thigh_r')[1]).toBeCloseTo(0.9275 * (1.9 / 1.75), 9);
  });
});

describe('forwardKinematics', () => {
  it('pose neutra reproduz as origens autoradas', () => {
    const pose = forwardKinematics(sk, {});
    for (const s of sk.segments) close(jointPosition(pose, s.id), must(sk.neutralOrigin, s.id));
  });

  it('preserva comprimento de segmento em qualquer ângulo', () => {
    const pose = forwardKinematics(sk, degToAngles({ hip_flex_r: 70, knee_flex_r: 110, ankle_dorsi_r: 25 }));
    const thigh = distance(jointPosition(pose, 'thigh_r'), jointPosition(pose, 'shank_r'));
    expect(thigh).toBeCloseTo(0.42875, 9);
  });

  it('flexão de joelho positiva leva a perna para trás (−Z)', () => {
    const pose = forwardKinematics(sk, degToAngles({ knee_flex_r: 90 }));
    const ankle = jointPosition(pose, 'foot_r');
    const knee = jointPosition(pose, 'shank_r');
    expect(ankle[2]).toBeLessThan(knee[2] - 0.4);
    expect(ankle[1]).toBeCloseTo(knee[1], 6);
  });

  it('flexão de quadril positiva leva a coxa para frente (+Z)', () => {
    const pose = forwardKinematics(sk, degToAngles({ hip_flex_r: 90 }));
    expect(jointPosition(pose, 'shank_r')[2]).toBeGreaterThan(0.4);
  });

  it('dorsiflexão positiva sobe a ponta do pé', () => {
    const pose = forwardKinematics(sk, degToAngles({ ankle_dorsi_r: 20 }));
    const toe = pointToWorld(pose, 'foot_r', seg('foot_r').tip);
    expect(toe[1]).toBeGreaterThan(0.012 + 0.05);
  });

  it('abdução positiva afasta da linha média nos dois lados', () => {
    const pose = forwardKinematics(sk, degToAngles(bilateral({ hip_abd: 30 })));
    expect(jointPosition(pose, 'shank_r')[0]).toBeLessThan(-0.0875 - 0.15);
    expect(jointPosition(pose, 'shank_l')[0]).toBeGreaterThan(0.0875 + 0.15);
  });

  it('respeita a amplitude articular por padrão', () => {
    const a = forwardKinematics(sk, degToAngles({ knee_flex_r: 400 }));
    const b = forwardKinematics(sk, degToAngles({ knee_flex_r: 155 }));
    close(jointPosition(a, 'foot_r'), jointPosition(b, 'foot_r'));
  });

  it('o ângulo medido entre coxa e perna confere com o comando', () => {
    const pose = forwardKinematics(sk, degToAngles({ knee_flex_r: 63 }));
    const hip = jointPosition(pose, 'thigh_r');
    const knee = jointPosition(pose, 'shank_r');
    const ankle = jointPosition(pose, 'foot_r');
    expect(angleBetween(sub(knee, hip), sub(ankle, knee)) / DEG).toBeCloseTo(63, 6);
  });
});

describe('anchorPose', () => {
  it('mantém o pé plantado enquanto o resto se move', () => {
    const neutral = forwardKinematics(sk, {});
    const footTarget = must(neutral.world, 'foot_r');
    const squat = forwardKinematics(sk, degToAngles(bilateral({ hip_flex: 90, knee_flex: 100, ankle_dorsi: 30 })));
    const anchored = anchorPose(squat, 'foot_r', footTarget);
    close(jointPosition(anchored, 'foot_r'), footTarget.position);
    // Pé esquerdo também plantado: postura simétrica.
    close(jointPosition(anchored, 'foot_l'), must(neutral.world, 'foot_l').position);
    // A pelve desceu.
    expect(jointPosition(anchored, 'pelvis')[1]).toBeLessThan(0.75);
  });
});
