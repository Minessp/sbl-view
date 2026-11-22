import { Fragment, type CSSProperties } from 'react';

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

/** Título de página com letras animadas. `data-text` guarda o texto para o título da aba (App.tsx). */
export function Title({ text, as: As = 'h1', className = 'sheet__title page-title', id }: { text: string; as?: 'h1' | 'h2'; className?: string; id?: string }) {
  return (
    <As className={className} id={id} data-text={text}>
      <SplitText text={text} />
    </As>
  );
}
