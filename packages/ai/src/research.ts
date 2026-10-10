import { TIERS_BY_ID, availableTiers, type Command, type PlayerView } from "@starlord/sim";

/** Techs the AI wants, best first. Anything else is taken in tier order. */
const PRIORITY = [
  "automatedFactory", "hydroponicFarm", "researchLab", "deuteriumFuelCells", "outpostShip",
  "biospheres", "fusionDrive", "soilEnrichment", "roboticFactory", "cloningCenter",
  "supercomputer", "spacePort", "ionDrive", "iridiumFuelCells", "destroyerHull",
];

const rank = (tech: string) => {
  const i = PRIORITY.indexOf(tech);
  return i === -1 ? PRIORITY.length : i;
};

export function researchOrders(view: PlayerView): Command[] {
  const me = view.players[view.viewer]!;
  if (me.research.tierId) return [];
  const tiers = availableTiers(view, view.viewer).map((id) => TIERS_BY_ID[id]!);
  if (tiers.length === 0) return [];
  // Cheapest tier holding the most wanted tech; cost breaks ties.
  const scored = tiers.map((t) => {
    const best = [...t.techs].sort((a, b) => rank(a) - rank(b))[0]!;
    return { t, best, value: rank(best) + t.cost / 100 };
  });
  scored.sort((a, b) => a.value - b.value);
  const pick = scored[0]!;
  return [{ type: "setResearch", tierId: pick.t.id, techId: pick.best }];
}
