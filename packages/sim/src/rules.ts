import { ANDROID_PROJECTS, BUILDINGS, BUILDINGS_BY_ID, PROJECTS, PROJECT_COSTS, TERRAFORM_STEP } from "./data/buildings.js";
import { CLIMATES, SOILLESS } from "./data/planets.js";
import { GOVERNMENTS } from "./data/governments.js";
import { getRace, hasTrait } from "./data/races.js";
import { TECHS, TECH_TIERS, previousTier, type TechTier } from "./data/techs.js";
import { designStats, validateDesign } from "./designs.js";
import { knows } from "./empire.js";
import { canFarm, capitalLost, maxPopulation, population, totalPopulation } from "./economy.js";
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
    // Superseded buildings disappear once their replacement stands.
    const superseded = BUILDINGS.some((o) => o.replaces?.includes(b.id) && colony.buildings.includes(o.id));
    return !superseded;
  }).map((b) => b.id);
}

export function freePlanetsInSystem(state: GameState, colony: Colony, kind: "habitable" | "unsettleable"): Planet[] {
  const starId = state.planets[colony.planetId]!.starId;
  const star = state.galaxy.stars.find((s) => s.id === starId)!;
  return star.planetIds
    .map((id) => state.planets[id]!)
    .filter((p) => !p.colonyId && (kind === "habitable" ? CLIMATES[p.type].habitable : !CLIMATES[p.type].habitable));
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
      case "outpostBase":
        return freePlanetsInSystem(state, colony, "habitable").length > 0;
      case "artificialPlanet":
        return freePlanetsInSystem(state, colony, "unsettleable").length > 0;
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
    case "building":
      return BUILDINGS_BY_ID[item.id]?.cost ?? Infinity;
    case "ship": {
      const d = player.designs.find((x) => x.id === item.designId);
      return d ? designStats(player, d).cost : Infinity;
    }
    case "project":
      switch (item.id) {
        case "terraform":
          return PROJECT_COSTS.terraformBase * (1 + (colony?.terraformed ?? 0));
        case "colonyBase":
        case "outpostBase":
        case "gaiaTransform":
        case "artificialPlanet":
        case "dimensionalPortal":
        case "spy":
        case "freighterFleet":
          return PROJECT_COSTS[item.id];
        default:
          return item.id in ANDROID_PROJECTS ? PROJECT_COSTS.android : Infinity;
      }
    case "tradeGoods":
      return Infinity;
  }
}

/** Items that never complete; output flows into BC or growth instead. */
export function isContinuous(item: BuildItem): boolean {
  return item.kind === "tradeGoods" || (item.kind === "project" && item.id === "housing");
}

/** A settled colony with nothing to build or Trade Goods at the head of its queue, so all its industry becomes BC. */
export function isTradeGoodsOnly(colony: Colony): boolean {
  if (colony.outpost) return false;
  const head = colony.queue[0];
  return !head || head.kind === "tradeGoods";
}

/** Whether a colony has an orbital station, whose star dock builds ships larger than destroyers. */

export function hasStarDock(colony: Colony): boolean {
  return colony.buildings.some((b) => !!BUILDINGS_BY_ID[b]?.effects.defense?.station);
}

/**
 * Whether a colony can build ships at all, or a given design: cruisers and
 * larger warships need an orbital station. Support ships (colony, outpost and
 * troop ships) can be built anywhere.
 */
export function canBuildShips(colony: Colony, design?: ShipDesign): boolean {
  if (colony.outpost || population(colony) < 1) return false;
  if (!design || design.module) return true;
  return !STATION_DOCK_HULLS.includes(design.hull) || hasStarDock(colony);
}

export function starOf(state: GameState, planetId: Id) {
  const p = state.planets[planetId]!;
  return state.galaxy.stars.find((s) => s.id === p.starId)!;
}
