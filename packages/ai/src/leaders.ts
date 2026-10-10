import { LEADER_RULES, colonyOutput, hirePrice, type Command, type Leader, type PlayerView } from "@starlord/sim";
import { colonyStar, fleetStrength, me, myColonies, myFleets } from "./util.js";

/** Hires leaders it can comfortably afford and puts them where they help most. */
export function leaderOrders(view: PlayerView): Command[] {
  const player = me(view);
  const out: Command[] = [];
  const all = Object.values(view.leaders);
  const hired = all.filter((l) => l.status === "hired" && l.ownerId === view.viewer);
  const ofKind = (k: Leader["kind"]) => hired.filter((l) => l.kind === k).length;
  // Best offer first: the most able (highest price) leader whose upkeep the treasury can carry.
  const offers = all
    .filter((l) => l.status === "offered" && l.offeredTo === view.viewer)
    .sort((a, b) => b.level - a.level || b.hireCost - a.hireCost || (a.id < b.id ? -1 : 1));
  const offer = offers.find((l) => ofKind(l.kind) < LEADER_RULES.maxPerKind);
  if (offer && hired.length < LEADER_RULES.maxTotal && player.bc > hirePrice(view, view.viewer, offer) * 2 + 100 + Math.max(0, offer.salary) * 20) {
    out.push({ type: "hireLeader", leaderId: offer.id });
  }
  const systems = myColonies(view)
    .map((c) => ({ star: colonyStar(view, c).id, value: colonyOutput(view, c).industry + colonyOutput(view, c).research }))
    .sort((a, b) => b.value - a.value);
  const fleets = myFleets(view).sort((a, b) => fleetStrength(view, b) - fleetStrength(view, a));
  const taken = new Set(hired.map((l) => l.travel?.to ?? l.assignedTo).filter(Boolean));
  for (const l of hired) {
    if (l.assignedTo || l.travel) continue;
    const target = l.kind === "administrator"
      ? systems.find((s) => !taken.has(s.star))?.star
      : fleets.find((f) => !taken.has(f.id) && fleetStrength(view, f) > 0 && f.starId && !f.destStarId)?.id;
    if (target) {
      taken.add(target);
      out.push({ type: "assignLeader", leaderId: l.id, targetId: target });
    }
  }
  return out;
}
