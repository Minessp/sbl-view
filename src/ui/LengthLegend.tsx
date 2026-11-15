import { t } from '@/i18n/app';
import './length-legend.css';

/**
 * Legenda da cor do comprimento no corpo: laranja (`--c-glow`) = mais curto que em pé, azul (`--c-stretch`) = mais
 * comprido. Mesma peça no player, na demonstração do Atlas, no Comparar e no "Ao vivo" da página inicial.
 */
export function LengthLegend({ className }: { className?: string }) {
  const L = t.lengthLegend;
  return (
    <p className={className ? `length-legend ${className}` : 'length-legend'} role="note">
      <span className="visually-hidden">{L.label}</span>
      <span className="length-legend__item" data-dir="short">
        <span className="length-legend__swatch" aria-hidden="true" />
        {L.short}
      </span>
      <span className="length-legend__item" data-dir="long">
        <span className="length-legend__swatch" aria-hidden="true" />
        {L.long}
      </span>
    </p>
  );
}
