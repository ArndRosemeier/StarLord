import {
  availableBuildings, availableDesigns, buyCost, colonyOutput, distanceToNearestColony, fleetRange,
  type BuildItem, type Colony, type Command, type PlayerView,
} from "@starlord/sim";
import { colonizationTargets } from "./colonization.js";
import { isOnly, myColonies, myFleets } from "./util.js";

const BUILDING_PRIORITY = [
  "automatedFactory", "hydroponicFarm", "researchLab", "biospheres", "soilEnrichment",
  "roboticFactory", "supercomputer", "spacePort", "cloningCenter",
];

/** Below this industry a colony isn't worth tying up with a colony ship. */
const COLONY_SHIP_MIN_INDUSTRY = 8;
const MAX_SCOUTS = 2;

export function productionOrders(view: PlayerView): Command[] {
  const me = view.players[view.viewer]!;
  const colonies = myColonies(view);
  const fleets = myFleets(view);
  const designs = new Set(availableDesigns(view, view.viewer));

  const queued = (designId: string) =>
    colonies.reduce((n, c) => n + c.queue.filter((q) => q.kind === "ship" && q.designId === designId).length, 0);
  const owned = (role: "scout" | "colony") =>
    fleets.filter((f) => isOnly(f, role)).reduce((n, f) => n + f.ships.reduce((m, s) => m + s.count, 0), 0);

  let colonyShipsWanted = Math.min(3, colonizationTargets(view).length) - owned("colony") - queued("colonyShip");
  const range = fleetRange(view, view.viewer);
  const unexplored = view.galaxy.stars.some(
    (s) => !me.explored.includes(s.id) && distanceToNearestColony(view, view.viewer, s) <= range,
  );
  let scoutsWanted = unexplored ? MAX_SCOUTS - owned("scout") - queued("scout") : 0;

  const out: Command[] = [];
  let bc = me.bc;
  // Biggest producers pick first so they take the expensive ships.
  const ranked = colonies
    .map((c) => ({ c, out: colonyOutput(view, c) }))
    .sort((a, b) => b.out.industry - a.out.industry);

  for (const { c, out: o } of ranked) {
    const head = c.queue[0];
    if (head && head.kind !== "tradeGoods") {
      // Rush the current item when the treasury is comfortably ahead.
      const cost = buyCost(view, c);
      if (cost > 0 && bc > cost * 2 + 50) {
        bc -= cost;
        out.push({ type: "buy", colonyId: c.id });
      }
      continue;
    }
    const next = chooseItem(view, c, o.industry, {
      colonyShip: colonyShipsWanted > 0 && designs.has("colonyShip"),
      scout: scoutsWanted > 0,
    });
    if (next.kind === "ship" && next.designId === "colonyShip") colonyShipsWanted--;
    if (next.kind === "ship" && next.designId === "scout") scoutsWanted--;
    out.push({ type: "setQueue", colonyId: c.id, queue: [next] });
  }
  return out;
}

function chooseItem(
  view: PlayerView,
  c: Colony,
  industry: number,
  wants: { colonyShip: boolean; scout: boolean },
): BuildItem {
  if (wants.scout) return { kind: "ship", designId: "scout" };
  if (wants.colonyShip && industry >= COLONY_SHIP_MIN_INDUSTRY) return { kind: "ship", designId: "colonyShip" };
  const buildable = new Set(availableBuildings(view, view.viewer, c));
  const building = BUILDING_PRIORITY.find((b) => buildable.has(b));
  if (building) return { kind: "building", id: building };
  return { kind: "tradeGoods" };
}
