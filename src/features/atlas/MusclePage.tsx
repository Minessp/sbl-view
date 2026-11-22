import { Link, useLocation, useSearch } from 'wouter';
import type { MuscleDef } from '@/data/schema/muscle';
import { t } from '@/i18n/app';
import { muscleById } from '@/features/library/catalog';
import { MuscleFilm } from './MuscleFilm';
import './explorer/explorer.css';
import '@/features/heat/heat.css';
import './atlas.css';
import { muscleHref, R } from '@/app/routes';

/** Parte em foco pela URL (`?parte=deltoid_ant`): dá para mandar o link da parte. */
function usePart(m: MuscleDef): [string | undefined, (part: string | undefined) => void] {
  const search = useSearch();
  const [, navigate] = useLocation();
  const raw = new URLSearchParams(search).get('parte') ?? undefined;
  const part = m.parts.length > 1 && m.parts.some((p) => p.id === raw) ? raw : undefined;
  const setPart = (p: string | undefined) => navigate(muscleHref(m.id, p), { replace: true });
  return [part, setPart];
}

function MuscleBody({ m }: { m: MuscleDef }) {
  const [part, setPart] = usePart(m);
  return <MuscleFilm m={m} part={part} setPart={setPart} />;
}

export default function MusclePage({ id }: { id: string }) {
  const m = muscleById(id);
  const A = t.atlas;
  if (!m) {
    return (
      <main id="conteudo" className="sheet">
        <p>{A.notFound}</p>
        <Link href={R.atlas} className="link-btn">
          {A.back}
        </Link>
      </main>
    );
  }
  return <MuscleBody m={m} />;
}
