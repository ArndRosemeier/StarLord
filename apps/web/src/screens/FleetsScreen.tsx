import { Tip } from "../ui/Tip";
import { FOCUS_TIPS, STANCE_TIPS } from "../ui/explain";
import { useState } from "react";
import { designStats, distance, findDesign, fleetSpeed, type Fleet } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, pct, words } from "../ui/format";
import { FleetPanel, fleetShips } from "../ui/panels";

export function FleetsScreen({ onShowStar }: { onShowStar: (starId: string) => void }) {
  const { session, view, me, readOnly } = useGame();
  const fleets = Object.values(view.fleets).filter((f) => f.ownerId === me.id);
  const [selected, setSelected] = useState<string | null>(fleets[0]?.id ?? null);
  const starName = (id: string | null) => view.galaxy.stars.find((s) => s.id === id)?.name ?? "";
  const strength = (f: Fleet) => f.ships.reduce((n, s) => {
    const d = findDesign(me, s.designId);
    return n + (d ? designStats(me, d).strength * s.count : 0);
  }, 0);
  const doctrine = me.doctrine;

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(420px, 1.3fr) minmax(340px, 1fr)" }}>
      <div className="col">
        <div className="panel scroll">
          <h2>Fleets</h2>
          <table>
            <thead><tr><th>Fleet</th><th>Where</th><th>Ships</th><th>Strength</th><th>Stance</th><th /></tr></thead>
            <tbody>
              {fleets.map((f) => {
                const dest = f.destStarId ? view.galaxy.stars.find((s) => s.id === f.destStarId) : undefined;
                const eta = dest ? Math.ceil(distance(f, dest) / fleetSpeed(me)) : 0;
                const at = f.starId ?? f.destStarId;
                return (
                  <tr key={f.id} className={`clickable${f.id === selected ? " selected" : ""}`} onClick={() => setSelected(f.id)}>
                    <td>{f.name}</td>
                    <td>{f.starId ? starName(f.starId) : "in transit"}{dest && dest.id !== f.starId && <span className="muted"> → {dest.name} ({eta})</span>}</td>
                    <td>{fleetShips(f)}</td>
                    <td>{fmt(strength(f))}</td>
                    <td className={f.stance === "attack" ? "warn" : ""}><Tip card={STANCE_TIPS[f.stance]}><span className="explained">{words(f.stance)}</span></Tip></td>
                    <td>{at && <button className="small" onClick={(e) => { e.stopPropagation(); onShowStar(at); }}>Map</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel col">
          <h3>Combat doctrine</h3>
          <div className="muted">How your ships fight when you are not giving orders in battle.</div>
          <label className="row">
            Retreat when weaker than {pct(doctrine.retreatBelow)} of the enemy
            <input type="range" min={0} max={1} step={0.05} value={doctrine.retreatBelow} disabled={readOnly}
              onChange={(e) => session.issue({ type: "setDoctrine", doctrine: { ...doctrine, retreatBelow: Number(e.target.value) } })} />
          </label>
          <div className="row">
            Target
            {(["nearest", "weakest", "strongest"] as const).map((f) => (
              <Tip key={f} card={{ title: `Target ${f}`, text: [FOCUS_TIPS[f]] }}>
                <button className={`small${doctrine.focus === f ? " active" : ""}`} disabled={readOnly}
                  onClick={() => session.issue({ type: "setDoctrine", doctrine: { ...doctrine, focus: f } })}>{words(f)}</button>
              </Tip>
            ))}
          </div>
          <small className="muted">{FOCUS_TIPS[doctrine.focus]} When your side's total strength falls below the retreat share of the enemy's, each of your ships there is ordered out on its turn and escapes on its next one; until then it can still be shot or boarded. A ship needs a working drive and some speed to get away, and an enemy Warp Dissipator stops it.</small>
        </div>
      </div>
      {selected && view.fleets[selected] && (
        <div className="panel"><FleetPanel key={selected} fleetId={selected} onSelectFleet={setSelected} /></div>
      )}
    </div>
  );
}
