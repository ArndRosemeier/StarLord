import { BUILDINGS, BUILDINGS_BY_ID, PROJECTS, PROJECT_COSTS, TERRAFORM_STEP } from "./data/buildings.js";
import { CLIMATES } from "./data/planets.js";
import { TECH_TIERS, previousTier } from "./data/techs.js";
import { designStats, validateDesign } from "./designs.js";
import { knows } from "./empire.js";
import { population } from "./economy.js";
import type { BuildItem, Colony, GameState, Id, Planet, PlayerId } from "./types.js";

/** Derived rules: what a player can currently build, research and reach. */

export function availableBuildings(state: GameState, playerId: PlayerId, colony: Colony): string[] {
  const player = state.players[playerId]!;
  if (colony.outpost) return [];
  return BUILDINGS.filter((b) => {
    if (!knows(player, b.requires) || colony.buildings.includes(b.id)) return false;
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

export function availableProjects(state: GameState, playerId: PlayerId, colony: Colony): string[] {
  const player = state.players[playerId]!;
  if (colony.outpost) return [];
  const planet = state.planets[colony.planetId]!;
  return PROJECTS.filter((p) => {
    if (!knows(player, p.requires)) return false;
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
        return !player.hasPortal && !queuedAnywhere(state, playerId, "dimensionalPortal");
      default:
        return true;
    }
  }).map((p) => p.id);
}

export function availableTiers(state: GameState, playerId: PlayerId): string[] {
  const done = state.players[playerId]!.tiers;
  return TECH_TIERS.filter((t) => {
    if (done.includes(t.id)) return false;
    const prev = previousTier(t);
    return prev === null || done.includes(prev.id);
  }).map((t) => t.id);
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
          return PROJECT_COSTS[item.id];
        default:
          return Infinity;
      }
    case "tradeGoods":
      return Infinity;
  }
}

/** Items that never complete; output flows into BC or growth instead. */
export function isContinuous(item: BuildItem): boolean {
  return item.kind === "tradeGoods" || (item.kind === "project" && item.id === "housing");
}

export function canBuildShips(colony: Colony): boolean {
  return !colony.outpost && population(colony) >= 1;
}

export function starOf(state: GameState, planetId: Id) {
  const p = state.planets[planetId]!;
  return state.galaxy.stars.find((s) => s.id === p.starId)!;
}
