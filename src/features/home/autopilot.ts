/**
 * Piloto automático da página inicial. Depois da entrada (osso → fibras → pele), o corpo passa a receber sozinho as
 * interações que o leitor tem à mão: uma lente fantasma desliza por uma curva suave sobre o corpo (peito, ombro, braço,
 * abdome, coxa, perna), a profundidade troca (músculo → profundo → osso, e os botões acendem junto), cada estrutura sob a
 * lente acende com o nome, uma vez por volta a lente cresce num "raio X" que abre o tronco inteiro e volta, e a câmera
 * gira devagar de um lado ao outro.
 *
 * Qualquer gesto do leitor (ponteiro na vista, toque, teclado, foco, rolagem) devolve tudo: giro e raio voltam ao
 * normal amortecidos, a profundidade volta à escolhida, a lente vai para o ponteiro (ou some). Depois de um tempo ocioso,
 * no topo da página, o piloto volta. Redução de movimento: não roda.
 */
import { useStage } from '@/scene/stageStore';
import { auto, lens, samePick, useHome, type HomePick } from './store';
import { LENS_DEPTHS, type LensDepth } from './timeline';

/** Duração de uma volta (s). */
const LOOP = 22;
/** Ocioso antes de voltar (s). */
const IDLE = 6;
/** Espera depois da entrada antes da primeira volta (s). */
const FIRST = 1.4;
/** Intervalo entre escolhas sob a lente (s). */
const PICK_EVERY = 0.28;

/**
 * Caminho da lente em unidades da altura do corpo na tela, relativo ao centro do corpo (x para a direita da tela, y para
 * baixo). Fechado: Catmull-Rom periódico.
 */
const PATH: readonly (readonly [number, number])[] = [
  [-0.07, -0.25], // peito
  [-0.17, -0.3], // ombro
  [-0.23, -0.15], // braço
  [-0.27, -0.02], // antebraço
  [-0.02, -0.1], // abdome
  [-0.07, 0.12], // coxa
  [-0.06, 0.33], // perna
  [0.07, 0.17], // coxa do outro lado
  [0.04, -0.06], // oblíquo
  [0.08, -0.24], // peito do outro lado
  [0.0, -0.4], // pescoço
];

/** Profundidade ao longo da volta (fração da volta → camada). */
const DEPTHS: readonly (readonly [number, LensDepth])[] = [
  [0, 'superficial'],
  [0.3, 'deep'],
  [0.52, 'bone'],
  [0.66, 'superficial'],
];

/** "Raio X": a lente cresce até abrir o tronco e volta (fração da volta, duração em fração). */
const BLOOM_AT = 0.8;
const BLOOM_LEN = 0.12;
const BLOOM_SCALE = 3.4;

const smooth = (x: number) => x * x * (3 - 2 * x);

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Ponto do caminho fechado em f ∈ [0, 1). */
export function pathAt(f: number): [number, number] {
  const n = PATH.length;
  const x = (((f % 1) + 1) % 1) * n;
  const i = Math.floor(x);
  const t = x - i;
  const at = (k: number) => PATH[(((i + k) % n) + n) % n] ?? [0, 0];
  const [a, b, c, d] = [at(-1), at(0), at(1), at(2)];
  return [catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t)];
}

export function depthAt(f: number): LensDepth {
  let d: LensDepth = 'superficial';
  for (const [at, v] of DEPTHS) if (f >= at) d = v;
  return d;
}

/** Escala do raio: respira de leve e abre no "raio X". */
export function scaleAt(f: number, time: number): number {
  const breathe = 1 + 0.08 * Math.sin(time * 1.7);
  const b = (f - BLOOM_AT) / BLOOM_LEN;
  if (b <= 0 || b >= 1) return breathe;
  // Sobe rápido, segura, desce: 0 → 1 → 1 → 0.
  const k = b < 0.3 ? smooth(b / 0.3) : b > 0.7 ? smooth((1 - b) / 0.3) : 1;
  return breathe + (BLOOM_SCALE - breathe) * k;
}

export interface PilotHooks {
  slot: HTMLElement;
  /** Põe lente, anel e rótulo no ponto (px da janela), com o raio multiplicado. */
  place: (x: number, y: number, scale: number) => void;
  showRing: (on: boolean) => void;
  pickAt: (x: number, y: number) => HomePick | null;
}

export interface Pilot {
  /** O leitor assumiu: devolve tudo e espera ficar ocioso de novo. */
  yield: () => void;
  dispose: () => void;
}

export function startAutopilot(h: PilotHooks): Pilot {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let running = false;
  /** Instante (s) da última interação do leitor. */
  let lastTouch = performance.now() / 1000 - IDLE + FIRST;
  /** Fase da volta (s) e relógio. */
  let phase = 0;
  let clock = 0;
  /** Entrada e saída suaves do piloto (0..1). */
  let mix = 0;
  let chosen: LensDepth = useHome.getState().depth;
  let lastPick = 0;
  let pos = { x: 0, y: 0 };

  const center = () => {
    const r = h.slot.getBoundingClientRect();
    const wide = r.width > r.height * 1.15;
    const H = r.height * (wide ? 0.82 : 0.6);
    return { cx: r.left + r.width * (wide ? 0.66 : 0.5), cy: r.top + r.height * (wide ? 0.47 : 0.66), H, r };
  };

  const canRun = () => {
    const st = useHome.getState();
    return st.live && !st.leaving && useStage.getState().progress < 0.004 && document.visibilityState === 'visible';
  };

  const frame = (nowMs: number) => {
    raf = 0;
    const now = nowMs / 1000;
    const dt = clock ? Math.min(0.1, now - clock) : 1 / 60;
    clock = now;
    const want = running && canRun();
    mix = Math.max(0, Math.min(1, mix + (want ? dt / 1.2 : -dt / 0.6)));
    const st = useHome.getState();

    if (mix > 0 && !want) {
      // Devolvendo: só o giro e o raio voltam; a lente é do leitor (ou já sumiu).
      auto.yaw *= Math.max(0, 1 - dt * 5);
      lens.scale = 1;
      auto.running = true;
      st.kick();
    } else if (mix > 0) {
      phase += dt * (0.4 + 0.6 * mix);
      const f = (phase / LOOP) % 1;
      const { cx, cy, H } = center();
      const [px, py] = pathAt(f);
      const goal = { x: cx + px * H, y: cy + py * H };
      // A lente fantasma entra do centro do peito (sem salto do lugar onde estava).
      pos = mix < 1 && pos.x === 0 ? goal : { x: pos.x + (goal.x - pos.x) * Math.min(1, dt * 6), y: pos.y + (goal.y - pos.y) * Math.min(1, dt * 6) };
      lens.on = true;
      h.showRing(true);
      h.place(pos.x, pos.y, 1 + (scaleAt(f, now) - 1) * mix);
      lens.scale = 1 + (scaleAt(f, now) - 1) * mix;
      auto.yaw = 0.42 * Math.sin((phase / LOOP) * Math.PI * 2) * smooth(mix);
      auto.running = true;
      const d = depthAt(f);
      if (st.depth !== d) st.setDepth(d);
      if (now - lastPick > PICK_EVERY) {
        lastPick = now;
        const p = h.pickAt(pos.x, pos.y);
        if (!samePick(p, st.hover)) st.setHover(p);
      }
      st.kick();
    }

    if (mix === 0 && auto.running) {
      // Fim da devolução: tudo no lugar.
      auto.running = false;
      auto.yaw = 0;
      lens.scale = 1;
      pos = { x: 0, y: 0 };
      st.kick();
    }

    // Ocioso há tempo e no topo: volta.
    if (!running && !reduce && now - lastTouch > IDLE && canRun()) {
      running = true;
      chosen = st.depth;
    }
    raf = requestAnimationFrame(frame);
  };

  const yieldTo = () => {
    lastTouch = performance.now() / 1000;
    if (!running) return;
    running = false;
    // Devolve na hora o que o leitor vê nos controles; giro e raio voltam amortecidos (mix → 0).
    const st = useHome.getState();
    if (LENS_DEPTHS.includes(chosen) && st.depth !== chosen) st.setDepth(chosen);
    lens.scale = 1;
    // A lente some; se o gesto foi o ponteiro na vista, o próprio gesto a põe de volta sob ele logo em seguida.
    lens.on = false;
    h.showRing(false);
    st.setHover(null);
    st.kick();
  };

  if (!reduce) raf = requestAnimationFrame(frame);
  const onScroll = () => {
    if (window.scrollY > 4) yieldTo();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  return {
    yield: yieldTo,
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      auto.running = false;
      auto.yaw = 0;
      lens.scale = 1;
    },
  };
}
