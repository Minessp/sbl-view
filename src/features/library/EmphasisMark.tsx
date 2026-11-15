import type { LengthEmphasis } from '@/data/schema/exercise';
import './emphasis-mark.css';

/**
 * Régua de comprimento: curto à esquerda, longo à direita; o traço grosso marca onde a carga pega.
 * A forma carrega a informação (não a cor).
 */
export function EmphasisMark({ emphasis }: { emphasis: LengthEmphasis }) {
  const x = emphasis === 'encurtado' ? 4 : emphasis === 'intermediario' ? 15 : 26;
  return (
    <svg className="emph" viewBox="0 0 30 10" width="30" height="10" aria-hidden="true" data-emphasis={emphasis}>
      <line x1="1" y1="5" x2="29" y2="5" className="emph__rule" />
      <line x1="1" y1="2" x2="1" y2="8" className="emph__rule" />
      <line x1="29" y1="2" x2="29" y2="8" className="emph__rule" />
      <rect x={x - 3} y="2.5" width="6" height="5" rx="2.5" className="emph__mark" />
    </svg>
  );
}
