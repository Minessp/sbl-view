import { lazy, Suspense, useEffect } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import Abertura from '@/features/abertura/Abertura';
import { Shell } from './Shell';

// Rotas além da abertura carregam sob demanda.
const Sistema = lazy(() => import('@/features/sistema/Sistema'));
const Lab = lazy(() => import('@/features/lab/Lab'));
const AtlasIndex = lazy(() => import('@/features/atlas/AtlasIndex'));
const MusclePage = lazy(() => import('@/features/atlas/MusclePage'));
const Library = lazy(() => import('@/features/library/Library'));
const ExercisePage = lazy(() => import('@/features/library/ExercisePage'));
const Treino = lazy(() => import('@/features/treino/Treino'));
const Historico = lazy(() => import('@/features/treino/Historico'));
const Progresso = lazy(() => import('@/features/treino/Progresso'));
const Dados = lazy(() => import('@/features/treino/Dados'));

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
            <Route path="/lab/agachamento" component={Lab} />
            <Route path="/lab" component={Lab} />
            <Route path="/atlas" component={AtlasIndex} />
            <Route path="/atlas/:id">{(p) => <MusclePage id={p.id} />}</Route>
            <Route path="/exercicios" component={Library} />
            <Route path="/exercicios/:id">{(p) => <ExercisePage id={p.id} />}</Route>
            <Route path="/treino" component={Treino} />
            <Route path="/treino/historico" component={Historico} />
            <Route path="/treino/progresso" component={Progresso} />
            <Route path="/treino/dados" component={Dados} />
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
