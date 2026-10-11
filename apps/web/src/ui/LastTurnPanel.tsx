import { useMemo, useState } from "react";
import { useGame } from "./hooks";
import { turnReport, type ReportTarget } from "./turnReport";

const COLLAPSED_KEY = "starlord.lastTurnPanel.collapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sidebar summary of what happened to us last turn: builds, research, battles and news. */
export function LastTurnPanel({ onTarget }: { onTarget: (target: ReportTarget) => void }) {
  const { session, view } = useGame();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const groups = useMemo(() => turnReport(view, session.lastTurnEvents(view.viewer)), [view, session]);
  const count = groups.reduce((n, g) => n + g.lines.length, 0);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Storage may be blocked; the panel still works for this session.
    }
  };

  if (view.turn <= 1) return null;
  return (
    <div className="panel col last-turn" style={{ gap: 6 }}>
      <div className="row">
        <button className="last-turn-head" onClick={toggle} aria-expanded={!collapsed}>
          <span className="last-turn-caret">{collapsed ? "▸" : "▾"}</span>
          <h4 style={{ margin: 0 }}>Last turn ({view.turn - 1})</h4>
          <span className="muted">{count === 0 ? "quiet" : `${count} report${count === 1 ? "" : "s"}`}</span>
        </button>
        <span className="spacer" />
        <button className="small" onClick={() => onTarget({ kind: "reports" })} title="Open the full turn reports">All</button>
      </div>
      {!collapsed && (count === 0
        ? <div className="muted">Nothing notable happened.</div>
        : (
          <div className="last-turn-body">
            {groups.map((g) => (
              <div key={g.section} className="last-turn-group">
                <div className="last-turn-label">{g.label}</div>
                {g.lines.map((l, i) => (
                  l.target ? (
                    <button key={i} className={`last-turn-line link ${l.tone}`} onClick={() => onTarget(l.target!)} title={targetHint(l.target)}>
                      {l.text}
                    </button>
                  ) : (
                    <div key={i} className={`last-turn-line ${l.tone}`}>{l.text}</div>
                  )
                ))}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function targetHint(t: ReportTarget): string {
  switch (t.kind) {
    case "colony": return "Open the colony";
    case "star": return "Show on the map";
    case "research": return "Open research";
    case "reports": return "Open turn reports";
  }
}
