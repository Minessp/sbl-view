/**
 * Lâmpada sob o ponteiro: o elemento apertável sob o mouse recebe --mx/--my (px, relativo a ele) e o CSS desenha um
 * brilho macio ali (`--lamp` em tokens.css). Só com ponteiro fino; um ouvinte delegado para a página toda.
 */
const SEL = '.btn-primary, .btn-secondary, .chip, .site-nav a, .menu-btn, .lamp';

export function startPointerLight() {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) return;
  window.addEventListener(
    'pointermove',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(SEL) : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
      el.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
    },
    { passive: true },
  );
}
