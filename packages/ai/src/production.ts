import {
  BUILDINGS_BY_ID, STATION_DOCK_HULLS, availableBuildings, availableDesigns, availableProjects, baseTargets, buyCost, colonyOutput, commandPointsAvailable,
  distanceToNearestColony, fleetRange,
  commandPointsUsed, COMMAND_OVERAGE_COST, empireIncome, HULLS_BY_ID, TAX_BC_PER_INDUSTRY, empireTotals, foodPlan, FREIGHTERS, government, hasArmedDefenses, hasMarineBarracks, hasStarDock, queuedAnywhere, relation, suggestedBaseTarget,
  type BuildItem, type Colony, type Command, type PlayerView,
} from "@starlord/sim";
import { colonizationTargets, outpostTargets } from "./colonization.js";
import { canBuildInTime, currentWarship } from "./design.js";
import { refitOrders } from "./refit.js";
import { strategyOf } from "./strategies.js";
import { colonyStar, hostileFleetsNear, isOnly, me, myColonies, myFleets } from "./util.js";

const ECONOMY_BUILDINGS = [
  "automatedFactory", "hydroponicFarm", "researchLab", "biospheres", "spacePort", "soilEnrichment", "cloningCenter",
  "roboMinerPlant", "pollutionProcessor", "supercomputer", "planetaryStockExchange", "holoSimulator", "subterraneanFarms",
  "astroUniversity", "roboticFactory", "deepCoreMining", "atmosphericRenewer", "recyclotron", "autolab",
  "galacticCybernet", "weatherController", "gravityGenerator", "pleasureDome",
  "coreWasteDumps", "alienManagementCenter",
];
/** Buildings that pay for themselves in industry, built even when upkeep is tight. */
const INDUSTRY_BUILDINGS = new Set(["automatedFactory", "roboMinerPlant", "roboticFactory", "deepCoreMining", "recyclotron", "pollutionProcessor"]);
/** Farm buildings only pay where people farm. */
const FARM_BUILDINGS = new Set(["hydroponicFarm", "soilEnrichment", "subterraneanFarms", "weatherController"]);
/** Worth building on small colonies too. */
const CHEAP_BUILDINGS = ["automatedFactory", "hydroponicFarm", "biospheres", "cloningCenter", "researchLab"];
const DEFENSE_BUILDINGS = [
  "marineBarracks", "starBase", "missileBase", "radiationShield", "battlestation", "groundBatteries", "armorBarracks",
  "fluxShield", "starFortress", "barrierShield", "artemisSystemNet",
];

/** Buildings that add research, first in line under the research strategy. */
const RESEARCH_BUILDINGS = new Set(ECONOMY_BUILDINGS.filter((b) => {
  const e = BUILDINGS_BY_ID[b]?.effects;
  return !!e && ((e.researchFlat ?? 0) > 0 || (e.researchPerScientist ?? 0) > 0);
}));

/** Below this industry a colony isn't worth tying up with a colony ship... */
const COLONY_SHIP_MIN_INDUSTRY = 8;
/** ...unless the empire is set on expansion. */
const COLONY_SHIP_MIN_INDUSTRY_EXPANSION = 5;
/** Colony and outpost ships kept on the way at once, normally and under the expansion strategy. */
const SETTLERS = { colony: 3, outpost: 2 };
const SETTLERS_EXPANSION = { colony: 5, outpost: 4 };
const MAX_SCOUTS = 2;
/** Industry a colony needs before it builds a star dock for the big warships. */
const STAR_DOCK_MIN_INDUSTRY = 15;
/** Share of the command points a peacetime fleet should use before shipyards turn back to buildings. */
const FLEET_FLOOR = 0.5;

interface Wants {
  strategy: string;
  colonyShips: number;
  outposts: number;
  scouts: number;
  warships: number;
  transports: number;
  spies: number;
  portalQueued: boolean;
  /** BC a turn the treasury can still spare for new building upkeep. */
  upkeepRoom: number;
  freighterFleets: number;
  capitol: boolean;
  barracks: boolean;
  /** Best planet worth a colony base in each system, by star id. */
  colonyBases: Map<string, string>;
  /** The warship design needs a star dock: in peacetime only colonies that can build it build warships. */
  bigHulls: boolean;
  bigDesign: string | null;
  /** Our most productive colony, when it has no star dock yet: it builds one. */
  dockColony: string | null;
  /** Warships use less than FLEET_FLOOR of the command points: shipyards build them before buildings. */
  fleetShort: boolean;
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
  const strategy = strategyOf(view, "production");
  const settlers = strategy === "expansion" ? SETTLERS_EXPANSION : SETTLERS;

  const queued = (pred: (q: BuildItem) => boolean) => colonies.reduce((n, c) => n + c.queue.filter(pred).length, 0);
  const owned = (role: "scout" | "colony" | "outpost" | "transport") =>
    fleets.filter((f) => isOnly(view, f, role)).reduce((n, f) => n + f.ships.reduce((m, s) => m + s.count, 0), 0);
  const shipQueued = (id: string) => queued((q) => q.kind === "ship" && q.designId === id);

  // Freighters: enough to carry every hungry colony's food with a little room to spare.
  const food = foodPlan(view, view.viewer);
  const spare = Math.max(2, Math.ceil(colonies.length / 3));
  const freighterShort = Math.ceil(food.needed) + spare - (food.freighters - food.movingColonists);
  const targets = colonizationTargets(view);
  const colonyBases = new Map<string, string>();
  for (const t of targets) if (!colonyBases.has(t.planet.starId)) colonyBases.set(t.planet.starId, t.planet.id);
  for (const c of colonies) {
    for (const q of c.queue) if (q.kind === "project" && q.id === "colonyBase") colonyBases.delete(colonyStar(view, c).id);
  }
  const wants: Wants = {
    strategy,
    portalQueued: false,
    colonyBases,
    upkeepRoom: 0,
    freighterFleets: colonies.length > 1 && freighterShort > 0
      ? Math.ceil(freighterShort / FREIGHTERS.perFleet) - queued((q) => q.kind === "project" && q.id === "freighterFleet")
      : 0,
    capitol: player.capitol === "lost",
    bigHulls: false,
    bigDesign: null,
    dockColony: null,
    fleetShort: false,
    barracks: government(player).ungarrisonedPenalty > 0 && !government(player).noMorale,
    colonyShips: Math.min(settlers.colony, targets.length) - owned("colony") - shipQueued("colonyShip"),
    outposts: designs.has("outpostShip") ? Math.min(settlers.outpost, outpostTargets(view).length) - owned("outpost") - shipQueued("outpostShip") : 0,
    scouts: unexploredInReach(view) ? MAX_SCOUTS - owned("scout") - shipQueued("scout") : 0,
    warships: 0,
    transports: 0,
    spies: Math.ceil(colonies.length / 4) + (atWar(view) ? 1 : 0) - player.spies.home - Object.values(player.spies.abroad).reduce((n, s) => n + s.count, 0) - queued((q) => q.kind === "project" && q.id === "spy"),
  };
  // Colony and outpost ships also use command points, but they are spent soon; the warship budget ignores them.
  // Scouts and troop ships stay until used or scrapped, so they count.
  const support = owned("colony") + owned("outpost");
  const cpFree = commandPointsAvailable(view, view.viewer) - commandPointsUsed(view, view.viewer) + support;
  const war = atWar(view);
  const warship = currentWarship(view);
  const income = empireIncome(view, view.viewer);
  // New upkeep must fit in the income, with a margin; a large treasury can carry a little more.
  wants.upkeepRoom = income.net - 5 + Math.max(0, player.bc - 300) / 100;
  // Command points over the limit cost BC every turn; go over only while untaxed income can carry it.
  const taxBc = colonies.reduce((n, c) => {
    const o = colonyOutput(view, c);
    return n + o.taxes * TAX_BC_PER_INDUSTRY;
  }, 0);
  const untaxed = income.net - taxBc;
  const overBudget = player.bc > 200 ? Math.max(0, Math.floor((untaxed - 10) / COMMAND_OVERAGE_COST)) : 0;
  // Budgets are in command points; a bigger hull uses more of them.
  const design = warship ? player.designs.find((d) => d.id === warship) : undefined;
  const perShip = design ? HULLS_BY_ID[design.hull].commandPoints : 1;
  // Every warship already queued, of any design, counts against the budget.
  const hullCp = (id: string) => {
    const d = player.designs.find((x) => x.id === id);
    return d && !d.module && d.weapons.length > 0 ? HULLS_BY_ID[d.hull].commandPoints : 0;
  };
  // Ships in dock for a refit still need their command points once they are back.
  const queuedCp = colonies.reduce((n, c) => n + c.queue.reduce((m, q) => m + (q.kind === "ship" || q.kind === "refit" ? hullCp(q.designId) : 0), 0), 0);
  // Peacetime: a modest fleet that grows with the economy so late-game industry isn't all turned into BC.
  // Wartime: fill command points, and go over only while income can carry it.
  // The military strategy fills command points in peacetime too; the industry strategy keeps half the usual fleet.
  const peaceCap = cpFree + Math.floor(overBudget / 2);
  const peaceFleet = Math.ceil(colonies.length / 2) + Math.floor(totals.industry / 40) * perShip;
  const peaceTarget = strategy === "military" ? peaceCap : Math.min(peaceCap, strategy === "industry" ? Math.ceil(peaceFleet / 2) : peaceFleet);
  wants.warships = Math.max(0, Math.floor(((war ? cpFree + overBudget : peaceTarget) - queuedCp) / perShip));
  // A fleet using under half the command points comes before new buildings: a neighbour that outguns us declares war.
  const warshipCp = fleets.reduce((n, f) => n + f.ships.reduce((m, sh) => m + hullCp(sh.designId) * sh.count, 0), 0);
  wants.fleetShort = warshipCp + queuedCp < commandPointsAvailable(view, view.viewer) * FLEET_FLOOR;
  const transportsOwned = fleets.reduce((n, f) => n + f.ships.filter((s) => s.designId === "transport").reduce((m, s) => m + s.count, 0), 0);
  wants.transports = war ? Math.max(0, 4 - transportsOwned - shipQueued("transport")) : 0;

  const out: Command[] = [];
  // Scouts with nothing left to explore only cost command points.
  if (!unexploredInReach(view)) {
    for (const f of fleets.filter((x) => isOnly(view, x, "scout"))) {
      for (const sh of f.ships) out.push({ type: "scrapShips", fleetId: f.id, designId: sh.designId, count: sh.count });
    }
  }
  // Troop ships wait for a war; in peacetime they only tie up command points the fleet needs.
  if (!war) {
    for (const f of fleets.filter((x) => isOnly(view, x, "transport") && !x.destStarId)) {
      for (const sh of f.ships) out.push({ type: "scrapShips", fleetId: f.id, designId: sh.designId, count: sh.count });
    }
  }
  // Colony ships with nowhere left to go only cost command points.
  if (targets.length === 0 && !unexploredInReach(view)) {
    for (const f of fleets.filter((x) => isOnly(view, x, "colony") && !x.destStarId)) {
      for (const sh of f.ships) out.push({ type: "scrapShips", fleetId: f.id, designId: sh.designId, count: sh.count });
    }
  }
  // Over the command limit and losing money: retire a ship a turn, outdated designs first, then the smallest hull,
  // rather than let the treasury run dry and sell buildings.
  if (income.commandOverage > 0 && income.net < 0 && view.turn > 10) {
    const obsolete = new Set(player.designs.filter((d) => d.obsolete && !d.module).map((d) => d.id));
    const warships = fleets.flatMap((f) => f.ships.filter((s) => hullCp(s.designId) > 0).map((s) => ({ f, s })));
    const pick = warships.find((x) => obsolete.has(x.s.designId)) ??
      (war && player.bc > -income.net * 5 ? undefined : [...warships].sort((x, y) => hullCp(x.s.designId) - hullCp(y.s.designId))[0]);
    if (pick) out.push({ type: "scrapShips", fleetId: pick.f.id, designId: pick.s.designId, count: 1 });
  }
  // Taxes: raise them while the books are red, lower them once the treasury is healthy.
  const tax = income.net < 0 || player.bc < 30 ? Math.min(0.5, player.taxRate + 0.1) : player.bc > 300 && player.taxRate > 0 ? player.taxRate - 0.1 : player.taxRate;
  if (Math.abs(tax - player.taxRate) > 1e-9) out.push({ type: "setTaxRate", rate: Math.round(tax * 10) / 10 });
  // A finished base waiting for a target goes to the best planet left.
  const taken = new Set<string>();
  for (const c of colonies) {
    for (const id of c.readyBases ?? []) {
      const target = suggestedBaseTarget(view, c, id, taken);
      if (target) taken.add(target.id);
      if (target) out.push({ type: "placeBase", colonyId: c.id, projectId: id, planetId: target.id });
    }
  }
  // Outdated warships idle at a capable colony are refitted; those colonies are busy with that this turn.
  const refits = refitOrders(view);
  out.push(...refits);
  const refitting = new Set(refits.flatMap((c) => (c.type === "refitShips" ? [c.colonyId] : [])));
  let bc = player.bc;
  const ranked = colonies
    .map((c) => ({ c, out: colonyOutput(view, c) }))
    .sort((a, b) => b.out.industry - a.out.industry);
  // Only when some dock can build the big design in time do the other colonies leave warships to it.
  wants.bigHulls = !!design && STATION_DOCK_HULLS.includes(design.hull) &&
    colonies.some((c) => hasStarDock(c) && canBuildInTime(view, c, design.id));
  wants.bigDesign = design?.id ?? null;
  const best = ranked[0]?.c;
  if (best && !hasStarDock(best) && !best.queue.some((q) => q.kind === "building" && q.id === "starBase")) wants.dockColony = best.id;

  for (const [rank, { c, out: o }] of ranked.entries()) {
    const head = c.queue[0];
    if (head && head.kind !== "tradeGoods" && !(head.kind === "project" && head.id === "housing")) {
      // Rush the current item when the treasury is comfortably ahead.
      const cost = buyCost(view, c);
      // A warship for a fleet that is short of one is bought sooner: an empty fleet invites a war.
      const urgent = wants.fleetShort && head.kind === "ship" && hullCp(head.designId) > 0 && bc > cost + 50;
      if (Number.isFinite(cost) && cost > 0 && (urgent || (bc > cost * 2 + 100 && income.net > 0))) {
        bc -= cost;
        out.push({ type: "buy", colonyId: c.id });
      }
      continue;
    }
    if (refitting.has(c.id)) continue;
    const next = chooseItem(view, c, o.industry, rank, wants, designs, war, o.foodNet, player.bc > 1000 && income.net > -player.bc / 100);
    // Refit jobs hold ships and stay in the queue.
    out.push({ type: "setQueue", colonyId: c.id, queue: [next, ...c.queue.filter((q) => q.kind === "refit")] });
  }
  return out;
}

/** Whether an unexplored star lies within fuel range of our colonies (scouts can't go anywhere else). */
function unexploredInReach(view: PlayerView): boolean {
  const player = me(view);
  const range = fleetRange(player);
  return view.galaxy.stars.some((s) => !player.explored.includes(s.id) && s.special !== "raiderHome" &&
    distanceToNearestColony(view, view.viewer, s) <= range);
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
  if (wants.capitol && buildable.has("capitol")) {
    wants.capitol = false;
    return { kind: "building", id: "capitol" };
  }
  const ship = (designId: string): BuildItem => ({ kind: "ship", designId });

  const military = wants.strategy === "military";
  if (threatened || ((war || military) && rank < 3)) {
    const d = DEFENSE_BUILDINGS.find((b) => buildable.has(b));
    if (d && (!hasArmedDefenses(c) || !hasStarDock(c))) return { kind: "building", id: d };
  }
  // A colony that eats more than it grows feeds itself before anything else: imported food ties up farmers elsewhere.
  if (food < 0) {
    const farm = ["hydroponicFarm", "subterraneanFarms", "foodReplicators"].find((b) => buildable.has(b) && (b !== "foodReplicators" || food <= -3));
    if (farm) return { kind: "building", id: farm };
  }
  if (wants.scouts > 0 && designs.has("scout")) {
    wants.scouts--;
    return ship("scout");
  }
  const colonyShipIndustry = wants.strategy === "expansion" ? COLONY_SHIP_MIN_INDUSTRY_EXPANSION : COLONY_SHIP_MIN_INDUSTRY;
  if (wants.colonyShips > 0 && designs.has("colonyShip") && industry >= colonyShipIndustry) {
    wants.colonyShips--;
    return ship("colonyShip");
  }
  const base = wants.colonyBases.get(star.id);
  if (base && projects.has("colonyBase") && industry >= 6) {
    wants.colonyBases.delete(star.id);
    return { kind: "project", id: "colonyBase", planetId: base };
  }
  if (wants.outposts > 0 && designs.has("outpostShip") && industry >= 5) {
    wants.outposts--;
    return ship("outpostShip");
  }
  if (wants.freighterFleets > 0 && projects.has("freighterFleet") && industry >= 6) {
    wants.freighterFleets--;
    return { kind: "project", id: "freighterFleet" };
  }
  if (c.farmers > 0 && buildable.has("hydroponicFarm")) return { kind: "building", id: "hydroponicFarm" };
  if (wants.barracks && pop >= 4 && buildable.has("marineBarracks")) return { kind: "building", id: "marineBarracks" };
  const warship = currentWarship(view, c);
  // Ships bigger than a destroyer come only from star docks with the industry for them; in peacetime the fleet is built there.
  const shipyard = !wants.bigHulls || (!!warship && warship === wants.bigDesign);
  if (c.id === wants.dockColony && buildable.has("starBase") && industry >= STAR_DOCK_MIN_INDUSTRY) {
    wants.dockColony = null;
    return { kind: "building", id: "starBase" };
  }
  if ((war || military || (wants.fleetShort && shipyard)) && warship && wants.warships > 0 && rank < 3 && industry >= 10) {
    wants.warships--;
    return ship(warship);
  }
  if (war && wants.transports > 0 && rank < 2 && designs.has("transport")) {
    // Troop ships are built where marines train.
    if (hasMarineBarracks(c)) {
      wants.transports--;
      return ship("transport");
    }
    if (buildable.has("marineBarracks")) return { kind: "building", id: "marineBarracks" };
  }
  // Expansion grows young colonies before anything else.
  if (wants.strategy === "expansion" && pop < 4) return { kind: "project", id: "housing" };
  // Small colonies only build what pays off quickly.
  // Upkeep has to be paid every turn; past what the income spares, only buildings that add industry go up.
  const economy = ECONOMY_BUILDINGS.filter((b) => buildable.has(b))
    .filter((b) => (BUILDINGS_BY_ID[b]?.maintenance ?? 0) <= wants.upkeepRoom || INDUSTRY_BUILDINGS.has(b))
    .filter((b) => pop >= 4 || CHEAP_BUILDINGS.includes(b))
    .filter((b) => !FARM_BUILDINGS.has(b) || c.farmers >= 2)
    .filter((b) => b !== "alienManagementCenter" || (c.aliens ?? 0) > 0 || c.raceId !== me(view).raceId)
    .filter((b) => b !== "pleasureDome" || pop >= 8);
  // Industry and research strategies move their kind of building to the front, keeping the usual order otherwise.
  const favored = wants.strategy === "industry" ? INDUSTRY_BUILDINGS : wants.strategy === "research" ? RESEARCH_BUILDINGS : null;
  if (favored) economy.sort((a, b) => Number(favored.has(b)) - Number(favored.has(a)));
  if (economy.length > 0) {
    wants.upkeepRoom -= BUILDINGS_BY_ID[economy[0]!]?.maintenance ?? 0;
    return { kind: "building", id: economy[0]! };
  }
  if (wants.spies > 0) {
    wants.spies--;
    return { kind: "project", id: "spy" };
  }
  if (warship && shipyard && wants.warships > 0 && industry >= 10) {
    wants.warships--;
    return ship(warship);
  }
  // One portal is enough: the strike force gathers there.
  if (projects.has("dimensionalPortal") && industry >= 40 && !wants.portalQueued && !me(view).hasPortal && !queuedAnywhere(view, view.viewer, "dimensionalPortal")) {
    wants.portalQueued = true;
    return { kind: "project", id: "dimensionalPortal" };
  }
  if (projects.has("gaiaTransform") && industry >= 20) return { kind: "project", id: "gaiaTransform" };
  if (projects.has("terraform") && industry >= 20 && c.terraformed < 3) return { kind: "project", id: "terraform" };
  // A body already holding an outpost would stay an outpost after the conversion: only free ones are worth it.
  if (projects.has("artificialPlanet") && industry >= 30 && baseTargets(view, c, "artificialPlanet").some((p) => !p.colonyId)) {
    return { kind: "project", id: "artificialPlanet" };
  }
  const defense = DEFENSE_BUILDINGS.find((b) => buildable.has(b));
  if (defense && industry >= (military ? 10 : 25)) return { kind: "building", id: defense };
  if (pop < 6) return { kind: "project", id: "housing" };
  // A rich empire with nothing left to build keeps its fleet growing rather than hoarding BC.
  if (warship && shipyard && rich && industry >= 10) return ship(warship);
  return { kind: "tradeGoods" };
}
