import { canReach, distance, type Command, type PlayerView, type Star } from "@starlord/sim";
import { strategyOf } from "./strategies.js";
import { hostileFleetsNear, isOnly, me, myFleets, nearest, starById } from "./util.js";

/**
 * Sends idle scouts to an unexplored star in range that no other scout is heading for:
 * the nearest one, the nearest one free of known hostiles (cautious), or the one
 * farthest from home (far reaching).
 */
export function explorationOrders(view: PlayerView): Command[] {
  const player = me(view);
  const strategy = strategyOf(view, "exploration");
  const explored = new Set(player.explored);
  const scouts = myFleets(view).filter((f) => isOnly(view, f, "scout"));
  const claimed = new Set(scouts.map((f) => f.destStarId).filter(Boolean));
  const home = view.galaxy.stars.some((s) => s.id === player.homeStarId) ? starById(view, player.homeStarId) : null;
  const out: Command[] = [];
  for (const f of scouts) {
    if (f.destStarId || !f.starId) continue;
    let options = view.galaxy.stars.filter(
      (s) => !explored.has(s.id) && !claimed.has(s.id) && s.special !== "raiderHome" && canReach(view, view.viewer, f, s.id),
    );
    if (strategy === "cautious") options = options.filter((s) => hostileFleetsNear(view, s, 0.5).length === 0);
    const target = strategy === "farReaching" && home ? farthest(home, options) : nearest(f, options);
    if (!target) continue;
    claimed.add(target.id);
    out.push({ type: "moveFleet", fleetId: f.id, destStarId: target.id });
  }
  return out;
}

function farthest(from: Star, stars: Star[]): Star | undefined {
  let best: Star | undefined;
  for (const s of stars) if (!best || distance(from, s) > distance(from, best)) best = s;
  return best;
}
