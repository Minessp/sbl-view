import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fmt, t } from '@/i18n/app';
import { backupFileName, parseBackup, type ParseError } from '@/storage/backup';
import { repository, requestPersistence, storageStatus, type StorageStatus } from '@/storage/db';
import { TreinoHeader } from './shared';
import { reloadPrefs, setUnit, useUnit } from './units';

type Msg = { kind: 'ok' | 'error'; text: string } | null;

function Status({ msg }: { msg: Msg }) {
  return (
    <p className="logger__status" role="status" data-kind={msg?.kind}>
      {msg?.text ?? ''}
    </p>
  );
}

export default function Dados() {
  const L = t.training.data;
  const P = t.training.prefs;
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [counts, setCounts] = useState<{ sessions: number; sets: number } | null>(null);
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [exportMsg, setExportMsg] = useState<Msg>(null);
  const [importMsg, setImportMsg] = useState<Msg>(null);
  const [wipeMsg, setWipeMsg] = useState<Msg>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [prefMsg, setPrefMsg] = useState<Msg>(null);
  const unit = useUnit();

  const refresh = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([repository().counts(), storageStatus()]);
      setCounts(c);
      setStatus(s);
    } catch {
      setCounts(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onExport() {
    try {
      const now = Date.now();
      const data = await repository().exportAll(now);
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const name = backupFileName(now);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMsg({ kind: 'ok', text: L.exported(name) });
    } catch {
      setExportMsg({ kind: 'error', text: t.training.error });
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportMsg({ kind: 'error', text: L.importErrors.read });
      return;
    }
    const r = parseBackup(text);
    if (!r.ok) {
      setImportMsg({ kind: 'error', text: L.importErrors[r.error satisfies ParseError] });
      return;
    }
    try {
      const rep = await repository().importBackup(r.backup);
      void requestPersistence();
      setImportMsg({ kind: 'ok', text: L.imported(rep.added, rep.updated, rep.kept) });
      await Promise.all([refresh(), reloadPrefs()]);
    } catch {
      setImportMsg({ kind: 'error', text: t.training.error });
    }
  }

  async function onWipe() {
    if (!confirmWipe) {
      setConfirmWipe(true);
      return;
    }
    try {
      await repository().wipe();
      setConfirmWipe(false);
      setWipeMsg({ kind: 'ok', text: L.wiped });
      await Promise.all([refresh(), reloadPrefs()]);
    } catch {
      setWipeMsg({ kind: 'error', text: t.training.error });
    }
  }

  async function onPersist() {
    await requestPersistence();
    await refresh();
  }

  return (
    <main id="conteudo" className="sheet">
      <TreinoHeader title={L.title} lead={L.lead} />

      <section className="section" aria-labelledby={`${uid}-here`}>
        <h2 id={`${uid}-here`} className="visually-hidden">
          {L.title}
        </h2>
        {counts && <p className="data__count">{L.count(counts.sessions, counts.sets)}</p>}
        {status?.usageBytes != null && <p className="section__note">{L.usage(fmt.n1(status.usageBytes / 1_048_576))}</p>}
        {status?.persisted === true && <p className="section__note">{L.persisted}</p>}
        {status?.persisted === false && (
          <>
            <p className="section__note">{L.notPersisted}</p>
            <button type="button" className="btn-secondary" onClick={() => void onPersist()}>
              {L.persistAsk}
            </button>
          </>
        )}
      </section>

      <section className="section" aria-labelledby={`${uid}-pref`}>
        <header className="section__head">
          <h2 id={`${uid}-pref`}>{P.title}</h2>
          <p>{P.lead}</p>
        </header>
        <div className="segmented unit-toggle" role="group" aria-label={t.training.unit}>
          {(['kg', 'lb'] as const).map((u) => (
            <button
              key={u}
              type="button"
              className="chip chip--small"
              aria-pressed={unit === u}
              onClick={() =>
                void setUnit(u).then(
                  () => setPrefMsg({ kind: 'ok', text: P.unitSaved(u) }),
                  () => setPrefMsg({ kind: 'error', text: t.training.error }),
                )
              }
            >
              {u}
            </button>
          ))}
        </div>
        <Status msg={prefMsg} />
      </section>

      <section className="section" aria-labelledby={`${uid}-exp`}>
        <header className="section__head">
          <h2 id={`${uid}-exp`}>{L.exportTitle}</h2>
          <p>{L.exportLead}</p>
        </header>
        <button type="button" className="btn-secondary" onClick={() => void onExport()}>
          {L.exportBtn}
        </button>
        <Status msg={exportMsg} />
      </section>

      <section className="section" aria-labelledby={`${uid}-imp`}>
        <header className="section__head">
          <h2 id={`${uid}-imp`}>{L.importTitle}</h2>
          <p>{L.importLead}</p>
        </header>
        <input ref={fileRef} id={`${uid}-file`} type="file" tabIndex={-1} aria-labelledby={`${uid}-imp`} accept="application/json,.json" className="visually-hidden" onChange={(e) => void onImport(e)} />
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
          {L.importBtn}
        </button>
        <Status msg={importMsg} />
      </section>

      <section className="section" aria-labelledby={`${uid}-off`}>
        <header className="section__head">
          <h2 id={`${uid}-off`}>{L.offlineTitle}</h2>
          <p>{L.offlineLead}</p>
        </header>
      </section>

      <section className="section" aria-labelledby={`${uid}-wipe`}>
        <header className="section__head">
          <h2 id={`${uid}-wipe`}>{L.wipeTitle}</h2>
          <p>{L.wipeLead}</p>
        </header>
        <button type="button" className="btn-secondary btn-danger" onClick={() => void onWipe()} onBlur={() => setConfirmWipe(false)} disabled={counts?.sets === 0 && counts.sessions === 0}>
          {confirmWipe ? L.wipeConfirm(counts?.sets ?? 0) : L.wipeBtn}
        </button>
        <Status msg={wipeMsg} />
      </section>
    </main>
  );
}
