import { useEffect, useState } from "react";

/**
 * In-page yes/no questions instead of the browser's `confirm()`, which a sandboxed frame (cued) blocks:
 * there it returns false at once and the action would silently never happen.
 */
interface Question { text: string; yes: string; resolve: (ok: boolean) => void }

let show: ((q: Question) => void) | null = null;

/** Asks a yes/no question; resolves true when the player confirms. */
export function ask(text: string, yes = "Yes"): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ text, yes, resolve });
    else resolve(window.confirm(text));
  });
}

/** Renders the open question; mount once near the app root. */
export function ConfirmHost() {
  const [q, setQ] = useState<Question | null>(null);
  useEffect(() => {
    show = setQ;
    return () => { show = null; };
  }, []);
  useEffect(() => {
    if (!q) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); answer(false); }
      if (e.key === "Enter") { e.stopPropagation(); answer(true); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  if (!q) return null;
  function answer(ok: boolean) {
    q!.resolve(ok);
    setQ(null);
  }
  return (
    <div className="modal-back confirm-back" onClick={() => answer(false)}>
      <div className="modal confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ whiteSpace: "pre-wrap" }}>{q.text}</div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={() => answer(false)}>Cancel</button>
          <button className="primary" autoFocus onClick={() => answer(true)}>{q.yes}</button>
        </div>
      </div>
    </div>
  );
}
