import { Fragment, type CSSProperties, type MouseEvent } from 'react';

/**
 * Texto com letras animadas (motion.css → `.split`). O leitor de tela lê o texto inteiro (oculto visualmente); as letras
 * são decoração. Trocar o texto remonta as letras e a entrada toca de novo. Atraso inicial: `--d` num ancestral (lista
 * de títulos em cascata).
 */
export function SplitText({ text }: { text: string }) {
  const words = text.split(' ');
  const starts = words.reduce<number[]>((acc, _w, k) => [...acc, k === 0 ? 0 : (acc[k - 1] ?? 0) + [...(words[k - 1] ?? '')].length], []);
  return (
    <>
      <span className="visually-hidden">{text}</span>
      <span key={text} className="split" aria-hidden="true">
        {words.map((w, k) => (
          <Fragment key={k}>
            {k > 0 && ' '}
            <span className="split__word">
              {[...w].map((c, j) => (
                <span key={j} className="split__char" style={{ '--i': (starts[k] ?? 0) + j } as CSSProperties}>
                  {c}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </>
  );
}

/**
 * Título de página com letras animadas. `data-text` guarda o texto para o título da aba (App.tsx). Por padrão leva
 * `page-title`: viaja entre rotas na View Transition.
 */
export function Title({ text, as: As = 'h1', className = 'sheet__title page-title', id }: { text: string; as?: 'h1' | 'h2'; className?: string; id?: string }) {
  return (
    <As className={className} id={id} data-text={text}>
      <SplitText text={text} />
    </As>
  );
}

/**
 * Link de entrada cujo nome vira o título da página nova na View Transition (motion.css → page-title): a palavra viaja
 * da lista até o h1. Só o elemento clicado leva o nome (tem de ser único na foto). O nome é o filho com `data-title`.
 */
export function claimTitle(e: MouseEvent<HTMLElement>) {
  const name = e.currentTarget.querySelector<HTMLElement>('[data-title]');
  if (name) name.style.viewTransitionName = 'page-title';
}
