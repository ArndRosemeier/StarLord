import { ANDROID_PROJECTS, BUILDINGS, BUILDINGS_BY_ID, PROJECTS, PROJECT_COSTS, TERRAFORM_STEP } from "./data/buildings.js";
import { CLIMATES, SOILLESS } from "./data/planets.js";
import { GOVERNMENTS } from "./data/governments.js";
import { getRace, hasTrait } from "./data/races.js";
import { TECHS, TECH_TIERS, previousTier, type TechTier } from "./data/techs.js";
import { designStats, validateDesign } from "./designs.js";
import { government, knows } from "./empire.js";
import {
  androidCount, canFarm, capitalLost, gravityMultiplier, isMultiRacial, maxPopulation, population, totalPopulation,
} from "./economy.js";
import type { BuildItem, Colony, GameState, Id, Planet, Player, PlayerId, ShipDesign } from "./types.js";
import { STATION_DOCK_HULLS } from "./data/components.js";

/** Derived rules: what a player can currently build, research and reach. */

export function availableBuildings(state: GameState, playerId: PlayerId, colony: Colony): string[] {
  const player = state.players[playerId]!;
  if (colony.outpost) return [];
  const planet = state.planets[colony.planetId]!;
  return BUILDINGS.filter((b) => {
    if (!knows(player, b.requires) || colony.buildings.includes(b.id)) return false;
    const e = b.effects;
    // The Capitol can only be rebuilt after it is lost, and only once.
    if (e.capitol && (!capitalLost(player) || queuedBuildingAnywhere(state, playerId, b.id))) return false;
    // Buildings that would do nothing here are not offered.
    if (e.needsSoil && SOILLESS.includes(planet.type)) return false;
    if (e.foodPerFarmer && !e.researchPerScientist && !canFarm(planet, player)) return false;
    if (e.gravityFix && !gravityHurts(colony, planet)) return false;
    if ((e.pollutionFactor || e.noPollution) && !canPollute(colony)) return false;
    if (e.morale && government(player).noMorale) return false;
    if (e.alienManagement && !isMultiRacial(player, colony) && !(colony.aliens ?? 0)) return false;
    // Superseded buildings disappear once their replacement stands.
    const superseded = BUILDINGS.some((o) => o.replaces?.includes(b.id) && colony.buildings.includes(o.id));
    return !superseded;
  }).map((b) => b.id);
}

/** True when the colony's people or androids lose output to the planet's gravity. */
function gravityHurts(colony: Colony, planet: Planet): boolean {
  if (gravityMultiplier(getRace(colony.raceId), planet.gravity) < 1) return true;
  return androidCount(colony) > 0 && gravityMultiplier(null, planet.gravity) < 1;
}

/** False when the colony can't pollute: Core Waste Dumps stand, or its people are tolerant (androids never pollute). */
function canPollute(colony: Colony): boolean {
  if (colony.buildings.some((id) => BUILDINGS_BY_ID[id]?.effects.noPollution)) return false;
  return !hasTrait(getRace(colony.raceId), "tolerant");
}

/**
 * Planets in the colony's system a placed project can use. A Colony Base
 * needs a free habitable world; an Artificial Planet, as in the original, any
 * asteroid belt or gas giant there, also one the owner already holds as an
 * outpost (the outpost stays an outpost on the new world).
 */
export function freePlanetsInSystem(state: GameState, colony: Colony, kind: "habitable" | "unsettleable"): Planet[] {
  const starId = state.planets[colony.planetId]!.starId;
  const star = state.galaxy.stars.find((s) => s.id === starId)!;
  const usable = (p: Planet) => {
    if (!p.colonyId) return true;
    const held = state.colonies[p.colonyId];
    return kind === "unsettleable" && !!held && held.outpost && held.ownerId === colony.ownerId;
  };
  return star.planetIds
    .map((id) => state.planets[id]!)
    .filter((p) => usable(p) && (kind === "habitable" ? CLIMATES[p.type].habitable : !CLIMATES[p.type].habitable));
}

/** Projects that settle or convert another planet in the builder's system, and the planets they can use. */
export const PLACED_PROJECTS: Record<string, "habitable" | "unsettleable"> = {
  colonyBase: "habitable",
  artificialPlanet: "unsettleable",
};

/** Planets in the colony's system a placed project (Colony Base etc.) could go to right now. */
export function baseTargets(state: GameState, colony: Colony, projectId: string): Planet[] {
  const kind = PLACED_PROJECTS[projectId];
  return kind ? freePlanetsInSystem(state, colony, kind) : [];
}

/**
 * Placed projects of the same planet class the owner already has queued or
 * waiting for a target anywhere in this colony's system. Each will use up
 * one free planet, so no more can be started than there are planets.
 */
export function baseClaims(state: GameState, colony: Colony, projectId: string, queueOverride?: BuildItem[]): number {
  const kind = PLACED_PROJECTS[projectId];
  if (!kind) return 0;
  const starId = state.planets[colony.planetId]!.starId;
  let n = 0;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== colony.ownerId || state.planets[c.planetId]?.starId !== starId) continue;
    const queue = c.id === colony.id && queueOverride ? queueOverride : c.queue;
    n += queue.filter((q) => q.kind === "project" && PLACED_PROJECTS[q.id] === kind).length;
    n += (c.readyBases ?? []).filter((id) => PLACED_PROJECTS[id] === kind).length;
  }
  return n;
}

/**
 * The planet a finished base is best put on: a Colony Base takes the room for
 * the most people, an Artificial Planet a free body before one with an
 * outpost, and a gas giant (it becomes a huge planet) before an asteroid belt.
 */
export function suggestedBaseTarget(state: GameState, colony: Colony, projectId: string, taken?: Set<Id>): Planet | undefined {
  const free = baseTargets(state, colony, projectId).filter((p) => !taken?.has(p.id));
  const player = state.players[colony.ownerId]!;
  const race = getRace(player.raceId);
  const room = (p: Planet) => maxPopulation(p, race, [], player);
  // Free bodies first: an outpost on a converted planet stays an outpost.
  const score = (p: Planet) =>
    projectId === "colonyBase" ? room(p) : (p.colonyId ? 0 : 2) + (p.type === "gasGiant" ? 1 : 0);
  return [...free].sort((a, b) => score(b) - score(a))[0];
}

export function queuedAnywhere(state: GameState, playerId: PlayerId, projectId: string): boolean {
  return Object.values(state.colonies).some(
    (c) => c.ownerId === playerId && c.queue.some((q) => q.kind === "project" && q.id === projectId),
  );
}

export function queuedBuildingAnywhere(state: GameState, playerId: PlayerId, buildingId: string): boolean {
  return Object.values(state.colonies).some(
    (c) => c.ownerId === playerId && c.queue.some((q) => q.kind === "building" && q.id === buildingId),
  );
}

/** Room left on a colony for people or androids. */
export function colonyRoom(state: GameState, colony: Colony): number {
  const planet = state.planets[colony.planetId]!;
  const player = state.players[colony.ownerId]!;
  return maxPopulation(planet, getRace(colony.raceId), colony.buildings, player) - totalPopulation(colony);
}

export function availableProjects(state: GameState, playerId: PlayerId, colony: Colony): string[] {
  const player = state.players[playerId]!;
  if (colony.outpost) return [];
  const planet = state.planets[colony.planetId]!;
  return PROJECTS.filter((p) => {
    if (!knows(player, p.requires)) return false;
    if (p.id in ANDROID_PROJECTS) return colonyRoom(state, colony) > 0;
    switch (p.id) {
      case "colonyBase":
      case "artificialPlanet":
        // Only while a free planet is left that no other base here has claimed.
        return baseTargets(state, colony, p.id).length > baseClaims(state, colony, p.id);
      case "terraform":
        return planet.type in TERRAFORM_STEP;
      case "gaiaTransform":
        return planet.type === "terran";
      case "dimensionalPortal":
        // One portal per colony; fleets can only cross over from a system that has one.
        return !colony.portal && !colony.queue.some((q) => q.kind === "project" && q.id === "dimensionalPortal");
      default:
        return true;
    }
  }).map((p) => p.id);
}

/**
 * Fields a player can research now: the next field of each category, and a
 * category's hyper-advanced field (again and again) once its chain is done.
 */
export function availableTiers(state: GameState, playerId: PlayerId): string[] {
  const done = state.players[playerId]!.tiers;
  return TECH_TIERS.filter((t) => {
    if (!t.hyper && done.includes(t.id)) return false;
    const prev = previousTier(t);
    return prev === null || done.includes(prev.id);
  }).map((t) => t.id);
}

/**
 * Applications a player may pick from a field. Advanced Governments only
 * offers the form of the player's own government.
 */
export function researchOptions(player: Player, tier: TechTier): string[] {
  const advanced = GOVERNMENTS[player.government].advanced;
  return tier.techs.filter((t) => {
    const gov = TECHS[t]?.government;
    return !gov || gov === advanced;
  });
}

/** Whether a player learns every application of a field instead of picking one. */
export function learnsWholeField(player: Player, tier: TechTier): boolean {
  return tier.general || hasTrait(getRace(player.raceId), "creative");
}

/** Designs a player may build now: not obsolete and still valid. */
export function availableDesigns(state: GameState, playerId: PlayerId): string[] {
  const player = state.players[playerId]!;
  return player.designs.filter((d) => !d.obsolete && !d.fixed && validateDesign(player, d) === null).map((d) => d.id);
}

export function itemCost(state: GameState, playerId: PlayerId, item: BuildItem, colony?: Colony): number {
  const player = state.players[playerId]!;
  switch (item.kind) {
    case "building": {
      const def = BUILDINGS_BY_ID[item.id];
      if (!def) return Infinity;
      // An upgrade costs only the difference to the building it replaces.
      const replaced = (def.replaces ?? []).filter((id) => colony?.buildings.includes(id)).map((id) => BUILDINGS_BY_ID[id]?.cost ?? 0);
      return def.cost - Math.max(0, ...replaced);
    }
    case "ship": {
      const d = player.designs.find((x) => x.id === item.designId);
      return d ? designStats(player, d).cost : Infinity;
    }
    case "project":
      switch (item.id) {
        case "terraform":
          return PROJECT_COSTS.terraformBase * (1 + (colony?.terraformed ?? 0));
        case "colonyBase":
        case "gaiaTransform":
        case "artificialPlanet":
        case "dimensionalPortal":
        case "spy":
        case "freighterFleet":
          return PROJECT_COSTS[item.id];
        default:
          return item.id in ANDROID_PROJECTS ? PROJECT_COSTS.android : Infinity;
      }
    case "refit":
      return item.cost;
    case "tradeGoods":
    case "auto":
      return Infinity;
  }
}

/** Items that never complete; output flows into BC or growth, or (auto build) into the items it puts in front of itself. */
export function isContinuous(item: BuildItem): boolean {
  return item.kind === "tradeGoods" || item.kind === "auto" || (item.kind === "project" && item.id === "housing");
}

/**
 * Where in the queue the colony's industry goes: the first item that isn't
 * an auto build, which is passed over while it has nothing to pick; -1 when
 * there is none.
 */
export function buildIndex(queue: readonly BuildItem[]): number {
  return queue.findIndex((q) => q.kind !== "auto");
}

/** The item the colony is building now (see buildIndex). */
export function currentBuild(colony: Pick<Colony, "queue">): BuildItem | undefined {
  const i = buildIndex(colony.queue);
  return i < 0 ? undefined : colony.queue[i];
}

/** A settled colony with nothing to build or Trade Goods at the head of its queue, so all its industry becomes BC. */
export function isTradeGoodsOnly(colony: Colony): boolean {
  if (colony.outpost) return false;
  const head = currentBuild(colony);
  return !head || head.kind === "tradeGoods";
}

/** Whether a colony has an orbital station, whose star dock builds ships larger than destroyers. */

export function hasStarDock(colony: Colony): boolean {
  return colony.buildings.some((b) => !!BUILDINGS_BY_ID[b]?.effects.defense?.station);
}

/** Whether a colony trains marines, which troop ships need. */
export function hasMarineBarracks(colony: Colony): boolean {
  return colony.buildings.includes("marineBarracks");
}

/**
 * Whether a colony can build ships at all, or a given design: cruisers and
 * larger warships need an orbital station, troop ships a Marine Barracks.
 * Colony and outpost ships can be built anywhere.
 */
export function canBuildShips(colony: Colony, design?: ShipDesign): boolean {
  if (colony.outpost || population(colony) < 1) return false;
  if (design?.module === "transport") return hasMarineBarracks(colony);
  if (!design || design.module) return true;
  return !STATION_DOCK_HULLS.includes(design.hull) || hasStarDock(colony);
}

export function starOf(state: GameState, planetId: Id) {
  const p = state.planets[planetId]!;
  return state.galaxy.stars.find((s) => s.id === p.starId)!;
}
