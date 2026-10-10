import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { GOVERNMENTS } from "./data/governments.js";
import { getRace } from "./data/races.js";
import { CLIMATES } from "./data/planets.js";
import { DESIGNS_BY_ID } from "./data/ships.js";
import { TIERS_BY_ID } from "./data/techs.js";
import { population } from "./economy.js";
import { availableBuildings, availableDesigns, availableTiers, fleetRange } from "./rules.js";
import { distance } from "./galaxy.js";
import type { BuildItem, Colony, GameState, Id, PlayerId } from "./types.js";

/**
 * Everything a player (human, AI or automation) can do is a Command. The sim
 * only changes through commands plus turn processing, which is what makes
 * headless runs, replays and lockstep multiplayer possible.
 */
export type Command =
  | { type: "setJobs"; colonyId: Id; farmers: number; workers: number; scientists: number }
  | { type: "setQueue"; colonyId: Id; queue: BuildItem[] }
  | { type: "buy"; colonyId: Id }
  | { type: "setResearch"; tierId: string; techId: string }
  | { type: "moveFleet"; fleetId: Id; destStarId: Id }
  | { type: "colonize"; fleetId: Id; planetId: Id }
  | { type: "splitFleet"; fleetId: Id; ships: { designId: string; count: number }[] };

export type CommandResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

/** Validates a command without changing state. */
export function validateCommand(state: GameState, playerId: PlayerId, cmd: Command): CommandResult {
  const player = state.players[playerId];
  if (!player || !player.alive) return fail("no such player");

  switch (cmd.type) {
    case "setJobs": {
      const c = state.colonies[cmd.colonyId];
      if (!c || c.ownerId !== playerId) return fail("not your colony");
      const values = [cmd.farmers, cmd.workers, cmd.scientists];
      if (values.some((v) => !Number.isInteger(v) || v < 0)) return fail("jobs must be whole numbers");
      if (cmd.farmers + cmd.workers + cmd.scientists !== population(c)) return fail("jobs must add up to population");
      return OK;
    }
    case "setQueue": {
      const c = state.colonies[cmd.colonyId];
      if (!c || c.ownerId !== playerId) return fail("not your colony");
      if (cmd.queue.length > 7) return fail("queue holds at most 7 items");
      const buildable = new Set(availableBuildings(state, playerId, c));
      const designs = new Set(availableDesigns(state, playerId));
      for (const item of cmd.queue) {
        if (item.kind === "building" && !buildable.has(item.id) && !c.buildings.includes(item.id)) {
          if (!BUILDINGS_BY_ID[item.id]) return fail(`unknown building ${item.id}`);
          return fail(`${item.id} not available`);
        }
        if (item.kind === "ship" && !designs.has(item.designId)) return fail(`design ${item.designId} not available`);
      }
      return OK;
    }
    case "buy": {
      const c = state.colonies[cmd.colonyId];
      if (!c || c.ownerId !== playerId) return fail("not your colony");
      const head = c.queue[0];
      if (!head || head.kind === "tradeGoods") return fail("nothing to buy");
      if (player.bc < buyCost(state, c)) return fail("not enough BC");
      return OK;
    }
    case "setResearch": {
      const tier = TIERS_BY_ID[cmd.tierId];
      if (!tier) return fail("unknown tier");
      if (!availableTiers(state, playerId).includes(cmd.tierId)) return fail("tier not available");
      if (!tier.techs.includes(cmd.techId)) return fail("tech not in tier");
      return OK;
    }
    case "moveFleet": {
      const f = state.fleets[cmd.fleetId];
      if (!f || f.ownerId !== playerId) return fail("not your fleet");
      const dest = state.galaxy.stars.find((s) => s.id === cmd.destStarId);
      if (!dest) return fail("no such star");
      if (distanceToNearestColony(state, playerId, dest) > fleetRange(state, playerId)) return fail("out of range");
      return OK;
    }
    case "colonize": {
      const f = state.fleets[cmd.fleetId];
      if (!f || f.ownerId !== playerId) return fail("not your fleet");
      const p = state.planets[cmd.planetId];
      if (!p || p.starId !== f.starId) return fail("fleet is not at that planet's star");
      if (p.colonyId) return fail("planet already colonized");
      if (!CLIMATES[p.type].habitable) return fail("planet needs an outpost ship");
      if (!f.ships.some((s) => DESIGNS_BY_ID[s.designId]?.role === "colony" && s.count > 0)) return fail("no colony ship");
      return OK;
    }
    case "splitFleet": {
      const f = state.fleets[cmd.fleetId];
      if (!f || f.ownerId !== playerId) return fail("not your fleet");
      for (const s of cmd.ships) {
        const have = f.ships.find((x) => x.designId === s.designId)?.count ?? 0;
        if (s.count <= 0 || s.count > have) return fail("not enough ships to split");
      }
      const total = f.ships.reduce((n, s) => n + s.count, 0);
      const moving = cmd.ships.reduce((n, s) => n + s.count, 0);
      if (moving >= total) return fail("split must leave ships behind");
      return OK;
    }
  }
}

export function distanceToNearestColony(state: GameState, playerId: PlayerId, point: { x: number; y: number }): number {
  let best = Infinity;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    const star = starOfPlanet(state, c.planetId);
    best = Math.min(best, distance(star, point));
  }
  return best;
}

export function starOfPlanet(state: GameState, planetId: Id) {
  const p = state.planets[planetId]!;
  return state.galaxy.stars.find((s) => s.id === p.starId)!;
}

/** MoO2 buy price: double the remaining cost, quadruple if nothing has been spent yet. */
export function buyCost(state: GameState, colony: Colony): number {
  const remaining = Math.max(0, itemCost(state, colony.ownerId, colony.queue[0]!) - colony.progress);
  return Math.ceil(remaining * (colony.progress > 0 ? 2 : 4));
}

export function itemCost(state: GameState, playerId: PlayerId, item: BuildItem): number {
  switch (item.kind) {
    case "building":
      return BUILDINGS_BY_ID[item.id]!.cost;
    case "ship":
      return shipCost(state, playerId, item.designId);
    case "tradeGoods":
      return Infinity;
  }
}

export function shipCost(state: GameState, playerId: PlayerId, designId: string): number {
  const race = getRace(state.players[playerId]!.raceId);
  return Math.round(DESIGNS_BY_ID[designId]!.cost * GOVERNMENTS[race.picks.government].shipCostMult);
}
