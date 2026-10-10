import { canReach, type Command, type PlayerView } from "@starlord/sim";
import { isOnly, me, myFleets, nearest } from "./util.js";

/** Sends idle scouts to the nearest unexplored star in range that no other scout is heading for. */
export function explorationOrders(view: PlayerView): Command[] {
  const player = me(view);
  const explored = new Set(player.explored);
  const scouts = myFleets(view).filter((f) => isOnly(view, f, "scout"));
  const claimed = new Set(scouts.map((f) => f.destStarId).filter(Boolean));
  const out: Command[] = [];
  for (const f of scouts) {
    if (f.destStarId || !f.starId) continue;
    const options = view.galaxy.stars.filter(
      (s) => !explored.has(s.id) && !claimed.has(s.id) && s.special !== "raiderHome" && canReach(view, view.viewer, f, s.id),
    );
    const target = nearest(f, options);
    if (!target) continue;
    claimed.add(target.id);
    out.push({ type: "moveFleet", fleetId: f.id, destStarId: target.id });
  }
  return out;
}
