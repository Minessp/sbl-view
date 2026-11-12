/**
 * Alternativa sem WebGL: o mesmo esqueleto do motor, projetado em vista frontal, em SVG.
 * Também serve de alternativa textual (role="img" + descrição).
 */
import { useMemo } from 'react';
import { skeletonDef } from '@/data';
import { forwardKinematics, jointPosition, pointToWorld } from '@/engine/kinematics/fk';
import { bilateral, buildSkeleton, degToAngles } from '@/engine/kinematics/skeleton';
import { t } from '@/i18n';

export function SkeletonFallback() {
  const lines = useMemo(() => {
    const sk = buildSkeleton(skeletonDef);
    const pose = forwardKinematics(sk, degToAngles(bilateral({ shoulder_abd: 14 })));
    return sk.segments.map((s) => {
      const a = jointPosition(pose, s.id);
      const b = pointToWorld(pose, s.id, s.tip);
      return { id: s.id, x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
    });
  }, []);

  return (
    <figure className="fallback">
      <h2 className="fallback__title">{t.fallback.title}</h2>
      <p className="fallback__body">{t.fallback.body}</p>
      <svg viewBox="-0.5 -1.8 1 1.85" role="img" aria-label={t.fallback.figure} className="fallback__svg">
        <g transform="scale(1,-1)">
          <line x1={-0.45} x2={0.45} y1={0} y2={0} className="fallback__floor" />
          {lines.map((l) => (
            <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="fallback__seg" />
          ))}
          {lines.map((l) => (
            <circle key={`${l.id}-j`} cx={l.x1} cy={l.y1} r={0.012} className="fallback__joint" />
          ))}
        </g>
      </svg>
    </figure>
  );
}
