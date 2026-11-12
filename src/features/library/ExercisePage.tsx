import { useMemo } from 'react';
import { Link } from 'wouter';
import { getReference } from '@/data';
import { t } from '@/i18n';
import { EvidenceSeal } from '@/ui/EvidenceSeal';
import { Sources } from '@/ui/Sources';
import { exerciseById, muscleById } from './catalog';
import { EmphasisMark } from './EmphasisMark';
import './library.css';

export default function ExercisePage({ id }: { id: string }) {
  const e = exerciseById(id);
  const E = t.exercise;
  const unverified = useMemo(() => (e ? !e.length.source.some((s) => getReference(s.refId)?.verified === true) : false), [e]);

  if (!e) {
    return (
      <main id="conteudo" className="sheet">
        <p>{E.notFound}</p>
        <Link href="/exercicios" className="link-btn">
          {E.back}
        </Link>
      </main>
    );
  }

  return (
    <main id="conteudo" className="sheet">
      <header className="sheet__head">
        <Link href="/exercicios" className="sheet__plate sheet__plate--link">
          {E.back}
        </Link>
        <h1 className="sheet__title">{e.name}</h1>
        <p className="sheet__lead prose">{e.summary}</p>
        <dl className="facts">
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
        <div className="sheet__actions">
          <Link href={`/treino?exercicio=${e.id}`} className="btn-secondary">
            {E.log}
          </Link>
          {e.labId && (
            <Link href="/lab/agachamento" className="btn-secondary">
              {E.lab}
            </Link>
          )}
        </div>
      </header>

      <section className="section" aria-labelledby="ex-targets">
        <header className="section__head">
          <h2 id="ex-targets">{E.targets}</h2>
        </header>
        <ul className="target-list">
          {e.targets.map((tg) => {
            const m = muscleById(tg.muscle);
            const parts = tg.parts?.map((p) => m?.parts.find((x) => x.id === p)?.name ?? p);
            return (
              <li key={tg.muscle} data-role={tg.role}>
                <Link href={`/atlas/${tg.muscle}`} className="target-list__name">
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
      </section>

      <section className="section" aria-labelledby="ex-sources">
        <header className="section__head">
          <h2 id="ex-sources">{E.sources}</h2>
        </header>
        <Sources ids={e.length.source.map((s) => s.refId)} />
        <p className="disclaimer">{t.lab.model.disclaimer}</p>
      </section>
    </main>
  );
}
