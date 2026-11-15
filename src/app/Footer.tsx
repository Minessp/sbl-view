/**
 * Rodapé (chunk à parte, depois da página). Marca e frase, três colunas de links, aviso, licença e versão. O fio do topo
 * acende quando o rodapé entra na tela; com redução de movimento, já nasce aceso.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { t as tShell } from '@/i18n';
import { t } from '@/i18n/app';
import './footer.css';

const F = t.footer;
const N = tShell.nav;
const built = new Date(`${__BUILD__}T12:00:00`).toLocaleDateString('pt-BR');

export default function Footer({ onSettings }: { onSettings: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setLit(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setLit(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <footer ref={ref} className="site-footer" data-lit={lit}>
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link href="/" className="wordmark" aria-label={tShell.meta.name}>
            <span className="wordmark__sbl">SBL</span>
            <span className="wordmark__view">View</span>
          </Link>
          <p>{tShell.meta.tagline}</p>
        </div>
        <nav className="site-footer__col" aria-labelledby="ft-explore">
          <h2 id="ft-explore">{F.explore}</h2>
          <ul>
            <li>
              <Link href="/atlas">{N.atlas}</Link>
            </li>
            <li>
              <Link href="/exercicios">{N.library}</Link>
            </li>
            <li>
              <Link href="/lab">{N.lab}</Link>
            </li>
            <li>
              <Link href="/treino">{N.training}</Link>
            </li>
          </ul>
        </nav>
        <nav className="site-footer__col" aria-labelledby="ft-project">
          <h2 id="ft-project">{F.project}</h2>
          <ul>
            <li>
              <Link href="/sobre">{F.about}</Link>
            </li>
            <li>
              <Link href="/sobre#evidencia">{F.evidence}</Link>
            </li>
            <li>
              <button type="button" className="site-footer__btn" aria-haspopup="dialog" onClick={onSettings}>
                {F.settings}
              </button>
            </li>
          </ul>
        </nav>
        <nav className="site-footer__col" aria-labelledby="ft-legal">
          <h2 id="ft-legal">{F.legal}</h2>
          <ul>
            <li>
              <Link href="/termos">{F.terms}</Link>
            </li>
            <li>
              <Link href="/privacidade">{F.privacy}</Link>
            </li>
            <li>
              <Link href="/licencas">{F.licenses}</Link>
            </li>
          </ul>
        </nav>
        <div className="site-footer__fine">
          <p className="site-footer__warn">{F.disclaimer}</p>
          <p>{F.license}</p>
          <p className="site-footer__ver">{F.version(built)}</p>
        </div>
      </div>
    </footer>
  );
}
