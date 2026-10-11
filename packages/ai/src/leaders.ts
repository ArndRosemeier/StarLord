import { LEADER_RULES, colonyOutput, hirePrice, type Command, type Leader, type PlayerView } from "@starlord/sim";
import { strategyOf } from "./strategies.js";
import { colonyStar, fleetStrength, me, myColonies, myFleets } from "./util.js";

/** What the treasury must hold to hire: the hire price times `price`, plus `reserve`, plus `salaryTurns` of salary. */
const THRIFT: Record<string, { price: number; reserve: number; salaryTurns: number }> = {
  balanced: { price: 2, reserve: 100, salaryTurns: 20 },
  thrifty: { price: 4, reserve: 300, salaryTurns: 40 },
  eager: { price: 1, reserve: 20, salaryTurns: 5 },
};

/** Hires leaders it can comfortably afford (how comfortably depends on the strategy) and puts them where they help most. */
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
  const t = THRIFT[strategyOf(view, "leaders")] ?? THRIFT.balanced!;
  if (offer && hired.length < LEADER_RULES.maxTotal && player.bc > hirePrice(view, view.viewer, offer) * t.price + t.reserve + Math.max(0, offer.salary) * t.salaryTurns) {
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
