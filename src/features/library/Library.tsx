/**
 * Biblioteca: a arara (corpo executando o exercício em foco, vizinhos em cartaz) e, abaixo, a parede de cartazes com a
 * barra de filtros presa. Um filtro só manda nas duas; ele mora na URL.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { domMax, LazyMotion, m, MotionConfig } from 'motion/react';
import { Link } from 'wouter';
import type { LibraryExercise } from '@/data/schema/exercise';
import { t } from '@/i18n/app';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { filterExercises, fromQuery, library, muscleById, NO_FILTERS, posterSrc, toQuery, type ExerciseFilters } from './catalog';
import { EmphasisMark } from './EmphasisMark';
import { FilterBar } from './FilterBar';
import { Rack } from './Rack';
import { usePlayer } from './player/store';
import './library.css';
import { Title } from '@/ui/Title';
import { EmptyState } from '@/ui/States';
import { exerciseHref } from '@/app/routes';

function PosterCard({ e }: { e: LibraryExercise }) {
  const targets = e.targets.filter((x) => x.role === 'alvo').map((x) => muscleById(x.muscle)?.name ?? x.muscle);
  return (
    <m.li layout="position" className="poster-card" transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <Link href={exerciseHref(e.id)} className="poster-card__link">
        <span className="poster-card__frame">
          <img className="poster-card__img" src={posterSrc(e.id)} alt="" width={640} height={800} loading="lazy" decoding="async" />
        </span>
        <span className="poster-card__name">{e.name}</span>
      </Link>
      <p className="poster-card__targets">{targets.join(', ')}</p>
      <p className="poster-card__len">
        <EmphasisMark emphasis={e.length.emphasis} />
        <span>{t.emphasis[e.length.emphasis]}</span>
      </p>
      <EvidenceSeal confidence={e.length.confidence} hypothesis={e.status === 'hipotese'} />
    </m.li>
  );
}

export default function Library() {
  const uid = useId();
  const [f, setF] = useState<ExerciseFilters>(() => fromQuery(window.location.search));
  const list = useMemo(() => filterExercises(library, f), [f]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = Math.max(0, list.findIndex((e) => e.id === focusId));
  const set = (patch: Partial<ExerciseFilters>) => setF((cur) => ({ ...cur, ...patch }));
  const L = t.library;

  useEffect(() => {
    const url = window.location.pathname + toQuery(f);
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
  }, [f]);

  // Músculo filtrado: aceso no corpo da arara em todo exercício (a troca de clipe zera o isolado; o efeito vem depois).
  const focused = list[focus];
  useEffect(() => usePlayer.getState().setIsolate(f.muscle), [f.muscle, focused]);

  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <main id="conteudo" className="lib">
          <header className="lib__head">
            <Title text={L.title} />
            <p className="lib__lead">{L.lead}</p>
          </header>

          {list.length > 0 && <Rack list={list} focus={focus} onFocus={(i) => setFocusId(list[i]?.id ?? null)} onMuscle={(id) => set({ muscle: id })} />}

          <section className="lib__wall" aria-labelledby={`${uid}-wall`}>
            <h2 id={`${uid}-wall`} className="visually-hidden">
              {L.wall}
            </h2>
            <FilterBar f={f} set={set} count={list.length} />
            {list.length === 0 ? (
              <EmptyState
                title={L.empty}
                actions={
                  <button type="button" className="btn-secondary" onClick={() => setF(NO_FILTERS)}>
                    {L.clear}
                  </button>
                }
              >
                <p>{L.emptyBody}</p>
              </EmptyState>
            ) : (
              <ul className="wall">
                {list.map((e) => (
                  <PosterCard key={e.id} e={e} />
                ))}
              </ul>
            )}
          </section>
        </main>
      </MotionConfig>
    </LazyMotion>
  );
}
