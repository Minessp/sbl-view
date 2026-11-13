/**
 * Alternativa sem WebGL: o corpo anatômico desenhado de antemão (scripts/fallback-images.mjs), de frente e de costas.
 * O conteúdo do 3D também está nas listas e tabelas de cada página.
 */
import { t } from '@/i18n/app';

const src = (v: 'frente' | 'costas') => `${import.meta.env.BASE_URL}fallback/corpo-${v}.webp`;

export function StaticFallback() {
  return (
    <figure className="fallback">
      <h2 className="fallback__title">{t.fallback.title}</h2>
      <p className="fallback__body">{t.fallback.body}</p>
      <div className="fallback__views">
        <img src={src('frente')} alt={t.fallback.front} width={240} height={600} loading="lazy" decoding="async" />
        <img src={src('costas')} alt={t.fallback.back} width={240} height={600} loading="lazy" decoding="async" />
      </div>
    </figure>
  );
}
