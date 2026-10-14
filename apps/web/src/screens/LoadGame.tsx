import { useEffect, useRef, useState } from "react";
import { AUTOSAVES_KEPT, deleteSave, listSaves, readSave, readSaveFile } from "../game/saves";

/** Every save in this browser, newest first, plus loading a save or replay file. */
export function LoadGame({ onLoad, onClose }: { onLoad: (data: unknown) => void; onClose: () => void }) {
  const [saves, setSaves] = useState(() => [...listSaves()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  // Deleting takes a second tap, so a stray click (or touch) never loses a game.
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const load = (read: () => unknown) => {
    try {
      onLoad(read());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = (name: string) => {
    if (confirm !== name) return setConfirm(name);
    deleteSave(name);
    setConfirm(null);
    setSaves([...listSaves()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal load-game" role="dialog" aria-label="Load game" onClick={(e) => e.stopPropagation()}>
        <div className="whats-new-head">
          <h2>Load game</h2>
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>
        <p className="muted">
          Saves kept in this browser, newest first. Autosaves are made at the start of every turn and when you leave the
          page; only the newest {AUTOSAVES_KEPT} are kept.
        </p>
        {saves.length === 0 ? (
          <p>No saves in this browser yet. Save from the Game screen during play, or load a file below.</p>
        ) : (
          <div className="table-scroll">
            <table className="load-table">
              <tbody>
                {saves.map((s) => (
                  <tr key={s.name}>
                    <td>
                      {s.auto && <span className="chip" title={`Saved automatically; only the newest ${AUTOSAVES_KEPT} are kept`}>Auto</span>} {s.name}
                      <br />
                      <small className="muted">{s.empire}, turn {s.turn} · {new Date(s.savedAt).toLocaleString()}</small>
                    </td>
                    <td className="load-actions">
                      <button className="primary" onClick={() => load(() => readSave(s.name))}>Load</button>
                      <button className="danger" onClick={() => remove(s.name)} onBlur={() => setConfirm(null)}
                        title="Deletes this save from the browser for good">
                        {confirm === s.name ? "Really delete?" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row load-file">
          <button onClick={() => fileRef.current?.click()}>Load from file…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              onLoad(await readSaveFile(f));
            } catch (err) {
              setError((err as Error).message);
            }
          }} />
          <small className="muted">A downloaded save, or a replay file to watch a finished game again.</small>
        </div>
        {error && <div className="bad">{error}</div>}
      </div>
    </div>
  );
}
