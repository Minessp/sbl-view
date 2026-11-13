import { useSyncExternalStore } from 'react';
import { t } from '@/i18n';
import { applyUpdate, dismissUpdate, updateStore } from './register';

/** Faixa fixa no rodapé quando há versão nova pronta. Não recarrega sozinho: pode haver formulário pela metade. */
export function UpdateNotice() {
  const ready = useSyncExternalStore(updateStore.subscribe, updateStore.ready, () => false);
  if (!ready) return null;
  return (
    <div className="update-notice" role="status">
      <span>{t.pwa.update}</span>
      <button type="button" className="update-notice__go" onClick={applyUpdate}>
        {t.pwa.reload}
      </button>
      <button type="button" className="update-notice__later" onClick={dismissUpdate}>
        {t.pwa.dismiss}
      </button>
    </div>
  );
}
