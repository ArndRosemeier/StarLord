import { useMemo, useState } from "react";
import { CLIMATES, INDUSTRY_PER_WORKER, SIZE_FACTOR, fleetRange, fleetSpeed, getRace, gravityMultiplier } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { climateName, fmt, words } from "../ui/format";
import { PlanetIcon } from "../ui/panels";
import { Tip } from "../ui/Tip";
import { climateTip, fuelRangeTip, gravityTip, maxPopTip, mineralsTip, sizeTip, specialTip } from "../ui/explain";
import { SortTh, sortRows, useSort, type SortValue } from "../ui/sort";
import { planetRows, type Dispatch, type PlanetRow } from "../game/planets";
import { colonizeCommand } from "../game/colonize";

type PlanetSortKey = "name" | "size" | "climate" | "minerals" | "gravity" | "special" | "maxPop" | "distance" | "owner";
type Show = "settle" | "colony" | "outpost" | "all";

const SHOW_LABELS: Record<Show, string> = {
  settle: "Free to settle",
  colony: "Colony targets",
  outpost: "Outpost targets",
  all: "All known planets",
};

const SHOW_KEY = "starlord.planets.show";
const RANGE_KEY = "starlord.planets.inRange";
function load(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
}

/** Every known planet, MoO2-style: what it is, how far it is, whether ships reach it, and a quick way to settle it. */
export function PlanetsScreen({ onShowStar }: { onShowStar: (starId: string) => void }) {
  const { session, view, me, readOnly } = useGame();
  const race = getRace(me.raceId);
  const [show, setShowState] = useState<Show>(() => {
    const s = load(SHOW_KEY);
    return s && s in SHOW_LABELS ? (s as Show) : "settle";
  });
  const [inRangeOnly, setInRangeState] = useState(() => load(RANGE_KEY) === "1");
  const [search, setSearch] = useState("");
  const setShow = (s: Show) => { setShowState(s); save(SHOW_KEY, s); };
  const setInRangeOnly = (on: boolean) => { setInRangeState(on); save(RANGE_KEY, on ? "1" : "0"); };
  const { sort, toggle } = useSort<PlanetSortKey>("maxPop", "desc",
    (k) => (["name", "climate", "special", "distance", "owner"].includes(k) ? "asc" : "desc"));

  const rows = useMemo(() => planetRows(view), [view]);
  const filtered = rows.filter((r) => {
    if (show === "settle" && !r.colonizable && !r.outpostable) return false;
    if (show === "colony" && !r.colonizable) return false;
    if (show === "outpost" && !r.outpostable) return false;
    if (inRangeOnly && !r.inRange) return false;
    const q = search.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.star.name.toLowerCase().includes(q) || climateName(r.planet.type).toLowerCase().includes(q);
  });
  const sorted = sortRows(filtered, sort, (r, k): SortValue => {
    switch (k) {
      case "name": return r.name;
      case "size": return SIZE_FACTOR[r.planet.size];
      case "climate": return climateName(r.planet.type);
      case "minerals": return INDUSTRY_PER_WORKER[r.planet.minerals];
      case "gravity": return gravityMultiplier(race, r.planet.gravity);
      case "special": return r.planet.special === "none" ? null : words(r.planet.special);
      case "maxPop": return r.maxPop || null;
      case "distance": return r.distance;
      case "owner": return r.owner ? (r.owner.id === me.id ? " " : r.owner.name) : null;
    }
  });
  const free = rows.filter((r) => r.colonizable || r.outpostable);

  return (
    <div className="panel col planets-screen">
      <div className="row">
        <h2 style={{ margin: 0 }}>Planets</h2>
        <span className="muted">{rows.length} known · {free.length} free to settle · {free.filter((r) => r.inRange).length} of them in range</span>
        <span className="spacer" />
        <Tip card={fuelRangeTip(me)}><span className="chip explained">Fuel range {fleetRange(me)} pc</span></Tip>
        <Tip card={{ title: "Ship speed", kind: `${fleetSpeed(me)} parsecs a turn`, text: ["The best drive you know, plus racial bonuses. The Turns column uses it, before nebulae, gates and leaders."] }}>
          <span className="chip explained">Speed {fleetSpeed(me)} pc/turn</span>
        </Tip>
      </div>
      <div className="row planets-filters">
        <div className="row" style={{ gap: 4 }} role="group" aria-label="Which planets to list">
          {(Object.keys(SHOW_LABELS) as Show[]).map((s) => (
            <button key={s} className={`small${show === s ? " active" : ""}`} aria-pressed={show === s} onClick={() => setShow(s)}
              title={s === "settle" ? "Free planets a colony or outpost ship could settle" : s === "colony" ? "Free planets your race can live on" : s === "outpost" ? "Free planets an outpost ship can claim" : "Every planet in the systems you have explored, settled or not"}>
              {SHOW_LABELS[s]}
            </button>
          ))}
        </div>
        <label className="row" style={{ gap: 4 }} title="Hide planets your ships cannot reach with today's fuel range">
          <input type="checkbox" checked={inRangeOnly} onChange={(e) => setInRangeOnly(e.target.checked)} /> In fuel range only
        </label>
        <input type="text" placeholder="Filter by name or climate" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />
        <span className="muted">{sorted.length} shown</span>
      </div>
      <div className="planets-table-wrap">
        <table className="planets-table">
          <thead>
            <tr>
              <SortTh k="name" sort={sort} onSort={toggle}>Planet</SortTh>
              <SortTh k="size" sort={sort} onSort={toggle}>Size</SortTh>
              <SortTh k="climate" sort={sort} onSort={toggle}>Climate</SortTh>
              <SortTh k="minerals" sort={sort} onSort={toggle}>Minerals</SortTh>
              <SortTh k="gravity" sort={sort} onSort={toggle}>Gravity</SortTh>
              <SortTh k="special" sort={sort} onSort={toggle}>Special</SortTh>
              <SortTh k="maxPop" sort={sort} onSort={toggle} title={`Most ${race.plural} it holds with today's technology; click to sort`}>Max pop</SortTh>
              <SortTh k="distance" sort={sort} onSort={toggle} title="Parsecs and turns from your nearest colony or outpost, and whether it is in fuel range; click to sort">Distance</SortTh>
              <SortTh k="owner" sort={sort} onSort={toggle}>Owner</SortTh>
              {!readOnly && <th>Settle</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.planet.id} className="clickable" onClick={() => onShowStar(r.star.id)} title={`Show ${r.star.name} on the galaxy map`}>
                <td>
                  <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <PlanetIcon planet={r.planet} size={20} />
                    <span>{r.name}</span>
                    {r.guarded && <Tip card={{ title: "Guarded", text: ["Monsters or raiders hold this system. Settling is refused until they are destroyed or leave."] }}><span className="chip bad">guarded</span></Tip>}
                  </span>
                </td>
                <td><Tip card={sizeTip(r.planet)}><span className="explained">{words(r.planet.size)}</span></Tip></td>
                <td><Tip card={climateTip(r.planet)}><span className={`explained${CLIMATES[r.planet.type].hostile ? " warn" : ""}`}>{climateName(r.planet.type)}</span></Tip></td>
                <td><Tip card={mineralsTip(r.planet)}><span className="explained">{words(r.planet.minerals)}</span></Tip></td>
                <td><Tip card={gravityTip(r.planet, me.raceId)}><span className={`explained${gravityMultiplier(race, r.planet.gravity) < 1 ? " warn" : ""}`}>{words(r.planet.gravity)}</span></Tip></td>
                <td>{specialTip(r.planet) ? <Tip card={specialTip(r.planet)}><span className="chip warn">{words(r.planet.special)}</span></Tip> : <span className="muted">–</span>}</td>
                <td><Tip card={maxPopTip(r.planet, me)}><span className="explained">{r.maxPop || "–"}</span></Tip></td>
                <td className="wrap">
                  {Number.isFinite(r.distance)
                    ? r.distance === 0 ? <span className="muted">your system</span> : <>{fmt(r.distance, 1)} pc <small className="muted">· {r.turns} turn{r.turns === 1 ? "" : "s"}</small></>
                    : <span className="muted">–</span>}
                  {!r.inRange && <> <Tip card={fuelRangeTip(me)}><span className="chip bad out-of-range">out of range</span></Tip></>}
                </td>
                <td>{r.owner
                  ? <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}><span className="dot" style={{ background: r.owner.color }} />{r.owner.id === me.id ? "You" : r.owner.name}{r.colony?.outpost && <small className="muted">outpost</small>}</span>
                  : <span className="muted">free</span>}</td>
                {!readOnly && <td className="wrap" onClick={(e) => e.stopPropagation()}><SettleActions row={r} onSend={(d) => session.issue({ type: "moveFleet", fleetId: d.fleetId, destStarId: r.star.id })}
                  onSettle={() => r.here && session.issue(colonizeCommand(r.planet.id, r.here))} /></td>}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={readOnly ? 9 : 10} className="muted">
                {rows.length === 0 ? "No planets known yet. Send scouts to explore." : "No planets match. Try another filter, or explore further."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Settle now with a ship in orbit, or send the nearest idle colony / outpost ship. */
function SettleActions({ row, onSend, onSettle }: { row: PlanetRow; onSend: (d: Dispatch) => void; onSettle: (fleetId: string) => void }) {
  if (!row.colonizable && !row.outpostable) return null;
  const sendTitle = (d: Dispatch, what: string) =>
    `${d.fleetName} flies there with its ${what}, arriving in ${d.turns} turn${d.turns === 1 ? "" : "s"}${d.escorts > 0 ? `; the whole fleet goes, ${d.escorts} more ship${d.escorts === 1 ? "" : "s"} with it` : ""}. Orders take effect when you end the turn.`;
  return (
    <div className="row" style={{ gap: 4 }}>
      {row.here && (
        <button className="small primary" disabled={!!row.here.blocked}
          title={row.here.blocked ? `Can't settle: ${row.here.blocked}.` : `${row.here.fleetName} settles this planet when you end the turn.`}
          onClick={() => onSettle(row.here!.fleetId)}>
          {row.here.outpost ? "Outpost" : "Colonize"}
        </button>
      )}
      {!row.here && row.enRoute && (
        <small className="muted" title={`${row.enRoute.fleetName} is already flying there.`}>en route ({row.enRoute.turns})</small>
      )}
      {!row.here && !row.enRoute && row.sendColony && (
        <button className="small" title={sendTitle(row.sendColony, "colony ship")} onClick={() => onSend(row.sendColony!)}>
          Send colony ({row.sendColony.turns})
        </button>
      )}
      {!row.here && !row.enRoute && row.sendOutpost && (!row.sendColony || row.sendOutpost.fleetId !== row.sendColony.fleetId) && (
        <button className="small" title={sendTitle(row.sendOutpost, "outpost ship")} onClick={() => onSend(row.sendOutpost!)}>
          Send outpost ({row.sendOutpost.turns})
        </button>
      )}
      {!row.here && !row.enRoute && !row.sendColony && !row.sendOutpost && (
        <small className="muted" title="Build a colony or outpost ship, or move one closer: none that is idle can reach this planet.">no ship</small>
      )}
    </div>
  );
}
