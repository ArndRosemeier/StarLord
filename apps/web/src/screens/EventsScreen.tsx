import { useState } from "react";
import type { CombatReport } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { describeEvent, starName } from "../ui/format";
import { CombatReplay } from "./CombatReplay";

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
          <div className="panel col" key={t.turn} style={{ gap: 4 }}>
            <h4>Turn {t.turn}</h4>
            {events.map((e, i) => {
              const d = describeEvent(view, e);
              return (
                <div className="row" key={i}>
                  <span className={d.tone === "good" ? "good" : d.tone === "bad" ? "bad" : "muted"}>●</span>
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
