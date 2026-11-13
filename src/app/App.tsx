import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Route, Router, Switch, useLocation, type AroundNavHandler } from 'wouter';
import Abertura from '@/features/abertura/Abertura';
import { t } from '@/i18n';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFound } from './NotFound';
import { Shell } from './Shell';

// Rotas além da abertura carregam sob demanda.
const Sistema = lazy(() => import('@/features/sistema/Sistema'));
const Lab = lazy(() => import('@/features/lab/Lab'));
const AtlasIndex = lazy(() => import('@/features/atlas/AtlasIndex'));
const MusclePage = lazy(() => import('@/features/atlas/MusclePage'));
const Library = lazy(() => import('@/features/library/Library'));
const ExercisePage = lazy(() => import('@/features/library/ExercisePage'));
const Treino = lazy(() => import('@/features/treino/Treino'));
const Plano = lazy(() => import('@/features/plano/Plano'));
const Historico = lazy(() => import('@/features/treino/Historico'));
const Progresso = lazy(() => import('@/features/treino/Progresso'));
const Dados = lazy(() => import('@/features/treino/Dados'));
/** Só em desenvolvimento: no build de produção a condição é falsa e o chunk nem existe. */
const DevBody = import.meta.env.DEV ? lazy(() => import('@/features/dev/DevBody')) : null;
const DevClips = import.meta.env.DEV ? lazy(() => import('@/features/dev/DevClips')) : null;

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Troca de rota: volta ao topo, põe o título da aba a partir do h1 da página e, depois da
 * primeira carga, leva o foco ao h1 (leitor de tela anuncia a página nova).
 */
function RouteChange() {
  const [loc] = useLocation();
  const first = useRef(true);
  useEffect(() => {
    window.scrollTo(0, 0);
    const moveFocus = !first.current;
    first.current = false;
    let raf = 0;
    let tries = 0;
    const apply = () => {
      // Rota lazy: o h1 aparece quando o chunk chega. Enquanto isso o Suspense pode manter
      // a página anterior no DOM, escondida com display: none; só vale h1 visível.
      const h1 = [...document.querySelectorAll<HTMLElement>('main h1')].find((el) => el.offsetParent !== null);
      if (!h1) {
        if (tries++ < 240) raf = requestAnimationFrame(apply);
        return;
      }
      const name = h1.textContent?.trim();
      document.title = loc === '/' || !name ? t.meta.name : `${name} — ${t.meta.name}`;
      if (moveFocus) {
        h1.tabIndex = -1;
        h1.focus({ preventScroll: true });
      }
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [loc]);
  return null;
}

type VTDocument = Document & { startViewTransition?: (update: () => void) => unknown };
const canTransition = () => typeof document !== 'undefined' && 'startViewTransition' in document;

/**
 * Troca de caminho vira View Transition (motion.css). Mudança só de busca/âncora e redução de movimento: direto.
 * flushSync: a página nova precisa estar no DOM quando o navegador tira a foto do "depois".
 */
const aroundNav: AroundNavHandler = (navigate, to, options) => {
  const doc = document as VTDocument;
  const samePath = to.split(/[?#]/)[0] === window.location.pathname.slice(base.length);
  if (!doc.startViewTransition || samePath || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    navigate(to, options);
    return;
  }
  doc.startViewTransition(() => flushSync(() => navigate(to, options)));
};

/** Primeira carga usa a entrada por CSS; depois dela, as trocas de rota ficam com a View Transition. */
function useTransitionClass() {
  useEffect(() => {
    if (!canTransition()) return;
    const id = setTimeout(() => document.documentElement.classList.add('vt'), 900);
    return () => clearTimeout(id);
  }, []);
}

function RouteBoundary({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  return <ErrorBoundary resetKey={loc}>{children}</ErrorBoundary>;
}

export function App() {
  useTransitionClass();
  return (
    <Router base={base} aroundNav={aroundNav}>
      <RouteChange />
      <Shell>
        <RouteBoundary>
          <Suspense fallback={null}>
            <Switch>
              <Route path="/" component={Abertura} />
              <Route path="/lab/agachamento" component={Lab} />
              <Route path="/lab" component={Lab} />
              <Route path="/atlas" component={AtlasIndex} />
              <Route path="/atlas/:id">{(p) => <MusclePage id={p.id} />}</Route>
              <Route path="/exercicios" component={Library} />
              <Route path="/exercicios/:id">{(p) => <ExercisePage id={p.id} />}</Route>
              <Route path="/treino" component={Treino} />
              <Route path="/treino/plano" component={Plano} />
              <Route path="/treino/historico" component={Historico} />
              <Route path="/treino/progresso" component={Progresso} />
              <Route path="/treino/dados" component={Dados} />
              <Route path="/sistema" component={Sistema} />
              {DevBody && <Route path="/dev/corpo" component={DevBody} />}
              {DevClips && <Route path="/dev/clipes" component={DevClips} />}
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </RouteBoundary>
      </Shell>
    </Router>
  );
}
