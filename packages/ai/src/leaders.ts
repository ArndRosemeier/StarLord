import { colonyOutput, type Command, type PlayerView } from "@starlord/sim";
import { colonyStar, fleetStrength, me, myColonies, myFleets } from "./util.js";

/** Hires leaders it can comfortably afford and puts them where they help most. */
export function leaderOrders(view: PlayerView): Command[] {
  const player = me(view);
  const out: Command[] = [];
  const hired = Object.values(view.leaders).filter((l) => l.ownerId === view.viewer);
  const offer = [...player.leaderOffers].sort((a, b) => b.level - a.level)[0];
  if (offer && player.bc > offer.hireCost * 3 + 200 && hired.length < 4) {
    out.push({ type: "hireLeader", leaderId: offer.id });
  }
  const systems = myColonies(view)
    .map((c) => ({ star: colonyStar(view, c).id, value: colonyOutput(view, c).industry + colonyOutput(view, c).research }))
    .sort((a, b) => b.value - a.value);
  const fleets = myFleets(view).sort((a, b) => fleetStrength(view, b) - fleetStrength(view, a));
  const taken = new Set(hired.map((l) => l.assignedTo).filter(Boolean));
  for (const l of hired) {
    if (l.assignedTo) continue;
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
