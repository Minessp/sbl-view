/**
 * Rota só de desenvolvimento (/dev/clipes): posa e salva clipes de movimento. Escolhe um exercício (o molde vira clipe
 * completo), edita trilhas e pose fixa com controles deslizantes no u atual, ou o JSON direto, e copia/baixa o resultado
 * para colar em `src/data/exercises/clips.json`. Usa o mesmo player da biblioteca (palco único).
 * Não entra no build de produção (App.tsx só registra a rota com import.meta.env.DEV). Texto fora do i18n: é ferramenta.
 */
import { useMemo, useState } from 'react';
import { MotionClip as MotionClipSchema, type MotionClip } from '@/data/schema/motion';
import { cycleLength, repAt, timeAtU } from '@/engine/motion/keys';
import { clipEntries, compileLoose, expandEntry, motionSkeleton } from '@/features/library/motion';
import { exerciseById } from '@/features/library/catalog';
import { Player } from '@/features/library/player/Player';
import { usePlayer } from '@/features/library/player/store';
import '@/features/atlas/explorer/explorer.css';

/** DOFs do esqueleto sem lado (o clipe aplica aos dois) e os de linha média. */
const DOFS = [...new Map(motionSkeleton.segments.flatMap((s) => s.dofs.map((d) => [d.id.replace(/_[rl]$/, ''), d] as const)))].map(([id, d]) => ({
  id,
  min: Math.round((d.min * 180) / Math.PI),
  max: Math.round((d.max * 180) / Math.PI),
}));


const round = (v: number, k = 10) => Math.round(v * k) / k;

export default function DevClips() {
  const [id, setId] = useState(clipEntries[0]?.id ?? '');
  const [text, setText] = useState(() =>
    JSON.stringify(
      expandEntry(
        clipEntries[0] ??
          (() => {
            throw new Error('sem clipes');
          })(),
      ),
      null,
      2,
    ),
  );
  const [addDof, setAddDof] = useState('elbow_flex');
  const time = usePlayer((s) => s.time);

  const parsed = useMemo(() => {
    try {
      const r = MotionClipSchema.safeParse(JSON.parse(text));
      return r.success
        ? { clip: r.data, error: null }
        : {
            clip: null,
            error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'),
          };
    } catch (e) {
      return { clip: null, error: String(e) };
    }
  }, [text]);
  const [compiled, setCompiled] = useState(() => (parsed.clip ? compileLoose(parsed.clip) : null));
  const [lastGood, setLastGood] = useState<string | null>(null);
  if (parsed.clip && text !== lastGood) {
    setLastGood(text);
    try {
      setCompiled(compileLoose(parsed.clip));
    } catch {
      /* DOF desconhecido etc.: fica o último que compilou */
    }
  }

  const ex = exerciseById(id);
  const targets = useMemo(
    () => ({
      primary: ex?.targets.filter((x) => x.role === 'alvo').map((x) => x.muscle) ?? [],
      synergist: ex?.targets.filter((x) => x.role === 'sinergista').map((x) => x.muscle) ?? [],
    }),
    [ex],
  );

  const clip = parsed.clip;
  const u = clip ? round(repAt(clip.tempo, time % cycleLength(clip.tempo)).u, 20) : 0;
  const write = (c: MotionClip) => setText(JSON.stringify(c, null, 2));

  /** Chave da trilha em u (substitui a mais perto se estiver a menos de 0,03). */
  const setKey = (dof: string, deg: number) => {
    if (!clip) return;
    const tracks = clip.tracks.map((t) => {
      if (t.dof !== dof) return t;
      const keys = t.keys.filter((k) => Math.abs(k.u - u) >= 0.03);
      return { ...t, keys: [...keys, { u, deg }].sort((a, b) => a.u - b.u) };
    });
    write({ ...clip, tracks });
  };

  return (
    <main id="conteudo" className="sheet">
      <header className="sheet__head">
        <h1 className="sheet__title">Clipes (dev)</h1>
        <label className="field">
          Exercício
          <select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              const entry = clipEntries.find((c) => c.id === e.target.value);
              if (entry) write(expandEntry(entry));
            }}
          >
            {clipEntries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
        </label>
      </header>

      {compiled && <Player name={ex?.name ?? id} clip={compiled} targets={targets} />}

      {clip && (
        <section className="section">
          <h2>{`Pose em u = ${u.toFixed(2)}`}</h2>
          <p className="sheet__actions">
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <button
                key={v}
                type="button"
                className="chip chip--small"
                onClick={() => {
                  usePlayer.getState().setPlaying(false);
                  usePlayer.getState().setTime(timeAtU(clip.tempo, v));
                }}
              >
                {`u ${v}`}
              </button>
            ))}
          </p>
          <h3>Trilhas (chave no u atual)</h3>
          {clip.tracks.map((t) => {
            const d = DOFS.find((x) => x.id === t.dof.replace(/_[rl]$/, ''));
            const near = t.keys.reduce((a, k) => (Math.abs(k.u - u) < Math.abs(a.u - u) ? k : a), t.keys[0] ?? { u: 0, deg: 0 });
            return (
              <label key={t.dof} className="field">
                {`${t.dof}: ${near.deg}° (chave em u ${near.u}) · ${t.keys.map((k) => `${k.u}→${k.deg}`).join(', ')}`}
                <input
                  type="range"
                  min={d?.min ?? -180}
                  max={d?.max ?? 180}
                  step={1}
                  value={near.deg}
                  onChange={(e) => setKey(t.dof, Number(e.target.value))}
                />
              </label>
            );
          })}
          <p className="sheet__actions">
            <select value={addDof} onChange={(e) => setAddDof(e.target.value)} aria-label="DOF da trilha nova">
              {DOFS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (clip.tracks.some((t) => t.dof === addDof)) return;
                const v = clip.hold[addDof] ?? 0;
                write({
                  ...clip,
                  tracks: [
                    ...clip.tracks,
                    {
                      dof: addDof,
                      keys: [
                        { u: 0, deg: v },
                        { u: 1, deg: v },
                      ],
                    },
                  ],
                });
              }}
            >
              Adicionar trilha
            </button>
          </p>
          <h3>Pose fixa</h3>
          {Object.entries(clip.hold).map(([dof, v]) => {
            const d = DOFS.find((x) => x.id === dof.replace(/_[rl]$/, ''));
            return (
              <label key={dof} className="field">
                {`${dof}: ${v}°`}
                <input
                  type="range"
                  min={d?.min ?? -180}
                  max={d?.max ?? 180}
                  step={1}
                  value={v}
                  onChange={(e) =>
                    write({
                      ...clip,
                      hold: { ...clip.hold, [dof]: Number(e.target.value) },
                    })
                  }
                />
              </label>
            );
          })}
        </section>
      )}

      <section className="section">
        <h2>JSON do clipe</h2>
        {parsed.error && <pre className="section__note">{parsed.error}</pre>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={24}
          spellCheck={false}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          aria-label="JSON do clipe"
        />
        <p className="sheet__actions">
          <button type="button" className="btn-secondary" onClick={() => void navigator.clipboard.writeText(text)}>
            Copiar
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
              a.download = `${id}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Baixar
          </button>
        </p>
      </section>
    </main>
  );
}
