import {
  MAX_QUEUE, colonyOutput, designStats, findDesign, refitCost, refitDocks, refitTargets, refitTurns, refittable,
  type Command, type PlayerView,
} from "@starlord/sim";
import { hostileFleetsNear, me, myColonies, myFleets } from "./util.js";

/** A refit must make the ship at least this much stronger... */
const MIN_GAIN = 1.25;
/** ...cost at most this share of building the new design outright... */
const MAX_COST_SHARE = 0.75;
/** ...and be done within this many turns at the colony. */
const MAX_TURNS = 6;
/** Refit jobs one colony takes at a time, and per this many colonies across the empire. */
const PER_COLONY = 2;
const COLONIES_PER_JOB = 2;
/** Hostile warships this close keep ships out of dock. */
const THREAT_RADIUS = 6;

/**
 * Refits outdated warships when it pays: ships of an obsolete design idle at a
 * system with a colony that can take the job get rebuilt to the strongest
 * current design of their hull, when that is clearly stronger, much cheaper
 * than a new ship and done soon. Never with enemies close by.
 */
export function refitOrders(view: PlayerView): Command[] {
  const player = me(view);
  const colonies = myColonies(view);
  const jobsAt = new Map<string, number>();
  // Jobs ordered this turn, which the colonies' queues don't show yet.
  const added = new Map<string, number>();
  let jobs = 0;
  for (const c of colonies) {
    const n = c.queue.filter((q) => q.kind === "refit").length;
    jobsAt.set(c.id, n);
    jobs += n;
  }
  let room = Math.max(1, Math.floor(colonies.length / COLONIES_PER_JOB)) - jobs;
  const out: Command[] = [];
  for (const f of myFleets(view)) {
    if (room <= 0) break;
    if (!f.starId || f.destStarId) continue;
    const star = view.galaxy.stars.find((s) => s.id === f.starId);
    if (!star || hostileFleetsNear(view, star, THREAT_RADIUS).length > 0) continue;
    for (const s of f.ships) {
      if (room <= 0) break;
      const from = findDesign(player, s.designId);
      if (!refittable(from) || !from.obsolete || from.weapons.length === 0) continue;
      const before = designStats(player, from).strength;
      const target = refitTargets(view, view.viewer, from.id)
        .filter((d) => d.weapons.length > 0)
        .map((d) => ({ d, stats: designStats(player, d) }))
        .sort((a, b) => b.stats.strength - a.stats.strength)[0];
      if (!target || target.stats.strength < before * MIN_GAIN) continue;
      const cost = refitCost(player, from, target.d);
      if (cost > target.stats.cost * MAX_COST_SHARE) continue;
      const dock = refitDocks(view, view.viewer, f.starId, target.d)
        .filter((c) => (jobsAt.get(c.id) ?? 0) < PER_COLONY && c.queue.length + (added.get(c.id) ?? 0) < MAX_QUEUE)
        .sort((a, b) => colonyOutput(view, b).industry - colonyOutput(view, a).industry)[0];
      if (!dock) continue;
      const turns = refitTurns(view, dock, cost);
      if (turns === null || turns > MAX_TURNS) continue;
      const count = Math.min(s.count, room, PER_COLONY - (jobsAt.get(dock.id) ?? 0), MAX_QUEUE - dock.queue.length - (added.get(dock.id) ?? 0));
      if (count <= 0) continue;
      out.push({ type: "refitShips", fleetId: f.id, designId: from.id, toDesignId: target.d.id, colonyId: dock.id, count });
      jobsAt.set(dock.id, (jobsAt.get(dock.id) ?? 0) + count);
      added.set(dock.id, (added.get(dock.id) ?? 0) + count);
      room -= count;
    }
  }
  return out;
}
