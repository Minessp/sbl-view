/**
 * Selo de evidência. A forma codifica o grau (não a cor):
 * cheio = estabelecido, metade = provável, vazio = especulativo; tracejado = hipótese.
 */
import type { Confidence } from '@/data/schema/evidence';
import { t } from '@/i18n';
import './evidence-seal.css';

interface Props {
  confidence: Confidence;
  hypothesis?: boolean;
  unverified?: boolean;
  /** Esconde o texto (mantém para leitor de tela). */
  compact?: boolean;
}

function Mark({ confidence, hypothesis }: { confidence: Confidence; hypothesis: boolean }) {
  const dash = hypothesis ? '2 1.6' : undefined;
  return (
    <svg className="seal__mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray={dash} />
      {confidence === 'estabelecido' && <circle cx="6" cy="6" r="3.2" fill="currentColor" />}
      {confidence === 'provavel' && <path d="M6 2.8 A3.2 3.2 0 0 0 6 9.2 Z" fill="currentColor" />}
    </svg>
  );
}

export function EvidenceSeal({ confidence, hypothesis = false, unverified = false, compact = false }: Props) {
  const label = [hypothesis ? t.evidence.hypothesis : null, t.evidence[confidence], unverified ? t.evidence.unverified : null]
    .filter(Boolean)
    .join(', ');
  return (
    <span className="seal" data-confidence={confidence} data-hypothesis={hypothesis} title={t.evidence.describe[confidence]}>
      <Mark confidence={confidence} hypothesis={hypothesis} />
      <span className={compact ? 'visually-hidden' : 'seal__text'}>{label}</span>
    </span>
  );
}
