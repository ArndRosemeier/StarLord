import { useState } from "react";
import type { CombatReport } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { describeEvent, starName } from "../ui/format";
import { CombatReplay } from "./CombatReplay";

/** A small glyph per kind of turn report event. */
const EVENT_ICONS: Record<string, string> = {
  colonyFounded: "\u2691\uFE0E", techLearned: "\u2697\uFE0E", built: "\u2692\uFE0E", starvation: "\u26A0\uFE0E", explored: "\u2726",
  commandRejected: "\u2716\uFE0E", combat: "\u2694\uFE0E", colonyLost: "\u2620\uFE0E", colonyCaptured: "\u2691\uFE0E", invasionFailed: "\u2716\uFE0E",
  bombarded: "\u2604\uFE0E", diplomacy: "\u260D\uFE0E", spy: "\u25D0", leader: "\u265B\uFE0E", council: "\u2696\uFE0E", random: "\u2735", raid: "\u2620\uFE0E",
  eliminated: "\u2620\uFE0E",
};

export function EventsScreen({ onShowStar }: { onShowStar: (starId: string) => void }) {
  const { session, view, me } = useGame();
  const [replay, setReplay] = useState<CombatReport | null>(null);
  const [showRoutine, setShowRoutine] = useState(false);
  const turns = session.history;

  return (
    <div className="col" style={{ maxWidth: 1000 }}>
      <div className="row">
        <h2 style={{ margin: 0 }}>Turn reports</h2>
        <span className="spacer" />
        <label><input type="checkbox" checked={showRoutine} onChange={(e) => setShowRoutine(e.target.checked)} /> Show exploration and finished builds</label>
      </div>
      {turns.length === 0 && <div className="panel muted">Nothing has happened yet. End your first turn.</div>}
      {turns.map((t) => {
        const events = t.events.filter((e) => e.playerId === me.id && (showRoutine || (e.kind !== "explored" && e.kind !== "built")));
        const combats = t.combats.filter((c) => c.sides.includes(me.id));
        if (events.length === 0 && combats.length === 0) return null;
        return (
          <div className="panel col" key={t.turn} style={{ gap: 6 }}>
            <h4 className="turn-head">Turn {t.turn}</h4>
            <div className="timeline">
            {events.map((e, i) => {
              const d = describeEvent(view, e);
              return (
                <div className={`tl-event ${d.tone ?? ""} ${e.kind}`} key={i} style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
                  <span className="tl-icon">{EVENT_ICONS[e.kind] ?? "\u2022"}</span>
                  <span style={{ flex: 1 }}>{d.text}</span>
                  {e.kind === "combat" && (() => {
                    const report = combats.find((c) => c.id === e.reportId);
                    return report ? <button className="small" onClick={() => setReplay(report)}>Replay battle</button> : null;
                  })()}
                  {d.starId && <button className="small" onClick={() => onShowStar(d.starId!)}>Map</button>}
                </div>
              );
            })}
            </div>
          </div>
        );
      })}
      {replay && (
        <div className="modal-back" onClick={() => setReplay(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h3 style={{ margin: 0 }}>Battle at {starName(view, replay.starId)}, turn {replay.turn}</h3>
              <span className="spacer" />
              <button className="small" onClick={() => setReplay(null)}>Close</button>
            </div>
            <CombatReplay report={replay} />
          </div>
        </div>
      )}
    </div>
  );
}
