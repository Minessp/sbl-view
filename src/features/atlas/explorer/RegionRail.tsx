/** Trilho de regiões na base do palco: a câmera voa até a região (ou volta ao corpo inteiro). */
import { t } from '@/i18n/app';
import { REGIONS } from '@/features/library/catalog';
import { useAtlas } from '../store';

export function RegionRail() {
  const st = useAtlas.getState;
  return (
    <nav className="region-rail" aria-label={t.atlas.ex.regions}>
      <button type="button" className="region-rail__btn" onClick={() => st().select(null, { fly: true })}>
        {t.atlas.ex.wholeBody}
      </button>
      {REGIONS.map((r) => (
        <button key={r.id} type="button" className="region-rail__btn" onClick={() => st().flyToRegion(r.id)}>
          {t.regions[r.id as keyof typeof t.regions]}
        </button>
      ))}
    </nav>
  );
}
