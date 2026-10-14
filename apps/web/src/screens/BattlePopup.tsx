import { useState } from "react";
import type { CombatReport } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { starName } from "../ui/format";
import { CombatReplay } from "./CombatReplay";

/**
 * The battles we fought last turn, shown one after another as the new turn
 * starts, so no fleet is ever lost unseen, even one destroyed by the first
 * shot. The Turn report keeps every battle for replay.
 */
export function BattlePopup({ battles, onClose }: { battles: CombatReport[]; onClose: () => void }) {
  const { view, me } = useGame();
  const [index, setIndex] = useState(0);
  const report = battles[index];
  if (!report) return null;
  const won = report.winner === me.id;
  const next = () => (index + 1 < battles.length ? setIndex(index + 1) : onClose());
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 style={{ margin: 0 }}>
            Battle at {starName(view, report.starId)}{report.colonyId && view.colonies[report.colonyId] ? <> over {view.colonies[report.colonyId]!.name}</> : null}: <span className={won ? "good" : "bad"}>{won ? "victory" : "defeat"}</span>
            {battles.length > 1 && <small className="muted"> ({index + 1} of {battles.length})</small>}
          </h3>
          <span className="spacer" />
          {index + 1 < battles.length && <button className="small" onClick={onClose}>Skip all</button>}
          <button className="small primary" onClick={next}>{index + 1 < battles.length ? "Next battle" : "Close"}</button>
        </div>
        <CombatReplay key={report.id} report={report} />
      </div>
    </div>
  );
}
