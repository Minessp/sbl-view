import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'wouter';
import { getReference } from '@/data';
import { fmt, t } from '@/i18n/app';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { exerciseById, library, muscleById } from './catalog';
import type { LibraryExercise } from '@/data/schema/exercise';
import { EmphasisMark } from './EmphasisMark';
import { compiledClip } from './motion';
import { LengthChart, Player } from './player/Player';
import { usePlayer } from './player/store';
import '@/features/atlas/explorer/explorer.css';
import './library.css';
import '@/ui/target-list.css';
import { Title } from '@/ui/Title';
import { muscleHref, R } from '@/app/routes';

/** Algum alvo do exercício é alvo de outro exercício também: dá para comparar no Lab. */
const comparable = (e: LibraryExercise): boolean =>
  e.targets.some((t) => t.role === 'alvo' && library.some((x) => x.id !== e.id && x.targets.some((y) => y.muscle === t.muscle && y.role === 'alvo')));

export default function ExercisePage({ id }: { id: string }) {
  const e = exerciseById(id);
  const E = t.exercise;
  const clip = useMemo(() => (e ? compiledClip(e.id) : null), [e]);
  const targets = useMemo(
    () => ({ primary: e?.targets.filter((x) => x.role === 'alvo').map((x) => x.muscle) ?? [], synergist: e?.targets.filter((x) => x.role === 'sinergista').map((x) => x.muscle) ?? [] }),
    [e],
  );
  const list = useRef<HTMLUListElement>(null);

  // Rolagem-câmera: o músculo no meio da faixa de leitura isola no corpo e a câmera aproxima 12%.
  useEffect(() => {
    const ul = list.current;
    if (!ul || !clip) return;
    const st = usePlayer.getState;
    let active: string | null = null;
    // No celular a prancha só aparece abaixo do palco preso: a faixa de leitura desce.
    const band = window.matchMedia('(min-width: 900px)').matches ? '-45% 0px -45% 0px' : '-72% 0px -12% 0px';
    const io = new IntersectionObserver(
      (entries) => {
        const was = active;
        for (const en of entries) {
          const id = (en.target as HTMLElement).dataset.muscle ?? null;
          if (en.isIntersecting) active = id;
          else if (active === id) active = null;
        }
        if (active === was) return;
        st().setIsolate(active);
        st().setDolly(active ? 0.88 : 1);
      },
      { rootMargin: band },
    );
    ul.querySelectorAll('li').forEach((li) => io.observe(li));
    return () => {
      io.disconnect();
      st().setDolly(1);
    };
  }, [clip]);

  const unverified = useMemo(() => (e ? !e.length.source.some((s) => getReference(s.refId)?.verified === true) : false), [e]);

  if (!e) {
    return (
      <main id="conteudo" className="sheet">
        <p>{E.notFound}</p>
        <Link href={R.library} className="link-btn">
          {E.back}
        </Link>
      </main>
    );
  }

  const head = (
    <header className="ex-head">
      <Link href={R.library} className="ex-head__back">
        {E.back}
      </Link>
      <Title text={e.name} />
      <dl className="ex-head__facts">
        <div>
          <dt>{E.pattern}</dt>
          <dd>{t.patterns[e.pattern]}</dd>
        </div>
        <div>
          <dt>{E.equipment}</dt>
          <dd>{e.equipment.map((q) => t.equipment[q]).join(', ')}</dd>
        </div>
        <div>
          <dt>{E.status}</dt>
          <dd>{t.status[e.status]}</dd>
        </div>
      </dl>
    </header>
  );
  const P = E.player;
  const tp = clip?.clip.tempo;

  return (
    <main id="conteudo" className="ex">
      {clip ? <Player name={e.name} clip={clip} targets={targets} head={head} /> : <div className="sheet">{head}</div>}

      <div className="ex-plate">
        <div className="sheet ex-plate__inner">
          <p className="ex-plate__lead prose">{e.summary}</p>

          <section className="section" aria-labelledby="ex-targets">
            <header className="section__head">
              <h2 id="ex-targets">{E.targets}</h2>
            </header>
            <ul ref={list} className="target-list">
              {e.targets.map((tg) => {
                const m = muscleById(tg.muscle);
                const parts = tg.parts?.map((p) => m?.parts.find((x) => x.id === p)?.name ?? p);
                return (
                  <li key={tg.muscle} data-role={tg.role} data-muscle={tg.muscle}>
                    <Link href={muscleHref(tg.muscle)} className="target-list__name">
                      {m?.name ?? tg.muscle}
                    </Link>
                    {parts && <span className="target-list__parts">{parts.join(', ').toLowerCase()}</span>}
                    <span className="target-list__role">{t.roles[tg.role]}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="section" aria-labelledby="ex-length">
            <header className="section__head">
              <h2 id="ex-length">{E.length}</h2>
            </header>
            <p className="emph-line">
              <EmphasisMark emphasis={e.length.emphasis} />
              <span>{t.emphasis[e.length.emphasis]}</span>
            </p>
            <p className="prose">{e.length.text}</p>
            <EvidenceSeal confidence={e.length.confidence} hypothesis={e.status === 'hipotese'} unverified={unverified} />
            {e.length.note && <p className="section__note">{e.length.note}</p>}
            {e.status === 'hipotese' && <p className="section__note">{E.hypothesisNote}</p>}
            {clip && tp && (
              <>
                <LengthChart clip={clip} targets={targets} />
                <p className="section__note">{P.tempo(fmt.n1(tp.eccentric), fmt.n1(tp.stretched), fmt.n1(tp.concentric), fmt.n1(tp.shortened))}</p>
                <p className="section__note">{P.clipNote}</p>
              </>
            )}
          </section>

          <section className="section" aria-labelledby="ex-sources">
            <header className="section__head">
              <h2 id="ex-sources">{E.sources}</h2>
            </header>
            <Sources ids={e.length.source.map((s) => s.refId)} />
            <p className="disclaimer">{t.lab.model.disclaimer}</p>
          </section>

          <div className="ex-plate__actions">
            <Link href={`${R.training}?exercicio=${e.id}`} className="btn-primary">
              {E.log}
            </Link>
            {e.labId && (
              <Link href={R.labSquat} className="btn-secondary">
                {E.lab}
              </Link>
            )}
            {comparable(e) && (
              <Link href={`${R.labCompare}?ex=${e.id}`} className="btn-secondary">
                {E.compare}
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
