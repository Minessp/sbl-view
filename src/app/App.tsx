import { lazy, Suspense, useEffect } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import Abertura from '@/features/abertura/Abertura';
import { Shell } from './Shell';

// Rotas além da abertura carregam sob demanda.
const Sistema = lazy(() => import('@/features/sistema/Sistema'));

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

function ScrollToTop() {
  const [loc] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc]);
  return null;
}

export function App() {
  return (
    <Router base={base}>
      <ScrollToTop />
      <Shell>
        <Suspense fallback={null}>
          <Switch>
            <Route path="/" component={Abertura} />
            <Route path="/sistema" component={Sistema} />
            <Route>
              <main id="conteudo" className="page">
                <h1>Página não encontrada</h1>
              </main>
            </Route>
          </Switch>
        </Suspense>
      </Shell>
    </Router>
  );
}
