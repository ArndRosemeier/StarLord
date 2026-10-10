import { distanceToNearestColony, fleetRange, type Command, type PlayerView } from "@starlord/sim";
import { isOnly, myFleets, nearest } from "./util.js";

/** Sends idle scouts to the nearest unexplored star in range that no other scout is heading for. */
export function explorationOrders(view: PlayerView): Command[] {
  const me = view.players[view.viewer]!;
  const explored = new Set(me.explored);
  const range = fleetRange(view, view.viewer);
  const scouts = myFleets(view).filter((f) => isOnly(f, "scout"));
  const claimed = new Set(scouts.map((f) => f.destStarId).filter(Boolean));
  const out: Command[] = [];
  for (const f of scouts) {
    if (f.destStarId) continue;
    const options = view.galaxy.stars.filter(
      (s) => !explored.has(s.id) && !claimed.has(s.id) && distanceToNearestColony(view, view.viewer, s) <= range,
    );
    const target = nearest(f, options);
    if (!target) continue;
    claimed.add(target.id);
    out.push({ type: "moveFleet", fleetId: f.id, destStarId: target.id });
  }
  return out;
}
