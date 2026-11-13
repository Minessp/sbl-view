import { t } from '@/i18n';
import { useBody, type BodyKind } from './store';

const KINDS: BodyKind[] = ['esquematico', 'anatomico'];

/** Troca o modelo de corpo do palco (vale para Atlas e mapa de calor). */
export function ModelSwitch({ missing }: { missing?: string | undefined }) {
  const B = t.body;
  const kind = useBody((s) => s.kind);
  const status = useBody((s) => s.status);
  const setKind = useBody((s) => s.setKind);
  const note = kind !== 'anatomico' ? '' : missing ? missing : status === 'loading' ? B.loading : status === 'error' ? B.error : '';
  return (
    <div className="model-switch">
      <span className="model-switch__label">{B.label}</span>
      <span className="model-switch__options" role="group" aria-label={B.label}>
        {KINDS.map((k) => (
          <button key={k} type="button" className="chip chip--small" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {B.kinds[k]}
          </button>
        ))}
      </span>
      <p className="model-switch__note" role="status">
        {note}
      </p>
    </div>
  );
}
