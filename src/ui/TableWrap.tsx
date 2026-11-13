import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Contêiner de tabela com rolagem horizontal. Quando a tabela transborda, vira região
 * focável (teclado rola com as setas); sem transbordo, não cria parada de Tab inútil.
 */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="table-wrap"
      role={overflow ? 'region' : undefined}
      aria-label={overflow ? label : undefined}
      tabIndex={overflow ? 0 : undefined}
    >
      {children}
    </div>
  );
}
