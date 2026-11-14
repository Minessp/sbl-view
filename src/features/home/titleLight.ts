/**
 * Título do herói sob a luz do cursor: cada letra perto do ponteiro ganha peso (eixo wght da Archivo) e um brilho de
 * tungstênio, como se a lâmpada passasse por cima. A largura de cada letra fica presa na medida do peso normal (a letra
 * mais pesada transborda um pouco para os lados, centrada): a linha não reflui e as palavras não trocam de linha.
 * Só com ponteiro fino e sem redução de movimento. Devolve a limpeza.
 */
const BASE = 260;
const PEAK = 520;
/** Raio da luz em px. */
const R = 170;

export function lightTitle(h1: HTMLElement): () => void {
  if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  const chars = [...h1.querySelectorAll<HTMLElement>('.split__char')];
  let rects: DOMRect[] = [];
  let raf = 0;
  const ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
  const weights = chars.map(() => BASE);

  const measure = () => {
    for (const c of chars) {
      c.style.width = '';
      c.style.fontWeight = '';
    }
    // Largura de layout (sem a escala da animação de entrada), com fração.
    const ws = chars.map((c) => getComputedStyle(c).width);
    chars.forEach((c, i) => (c.style.width = ws[i] ?? ''));
    rects = chars.map((c) => c.getBoundingClientRect());
  };

  const frame = () => {
    raf = 0;
    ptr.x += (ptr.tx - ptr.x) * 0.18;
    ptr.y += (ptr.ty - ptr.y) * 0.18;
    let moving = Math.abs(ptr.tx - ptr.x) + Math.abs(ptr.ty - ptr.y) > 0.5;
    chars.forEach((c, i) => {
      const r = rects[i];
      if (!r) return;
      const d = Math.hypot(r.left + r.width / 2 - ptr.x, r.top + r.height / 2 - ptr.y);
      const k = Math.max(0, 1 - d / R) ** 2;
      const goal = BASE + (PEAK - BASE) * k;
      const w = (weights[i] ?? BASE) + (goal - (weights[i] ?? BASE)) * 0.22;
      if (Math.abs(w - goal) > 0.5) moving = true;
      weights[i] = w;
      c.style.fontWeight = w.toFixed(0);
      c.style.textShadow = k > 0.02 ? `0 0 ${(18 * k).toFixed(1)}px color-mix(in oklch, var(--c-glow) ${(55 * k).toFixed(0)}%, transparent)` : '';
    });
    if (moving) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const onMove = (e: PointerEvent) => {
    ptr.tx = e.clientX;
    ptr.ty = e.clientY;
    kick();
  };
  const onLeave = () => {
    ptr.tx = -1e4;
    ptr.ty = -1e4;
    kick();
  };
  let scrollRaf = 0;
  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      rects = chars.map((c) => c.getBoundingClientRect());
    });
  };

  // Medir de novo com a fonte carregada (a de reserva tem outra largura).
  let alive = true;
  void document.fonts.ready.then(() => alive && measure());
  const ro = new ResizeObserver(() => measure());
  ro.observe(h1);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(scrollRaf);
    ro.disconnect();
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('scroll', onScroll);
    for (const c of chars) {
      c.style.width = '';
      c.style.fontWeight = '';
      c.style.textShadow = '';
    }
  };
}
