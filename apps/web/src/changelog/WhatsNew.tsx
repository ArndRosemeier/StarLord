import { useEffect } from "react";
import { RELEASES } from "./changelog";

/** The build history, newest first. */
export function WhatsNew({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal whats-new" role="dialog" aria-label="What's new" onClick={(e) => e.stopPropagation()}>
        <div className="whats-new-head">
          <h2>What's new</h2>
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>
        {RELEASES.map((r) => (
          <section key={r.file} className="whats-new-release">
            <h3>
              <span className="whats-new-version">v{r.version}</span>
              {r.title && <span>{r.title}</span>}
              <span className="whats-new-date">{r.date}</span>
            </h3>
            <ul>{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}
