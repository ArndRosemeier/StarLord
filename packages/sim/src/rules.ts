import { BUILDINGS } from "./data/buildings.js";
import { DRIVES, FUEL_RANGES, PREBUILT_DESIGNS } from "./data/ships.js";
import { TECH_TIERS } from "./data/techs.js";
import type { Colony, GameState, PlayerId } from "./types.js";

/** Derived rules: what a player can currently build, research and reach. */

export function knows(state: GameState, playerId: PlayerId, tech: string | null): boolean {
  return tech === null || state.players[playerId]!.techs.includes(tech);
}

export function availableBuildings(state: GameState, playerId: PlayerId, colony: Colony): string[] {
  return BUILDINGS.filter((b) => knows(state, playerId, b.requires) && !colony.buildings.includes(b.id)).map((b) => b.id);
}

export function availableDesigns(state: GameState, playerId: PlayerId): string[] {
  return PREBUILT_DESIGNS.filter((d) => knows(state, playerId, d.requires)).map((d) => d.id);
}

export function availableTiers(state: GameState, playerId: PlayerId): string[] {
  const done = state.players[playerId]!.tiers;
  return TECH_TIERS.filter((t) => !done.includes(t.id) && (t.after === null || done.includes(t.after))).map((t) => t.id);
}

export function fleetSpeed(state: GameState, playerId: PlayerId): number {
  return Math.max(...DRIVES.filter((d) => knows(state, playerId, d.tech)).map((d) => d.speed));
}

export function fleetRange(state: GameState, playerId: PlayerId): number {
  return Math.max(...FUEL_RANGES.filter((f) => knows(state, playerId, f.tech)).map((f) => f.range));
}
