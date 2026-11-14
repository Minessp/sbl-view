/**
 * Estados de página: vazio (ensina o próximo passo), erro (diz o que houve e o que fazer) e carregando (esqueleto no
 * formato do conteúdo). Mesma linguagem do estúdio: o filamento apagado é "nada aqui ainda", o aceso em tungstênio é
 * "atenção". Fora da shell (só páginas importam).
 */
import type { ReactNode } from 'react';
import './states.css';

export function EmptyState({ title, children, actions, tone = 'empty' }: { title: string; children?: ReactNode; actions?: ReactNode; tone?: 'empty' | 'error' }) {
  return (
    <div className="state" data-tone={tone} role={tone === 'error' ? 'alert' : undefined}>
      <span className="state__lamp" aria-hidden="true" />
      <p className="state__title">{title}</p>
      {children && <div className="state__body">{children}</div>}
      {actions && <div className="state__actions">{actions}</div>}
    </div>
  );
}

/** Esqueleto: `lines` barras com larguras variadas; o leitor de tela ouve só o rótulo. */
export function Loading({ label, lines = 3, block = false }: { label: string; lines?: number; block?: boolean }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {block && <span className="skeleton__block" aria-hidden="true" />}
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton__line" aria-hidden="true" style={{ width: `${[72, 94, 58, 86, 64][i % 5]}%` }} />
      ))}
    </div>
  );
}
