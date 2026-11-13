import { Component, type ReactNode } from 'react';
import { t } from '@/i18n';

const RELOAD_KEY = 'sbl-chunk-reload';

/** Chunk que sumiu do servidor (deploy novo com a aba aberta) ou falta de rede. */
function isChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i.test(msg);
}

type Props = { children: ReactNode; resetKey: string };
type State = { error: unknown; key: string };

/**
 * Fronteira de erro das rotas. Chunk velho: recarrega uma vez sozinho (a versão nova
 * do index.html traz os nomes certos). Se falhar de novo, mostra a mensagem com botão.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Trocar de rota limpa o erro.
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  override componentDidCatch(error: unknown) {
    if (!isChunkError(error)) {
      console.error(error);
      return;
    }
    try {
      if (sessionStorage.getItem(RELOAD_KEY) !== location.pathname) {
        sessionStorage.setItem(RELOAD_KEY, location.pathname);
        location.reload();
      }
    } catch {
      /* sem sessionStorage: fica a mensagem */
    }
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <main id="conteudo" className="page page--message">
        <h1>{t.page.error}</h1>
        <p className="page__lead">{t.page.errorLead}</p>
        <button type="button" className="page__action" onClick={() => location.reload()}>
          {t.page.reload}
        </button>
      </main>
    );
  }
}
