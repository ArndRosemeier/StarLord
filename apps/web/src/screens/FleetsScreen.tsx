import { Tip } from "../ui/Tip";
import { FOCUS_TIPS, STANCE_TIPS } from "../ui/explain";
import { useState } from "react";
import { FREIGHTERS, PROJECT_COSTS, designStats, findDesign, foodPlan, movementHalted, travelTurns, type Fleet } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, pct, words } from "../ui/format";
import { FleetPanel, fleetShips } from "../ui/panels";
import { SortTh, sortRows, useSort, type SortValue } from "../ui/sort";

type FleetSortKey = "name" | "where" | "ships" | "strength" | "stance";

export function FleetsScreen({ onShowStar }: { onShowStar: (starId: string) => void }) {
  const { session, view, me, readOnly } = useGame();
  const fleets = Object.values(view.fleets).filter((f) => f.ownerId === me.id);
  const [selected, setSelected] = useState<string | null>(fleets[0]?.id ?? null);
  const starName = (id: string | null) => view.galaxy.stars.find((s) => s.id === id)?.name ?? "";
  const strength = (f: Fleet) => f.ships.reduce((n, s) => {
    const d = findDesign(me, s.designId);
    return n + (d ? designStats(me, d).strength * s.count : 0);
  }, 0);
  const { sort, toggle } = useSort<FleetSortKey>("name", "asc", (k) => (k === "ships" || k === "strength" ? "desc" : "asc"));
  const sorted = sortRows(fleets, sort, (f, k): SortValue => {
    switch (k) {
      case "name": return f.name;
      case "where": return f.starId ? starName(f.starId) : `~${starName(f.destStarId)}`;
      case "ships": return fleetShips(f);
      case "strength": return strength(f);
      case "stance": return f.stance;
    }
  });
  const doctrine = me.doctrine;
  const food = foodPlan(view, me.id);
  const starving = Object.keys(food.shortfall).length;
  const freighterTip = {
    title: "Freighters",
    kind: "Unarmed transports, never in battle",
    rows: [
      ["Owned", fmt(food.freighters)],
      ["Carrying food", `${fmt(food.carryingFood)} (${fmt(food.delivered, 1)} of ${fmt(food.needed, 1)} food needed)`],
      ["Moving colonists", fmt(food.movingColonists)],
      ["Idle", fmt(food.free)],
      ["Upkeep now", `${fmt(food.upkeep, 1)} BC/turn`],
    ] as [string, string][],
    text: [
      `Each freighter carries ${FREIGHTERS.foodPerShip} food a turn from colonies with surplus to hungry ones; moving 1 population ties up ${FREIGHTERS.perColonist} freighters until it arrives.`,
      `Each one in use costs ${FREIGHTERS.upkeepInUse} BC a turn; idle freighters cost nothing. Blockaded systems neither send nor receive food.`,
      `Build more as a Freighter Fleet (${FREIGHTERS.perFleet} freighters, ${PROJECT_COSTS.freighterFleet} production) at any colony once you know Freighters.`,
    ],
  };

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(420px, 1.3fr) minmax(340px, 1fr)" }}>
      <div className="col">
        <div className="panel scroll">
          <h2>Fleets</h2>
          <table>
            <thead><tr>
              <SortTh k="name" sort={sort} onSort={toggle}>Fleet</SortTh>
              <SortTh k="where" sort={sort} onSort={toggle}>Where</SortTh>
              <SortTh k="ships" sort={sort} onSort={toggle}>Ships</SortTh>
              <SortTh k="strength" sort={sort} onSort={toggle}>Strength</SortTh>
              <SortTh k="stance" sort={sort} onSort={toggle}>Stance</SortTh>
              <th />
            </tr></thead>
            <tbody>
              {sorted.map((f) => {
                const dest = f.destStarId ? view.galaxy.stars.find((s) => s.id === f.destStarId) : undefined;
                const eta = dest ? travelTurns(view, f, dest.id) : 0;
                const held = !!dest && movementHalted(view, f);
                const at = f.starId ?? f.destStarId;
                return (
                  <tr key={f.id} className={`clickable${f.id === selected ? " selected" : ""}`} onClick={() => setSelected(f.id)}>
                    <td>{f.name}</td>
                    <td>{f.starId ? starName(f.starId) : "in transit"}{dest && dest.id !== f.starId && <span className="muted"> → {dest.name} ({held ? "held by hyperspace flux" : eta})</span>}</td>
                    <td>{fleetShips(f)}</td>
                    <td>{fmt(strength(f))}</td>
                    <td className={f.stance === "attack" ? "warn" : ""}><Tip card={STANCE_TIPS[f.stance]}><span className="explained">{words(f.stance)}</span></Tip></td>
                    <td>{at && <button className="small" onClick={(e) => { e.stopPropagation(); onShowStar(at); }}>Map</button>}</td>
                  </tr>
                );
              })}
              <tr className="freighters">
                <td><Tip card={freighterTip}><span className="explained">Freighters</span></Tip></td>
                <td className="muted">between your colonies</td>
                <td>{fmt(food.freighters)}</td>
                <td className="muted">unarmed</td>
                <td colSpan={2}>
                  <small>{food.carryingFood} carrying {fmt(food.delivered, 1)} food, {food.movingColonists} moving colonists, {food.free} idle</small>
                  {starving > 0 && <div className="bad"><small>{starving} {starving === 1 ? "colony is" : "colonies are"} short of food by {fmt(food.needed - food.delivered, 1)}</small></div>}
                  {food.free > 0 && !readOnly && (
                    <button className="small" style={{ marginLeft: 8 }} onClick={() => session.issue({ type: "scrapFreighters", count: food.free })}>Scrap idle</button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="panel col">
          <h3>Combat doctrine</h3>
          <div className="muted">How your ships fight when you are not giving orders in battle.</div>
          <label className="row">
            <input type="checkbox" checked={!me.autoBattles} disabled={readOnly} onChange={(e) => session.issue({ type: "setAutoBattles", on: !e.target.checked })} />
            Command my battles: the turn stops at each battle and I choose to fight it myself or auto-resolve it
          </label>
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
