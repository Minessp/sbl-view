import { lazy, Suspense, useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Redirect, Route, Router, Switch, useLocation, useSearch, type AroundNavHandler } from 'wouter';
import Home from '@/features/home/Home';
import { t } from '@/i18n';
import { PREFIX } from '@/i18n/locale';
import { useHandoff } from '@/scene/director/handoff';
import { useStage } from '@/scene/stageStore';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFound } from './NotFound';
import { exerciseHref, muscleHref, R, unslug } from './routes';
import { Shell } from './Shell';

// Rotas além da página inicial carregam sob demanda. O carregador fica à parte: a troca de rota espera o chunk (abaixo).
const load = {
  lab: () => import('@/features/lab/Lab'),
  compare: () => import('@/features/lab/compare/Compare'),
  atlas: () => import('@/features/atlas/AtlasIndex'),
  muscle: () => import('@/features/atlas/MusclePage'),
  library: () => import('@/features/library/Library'),
  exercise: () => import('@/features/library/ExercisePage'),
  treino: () => import('@/features/treino/Treino'),
  plano: () => import('@/features/plano/Plano'),
  historico: () => import('@/features/treino/Historico'),
  progresso: () => import('@/features/treino/Progresso'),
  dados: () => import('@/features/treino/Dados'),
  analise: () => import('@/features/treino/Analise'),
  legal: () => import('@/features/legal/Legal'),
};
const Lab = lazy(load.lab);
const Compare = lazy(load.compare);
const AtlasIndex = lazy(load.atlas);
const MusclePage = lazy(load.muscle);
const Library = lazy(load.library);
const ExercisePage = lazy(load.exercise);
const Treino = lazy(load.treino);
const Plano = lazy(load.plano);
const Historico = lazy(load.historico);
const Progresso = lazy(load.progresso);
const Dados = lazy(load.dados);
const Analise = lazy(load.analise);
const Legal = lazy(load.legal);

/** Rota → chunk. Termina em `/` = prefixo (página com id); senão, caminho exato. A mais específica vem antes. */
const CHUNKS: readonly (readonly [string, () => Promise<unknown>])[] = [
  [R.labCompare, load.compare],
  [R.labSquat, load.lab],
  [R.lab, load.lab],
  [`${R.atlas}/`, load.muscle],
  [R.atlas, load.atlas],
  [`${R.library}/`, load.exercise],
  [R.library, load.library],
  [R.plan, load.plano],
  [R.history, load.historico],
  [R.progress, load.progresso],
  [R.analysis, load.analise],
  [R.data, load.dados],
  [R.training, load.treino],
  [R.about, load.legal],
  [R.terms, load.legal],
  [R.privacy, load.legal],
  [R.licenses, load.legal],
];

/** Chunk da rota (caminho sem a base). Página inicial e desconhecidas: nada a carregar. */
function routeChunk(path: string): (() => Promise<unknown>) | null {
  const p = path.split(/[?#]/)[0] ?? '';
  return CHUNKS.find(([r]) => (r.endsWith('/') ? p.startsWith(r) && p.length > r.length : p === r))?.[1] ?? null;
}

/** Pede o chunk da rota de um link na intenção (ponteiro em cima, foco). Delegado: vale para todo link interno. */
function usePrefetchOnIntent() {
  useEffect(() => {
    const seen = new Set<string>();
    const on = (e: Event) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      const href = a?.getAttribute('href');
      if (!href || !href.startsWith('/') || seen.has(href)) return;
      seen.add(href);
      void routeChunk(href.slice(base.length))?.().catch(() => undefined);
    };
    document.addEventListener('pointerover', on, { passive: true });
    document.addEventListener('focusin', on);
    return () => {
      document.removeEventListener('pointerover', on);
      document.removeEventListener('focusin', on);
    };
  }, []);
}
/** Só em desenvolvimento: no build de produção a condição é falsa e o chunk nem existe. */
const DevBody = import.meta.env.DEV ? lazy(() => import('@/features/dev/DevBody')) : null;
const DevClips = import.meta.env.DEV ? lazy(() => import('@/features/dev/DevClips')) : null;

/** Base do roteador: a do site mais o prefixo do idioma (`/en`). */
const base = import.meta.env.BASE_URL.replace(/\/$/, '') + PREFIX;

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
      const name = (h1.dataset.text ?? h1.textContent)?.trim();
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

type VTDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> } };

/**
 * Espera a página nova montar (h1 visível) e o palco dela ficar pronto antes da foto do "depois", até 600 ms. O lazy do
 * React suspende uma vez mesmo com o chunk já baixado. Durante a espera a tela fica na foto do "antes"; setTimeout porque
 * o quadro está pausado.
 */
function pageReady(): Promise<void> {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const h1 = [...document.querySelectorAll<HTMLElement>('main h1')].find((el) => el.offsetParent !== null);
      const st = useStage.getState();
      const stage = st.scene === 'none' || st.ready || st.failed;
      if ((h1 && stage) || performance.now() - t0 > 600) resolve();
      else setTimeout(check, 16);
    };
    check();
  });
}

/** O corpo deixa o plano de saída (recorte, câmera, pose); a cena da página nova voa a partir dele (scene/director). */
function leaveShot() {
  const s = useStage.getState().capture?.();
  if (s) useHandoff.getState().leave(s);
}
const canTransition = () => typeof document !== 'undefined' && 'startViewTransition' in document;

/** Fim da cascata dos blocos da página nova (motion.css → `cut-rise`): a classe sai depois dela. */
const CUT_IN_MS = 1500;
let cutTimer = 0;
/** Conta as trocas pedidas: a que esperava o chunk não pousa depois de uma mais nova. */
let navSeq = 0;

/**
 * Troca de caminho = corte (motion.css): o palco fica fora da foto (`view-transition-name: stage`) e segue desenhando
 * enquanto o corpo voa do plano de saída até o da página nova; a página que sai desce e perde o foco, um risco de luz
 * cruza o quadro, a nova chega em foco e os blocos sobem em cascata. Redução de movimento: fusão de 150 ms, sem voo.
 * Mudança só de busca/âncora: direto. flushSync: a página nova precisa estar no DOM quando o navegador tira a foto do
 * "depois"; por isso a troca espera o chunk da rota (até 1,2 s) e o palco da página nova (até 600 ms).
 */
const aroundNav: AroundNavHandler = (navigate, to, options) => {
  const doc = document as VTDocument;
  const samePath = to.split(/[?#]/)[0] === window.location.pathname.slice(base.length);
  const seq = ++navSeq;
  if (!doc.startViewTransition || samePath) {
    if (!samePath) leaveShot();
    navigate(to, options);
    return;
  }
  const dry = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // `vt-nav` só no estado novo: o risco de luz (Shell → .vt-beam) existe na foto do "depois". `vt-live`: a página nova
  // tem palco, a foto velha do palco some (o vivo continua); sem palco novo, a velha apaga.
  const root = document.documentElement;
  const go = () => {
    if (seq !== navSeq) return;
    const vt = doc.startViewTransition?.(async () => {
      leaveShot();
      root.classList.add('vt-nav', dry ? 'vt-dry' : 'cut-in');
      flushSync(() => navigate(to, options));
      await pageReady();
      root.classList.toggle('vt-live', useStage.getState().scene !== 'none');
    });
    const done = () => root.classList.remove('vt-nav', 'vt-live', 'vt-dry');
    vt?.finished.then(done, done);
    window.clearTimeout(cutTimer);
    cutTimer = window.setTimeout(() => root.classList.remove('cut-in'), CUT_IN_MS);
  };
  const chunk = routeChunk(to);
  if (!chunk) {
    go();
    return;
  }
  void Promise.race([chunk(), new Promise((r) => setTimeout(r, 1200))]).then(go, go);
};

/** Voltar e avançar do navegador: o corpo também deixa o plano de saída (fase de captura, antes do roteador trocar). */
function usePopShot() {
  useEffect(() => {
    window.addEventListener('popstate', leaveShot, { capture: true });
    return () => window.removeEventListener('popstate', leaveShot, { capture: true });
  }, []);
}

/** Primeira carga usa a entrada por CSS; depois dela, as trocas de rota ficam com a View Transition. */
function useTransitionClass() {
  useEffect(() => {
    if (!canTransition()) return;
    const id = setTimeout(() => document.documentElement.classList.add('vt'), 900);
    return () => clearTimeout(id);
  }, []);
}

/** Chunk da rota ainda baixando: um filamento no meio da área da página, só depois de 300 ms (carga rápida não pisca). */
function RouteWait() {
  return (
    <main id="conteudo" className="sheet route-wait" aria-busy="true">
      <span className="stage__loading-rule" />
    </main>
  );
}

/** Página com id na URL: o endereço antigo com sublinhado troca para o slug com hífen (mantém a busca). */
function Slugged({ id, href, page: Page }: { id: string; href: (id: string) => string; page: ComponentType<{ id: string }> }) {
  const search = useSearch();
  if (id.includes('_')) return <Redirect to={href(id) + (search ? `?${search}` : '')} replace />;
  return <Page id={unslug(id)} />;
}

function RouteBoundary({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  return <ErrorBoundary resetKey={loc}>{children}</ErrorBoundary>;
}

export function App() {
  useTransitionClass();
  usePrefetchOnIntent();
  usePopShot();
  return (
    <Router base={base} aroundNav={aroundNav}>
      <RouteChange />
      <Shell>
        <RouteBoundary>
          <Suspense fallback={<RouteWait />}>
            <Switch>
              <Route path="/" component={Home} />
              <Route path={R.labSquat} component={Lab} />
              <Route path={R.labCompare} component={Compare} />
              <Route path={R.lab} component={Lab} />
              <Route path={R.atlas} component={AtlasIndex} />
              <Route path={`${R.atlas}/:id`}>{(p) => <Slugged id={p.id} href={muscleHref} page={MusclePage} />}</Route>
              <Route path={R.library} component={Library} />
              <Route path={`${R.library}/:id`}>{(p) => <Slugged id={p.id} href={exerciseHref} page={ExercisePage} />}</Route>
              <Route path={R.training} component={Treino} />
              <Route path={R.plan} component={Plano} />
              <Route path={R.history} component={Historico} />
              <Route path={R.progress} component={Progresso} />
              <Route path={R.analysis} component={Analise} />
              <Route path={R.data} component={Dados} />
              <Route path={R.about}>{() => <Legal page="about" />}</Route>
              <Route path={R.terms}>{() => <Legal page="terms" />}</Route>
              <Route path={R.privacy}>{() => <Legal page="privacy" />}</Route>
              <Route path={R.licenses}>{() => <Legal page="licenses" />}</Route>
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
