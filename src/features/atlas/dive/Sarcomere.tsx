/**
 * Nível "Sarcômero" do mergulho: ilustração em SVG (linhas Z, filamentos finos presos a elas, filamentos grossos no
 * meio). A única variável é a que o site já calcula: comprimento do músculo em relação a em pé, na demonstração da
 * primeira ação. O desenho estica o sarcômero na mesma razão; a faixa acesa é a sobreposição. Nenhuma medida em µm.
 */
import { useEffect } from 'react';
import { fmt, t } from '@/i18n/app';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { relLength, type ActionCurve } from '../model';
import { DemoControls, useDemoMarker } from '../explorer/ActionDemo';
import { useAtlas } from '../store';

/** Geometria do desenho (unidades do viewBox): metade do sarcômero em pé, filamento fino, metade do grosso. */
const HALF = 220, THIN = 170, THICK = 80, CX = 300;
const ROWS = [52, 86, 120, 154, 188];

function Drawing({ rel }: { rel: number }) {
  const D = t.atlas.dive;
  const half = HALF * Math.min(1.35, Math.max(0.65, rel));
  const zl = CX - half, zr = CX + half;
  const tl = zl + THIN, tr = zr - THIN;
  // Sobreposição de cada lado: onde o fino entra no grosso.
  const ol = [CX - THICK, Math.min(tl, CX + THICK)] as const;
  const or = [Math.max(tr, CX - THICK), CX + THICK] as const;
  return (
    <svg className="sarcomere" viewBox="0 0 600 250" role="img" aria-label={D.sarcomereFig}>
      {ol[1] > ol[0] && <rect className="sarcomere__overlap" x={ol[0]} y={36} width={ol[1] - ol[0]} height={168} />}
      {or[1] > or[0] && <rect className="sarcomere__overlap" x={or[0]} y={36} width={or[1] - or[0]} height={168} />}
      {ROWS.map((y) => (
        <g key={y}>
          <rect className="sarcomere__thick" x={CX - THICK} y={y - 4} width={THICK * 2} height={8} rx={4} />
          {Array.from({ length: 13 }, (_, k) => CX - THICK + 8 + k * 12).filter((x) => Math.abs(x - CX) > 12).map((x) => (
            <line key={x} className="sarcomere__head" x1={x} y1={y - 4} x2={x + (x < CX ? -4 : 4)} y2={y - 9} />
          ))}
          {[y - 17, y + 17].filter((yy) => yy > 30 && yy < 210).map((yy) => (
            <g key={yy}>
              <line className="sarcomere__thin" x1={zl} y1={yy} x2={tl} y2={yy} />
              <line className="sarcomere__thin" x1={zr} y1={yy} x2={tr} y2={yy} />
            </g>
          ))}
        </g>
      ))}
      <polyline className="sarcomere__z" points={`${zl},30 ${zl - 6},70 ${zl + 6},110 ${zl - 6},150 ${zl + 6},190 ${zl},210`} />
      <polyline className="sarcomere__z" points={`${zr},30 ${zr + 6},70 ${zr - 6},110 ${zr + 6},150 ${zr - 6},190 ${zr},210`} />
      <line className="sarcomere__m" x1={CX} y1={36} x2={CX} y2={204} />
      <g className="sarcomere__labels" aria-hidden="true">
        <text x={zl} y={230} textAnchor="middle">
          {D.zLine}
        </text>
        <text x={CX} y={24} textAnchor="middle">
          {D.thick}
        </text>
        <text x={Math.max(zl + 4, 8)} y={246}>
          {D.thin}
        </text>
        <text x={zr} y={230} textAnchor="middle">
          {D.zLine}
        </text>
      </g>
    </svg>
  );
}

export function Sarcomere({ curve }: { curve: ActionCurve | undefined }) {
  const D = t.atlas.dive;
  // A demonstração da primeira ação dá o ângulo; o controle dela move a sobreposição.
  useEffect(() => {
    if (!curve || useAtlas.getState().demo.spec?.key === curve.key) return;
    useAtlas.getState().startDemo({ dof: curve.dof, range: curve.range, from: curve.from, to: curve.to, base: curve.base, plane: curve.movement.plane, key: curve.key });
  }, [curve]);
  return curve ? <WithCurve c={curve} /> : <Body rel={1} note={D.noCurve} />;
}

function WithCurve({ c }: { c: ActionCurve }) {
  const f = useDemoMarker(c);
  return (
    <Body rel={relLength(c, f)}>
      <DemoControls c={c} />
    </Body>
  );
}

function Body({ rel, note, children }: { rel: number; note?: string; children?: React.ReactNode }) {
  const D = t.atlas.dive;
  const pct = Math.round((rel - 1) * 100);
  return (
    <div className="dive-sarcomere">
      <Drawing rel={rel} />
      <p className="dive-sarcomere__rel">
        {D.rel}: <strong>{`${pct > 0 ? '+' : pct < 0 ? '−' : ''}${fmt.n0(Math.abs(pct))}%`}</strong>
      </p>
      <p className="dive__note">{D.sarcomereNote}</p>
      <EvidenceSeal confidence="especulativo" />
      {note && <p className="dive__note">{note}</p>}
      {children}
    </div>
  );
}
