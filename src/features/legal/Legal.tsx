/**
 * Páginas Sobre, Termos, Privacidade e Licenças (um chunk só). Texto em `i18n/legal.pt-BR.ts`. Âncora na URL
 * (`/sobre#evidencia`): rola até a seção ao montar e quando um link troca só o `#` (o wouter avisa com `pushState`).
 */
import { Fragment, useEffect } from 'react';
import { Link } from 'wouter';
import { legal } from '@/i18n/dict.legal';
import type { LegalBlock, LegalPage } from '@/i18n/legal.pt-BR';
import { t } from '@/i18n/app';
import { TableWrap } from '@/ui/TableWrap';
import { Title } from '@/ui/Title';
import './legal.css';
import { R } from '@/app/routes';

const LEGAL_PATHS: Record<LegalPage, string> = { about: R.about, terms: R.terms, privacy: R.privacy, licenses: R.licenses };

/** `trecho` entre crases vira código (nomes de armazenamento). */
function Inline({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <code key={i}>{p}</code> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

function Block({ b, label }: { b: LegalBlock; label: string }) {
  if (typeof b === 'string')
    return (
      <p>
        <Inline text={b} />
      </p>
    );
  if ('list' in b)
    return (
      <ul className="legal__list">
        {b.list.map((x) => (
          <li key={x}>
            <Inline text={x} />
          </li>
        ))}
      </ul>
    );
  return (
    <TableWrap label={label}>
      <table className="legal__table">
        <thead>
          <tr>
            {b.table.head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.table.rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) =>
                i === 0 ? (
                  <th key={i} scope="row">
                    <Inline text={c} />
                  </th>
                ) : (
                  <td key={i}>
                    <Inline text={c} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/** Rola até a seção do `#` (sem animação: a troca de rota já anima). */
function useHashScroll() {
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    };
    go();
    const events = ['pushState', 'replaceState', 'popstate', 'hashchange'];
    for (const e of events) window.addEventListener(e, go);
    return () => {
      for (const e of events) window.removeEventListener(e, go);
    };
  }, []);
}

export default function Legal({ page }: { page: LegalPage }) {
  const doc = legal.pages[page];
  const F = t.footer;
  useHashScroll();
  const others = (Object.keys(LEGAL_PATHS) as LegalPage[]).filter((p) => p !== page);
  return (
    <main id="conteudo" className="sheet legal">
      <header className="sheet__head legal__head">
        <p className="legal__kicker">{page === 'about' ? F.project : F.legal}</p>
        <Title text={doc.title} />
        <p className="sheet__lead prose">{doc.lead}</p>
      </header>
      <div className="legal__body">
        <nav className="legal__toc" aria-label={F.onThisPage}>
          <ol>
            {doc.sections.map((s, i) => (
              <li key={s.title}>
                <a href={`#${s.id ?? `s${i + 1}`}`}>
                  <span className="legal__n" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="legal__text prose">
          {doc.sections.map((s, i) => (
            <section key={s.title} id={s.id ?? `s${i + 1}`} className="legal__section" aria-labelledby={`${s.id ?? `s${i + 1}`}-h`}>
              <h2 id={`${s.id ?? `s${i + 1}`}-h`}>
                <span className="legal__n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {s.title}
              </h2>
              {s.blocks.map((b, k) => (
                <Block key={k} b={b} label={s.title} />
              ))}
            </section>
          ))}
          <p className="legal__updated">{legal.updated}</p>
          <nav className="legal__others" aria-label={legal.others}>
            <ul>
              {others.map((p) => (
                <li key={p}>
                  <Link href={LEGAL_PATHS[p]}>{legal.pages[p].title}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </main>
  );
}
