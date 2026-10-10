import {
  availableBuildings, availableDesigns, availableProjects, buyCost, colonyOutput, commandPointsAvailable,
  commandPointsUsed, empireIncome, empireTotals, planetDefense, relation, type BuildItem, type Colony, type Command,
  type PlayerView,
} from "@starlord/sim";
import { colonizationTargets, outpostTargets } from "./colonization.js";
import { currentWarship } from "./design.js";
import { colonyStar, hostileFleetsNear, isOnly, me, myColonies, myFleets } from "./util.js";

const ECONOMY_BUILDINGS = [
  "automatedFactory", "hydroponicFarm", "researchLab", "biospheres", "spacePort", "soilEnrichment", "cloningCenter",
  "roboMinerPlant", "pollutionProcessor", "supercomputer", "planetaryStockExchange", "holoSimulator", "subterraneanFarms",
  "astroUniversity", "roboticFactory", "atmosphericRenewer", "recyclotron", "autolab", "galacticCybernet",
  "weatherController", "gravityGenerator", "alienManagementCenter", "spaceAcademy", "securityStations",
];
const DEFENSE_BUILDINGS = [
  "marineBarracks", "starBase", "missileBase", "radiationShield", "battlestation", "groundBatteries", "armorBarracks",
  "fluxShield", "starFortress", "barrierShield", "artemisSystemNet",
];

/** Below this industry a colony isn't worth tying up with a colony ship. */
const COLONY_SHIP_MIN_INDUSTRY = 8;
const MAX_SCOUTS = 2;

interface Wants {
  colonyShips: number;
  outposts: number;
  scouts: number;
  warships: number;
  transports: number;
  spies: number;
  portalQueued: boolean;
}

export function atWar(view: PlayerView): boolean {
  const player = me(view);
  return player.contacts.some((id) => relation(view, view.viewer, id).status === "war");
}

export function productionOrders(view: PlayerView): Command[] {
  const player = me(view);
  const colonies = myColonies(view);
  const fleets = myFleets(view);
  const designs = new Set(availableDesigns(view, view.viewer));
  const totals = empireTotals(view, view.viewer);

  const queued = (pred: (q: BuildItem) => boolean) => colonies.reduce((n, c) => n + c.queue.filter(pred).length, 0);
  const owned = (role: "scout" | "colony" | "outpost" | "transport") =>
    fleets.filter((f) => isOnly(view, f, role)).reduce((n, f) => n + f.ships.reduce((m, s) => m + s.count, 0), 0);
  const shipQueued = (id: string) => queued((q) => q.kind === "ship" && q.designId === id);

  const wants: Wants = {
    portalQueued: false,
    colonyShips: Math.min(3, colonizationTargets(view).length) - owned("colony") - shipQueued("colonyShip"),
    outposts: designs.has("outpostShip") ? Math.min(2, outpostTargets(view).length) - owned("outpost") - shipQueued("outpostShip") : 0,
    scouts: unexploredInReach(view) ? MAX_SCOUTS - owned("scout") - shipQueued("scout") : 0,
    warships: 0,
    transports: 0,
    spies: Math.ceil(colonies.length / 4) + (atWar(view) ? 1 : 0) - player.spies.home - Object.values(player.spies.abroad).reduce((n, s) => n + s.count, 0) - queued((q) => q.kind === "project" && q.id === "spy"),
  };
  const cpFree = commandPointsAvailable(view, view.viewer) - commandPointsUsed(view, view.viewer);
  const war = atWar(view);
  const warship = currentWarship(view);
  const queuedWar = warship ? shipQueued(warship) : 0;
  // Peacetime: fill command points. Wartime: build past them while the treasury holds.
  const income = empireIncome(view, view.viewer);
  // Peacetime: a modest fleet. Wartime: fill command points, and go over only while income can carry it.
  const overBudget = Math.max(0, Math.floor((income.net - 10) / 10));
  // Peacetime fleets grow with the economy so late-game industry isn't all turned into BC.
  const peaceTarget = Math.min(cpFree + Math.floor(overBudget / 2), Math.ceil(colonies.length / 2) + Math.floor(totals.industry / 60));
  wants.warships = Math.max(0, (war ? cpFree + overBudget : peaceTarget) - queuedWar);
  wants.transports = war ? Math.max(0, 4 - owned("transport") - shipQueued("transport")) : 0;

  const out: Command[] = [];
  // Taxes: raise them while the books are red, lower them once the treasury is healthy.
  const tax = income.net < 0 || player.bc < 30 ? Math.min(0.5, player.taxRate + 0.1) : player.bc > 300 && player.taxRate > 0 ? player.taxRate - 0.1 : player.taxRate;
  if (Math.abs(tax - player.taxRate) > 1e-9) out.push({ type: "setTaxRate", rate: Math.round(tax * 10) / 10 });
  let bc = player.bc;
  const ranked = colonies
    .map((c) => ({ c, out: colonyOutput(view, c) }))
    .sort((a, b) => b.out.industry - a.out.industry);

  for (const [rank, { c, out: o }] of ranked.entries()) {
    const head = c.queue[0];
    if (head && head.kind !== "tradeGoods" && !(head.kind === "project" && head.id === "housing")) {
      // Rush the current item when the treasury is comfortably ahead.
      const cost = buyCost(view, c);
      if (Number.isFinite(cost) && cost > 0 && bc > cost * 2 + 100 && income.net > 0) {
        bc -= cost;
        out.push({ type: "buy", colonyId: c.id });
      }
      continue;
    }
    const next = chooseItem(view, c, o.industry, rank, wants, designs, war, totals.food, player.bc > 1000 && income.net > 20);
    out.push({ type: "setQueue", colonyId: c.id, queue: [next] });
  }
  return out;
}

function unexploredInReach(view: PlayerView): boolean {
  const player = me(view);
  return view.galaxy.stars.some((s) => !player.explored.includes(s.id) && s.special !== "raiderHome");
}

function chooseItem(
  view: PlayerView,
  c: Colony,
  industry: number,
  rank: number,
  wants: Wants,
  designs: Set<string>,
  war: boolean,
  food: number,
  rich: boolean,
): BuildItem {
  const buildable = new Set(availableBuildings(view, view.viewer, c));
  const projects = new Set(availableProjects(view, view.viewer, c));
  const star = colonyStar(view, c);
  const threatened = hostileFleetsNear(view, star, 4).length > 0;
  const pop = c.farmers + c.workers + c.scientists;
  const ship = (designId: string): BuildItem => ({ kind: "ship", designId });

  if (threatened || (war && rank < 3)) {
    const d = DEFENSE_BUILDINGS.find((b) => buildable.has(b));
    if (d && planetDefense(c).hits < 150) return { kind: "building", id: d };
  }
  if (wants.scouts > 0 && designs.has("scout")) {
    wants.scouts--;
    return ship("scout");
  }
  if (wants.colonyShips > 0 && designs.has("colonyShip") && industry >= COLONY_SHIP_MIN_INDUSTRY) {
    wants.colonyShips--;
    return ship("colonyShip");
  }
  if (projects.has("colonyBase") && industry >= 6) return { kind: "project", id: "colonyBase" };
  if (wants.outposts > 0 && designs.has("outpostShip") && industry >= 5) {
    wants.outposts--;
    return ship("outpostShip");
  }
  if (food < 0 && buildable.has("hydroponicFarm")) return { kind: "building", id: "hydroponicFarm" };
  const warship = currentWarship(view);
  if (war && warship && wants.warships > 0 && rank < 3 && industry >= 10) {
    wants.warships--;
    return ship(warship);
  }
  if (war && wants.transports > 0 && rank < 2 && designs.has("transport")) {
    wants.transports--;
    return ship("transport");
  }
  // Small colonies only build what pays off quickly.
  const economy = ECONOMY_BUILDINGS.filter((b) => buildable.has(b)).filter((b) => pop >= 4 || ["automatedFactory", "hydroponicFarm", "biospheres", "cloningCenter", "researchLab"].includes(b));
  if (economy.length > 0) return { kind: "building", id: economy[0]! };
  if (wants.spies > 0) {
    wants.spies--;
    return { kind: "project", id: "spy" };
  }
  if (warship && wants.warships > 0 && industry >= 10) {
    wants.warships--;
    return ship(warship);
  }
  if (projects.has("dimensionalPortal") && industry >= 40 && !wants.portalQueued) {
    wants.portalQueued = true;
    return { kind: "project", id: "dimensionalPortal" };
  }
  if (projects.has("gaiaTransform") && industry >= 20) return { kind: "project", id: "gaiaTransform" };
  if (projects.has("terraform") && industry >= 20 && c.terraformed < 3) return { kind: "project", id: "terraform" };
  if (projects.has("artificialPlanet") && industry >= 30) return { kind: "project", id: "artificialPlanet" };
  const defense = DEFENSE_BUILDINGS.find((b) => buildable.has(b));
  if (defense && industry >= 25) return { kind: "building", id: defense };
  if (pop < 6) return { kind: "project", id: "housing" };
  // A rich empire with nothing left to build keeps its fleet growing rather than hoarding BC.
  if (warship && rich && industry >= 10) return ship(warship);
  return { kind: "tradeGoods" };
}
