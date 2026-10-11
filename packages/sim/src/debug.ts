import { DEBUG } from "./data/debug.js";
import { EVENTS, type EventId } from "./data/events.js";
import { getRace } from "./data/races.js";
import { TECH_TIERS, TIERS_BY_ID, XENON_TECHS, researchCost } from "./data/techs.js";
import type { TurnContext } from "./context.js";
import { findDesign } from "./designs.js";
import { maxPopulation, population } from "./economy.js";
import { grantTech } from "./empire.js";
import { addShips } from "./fleetOps.js";
import { removePopulation } from "./jobs.js";
import { raidersId, spawn } from "./npc.js";
import { forceRaid } from "./raiders.js";
import { fireEvent } from "./randomEvents.js";
import { itemCost } from "./rules.js";
import { explore } from "./specials.js";
import type { GameState, Id, PlayerId } from "./types.js";

/**
 * Cheats for trying out the game's systems. They are ordinary commands, so
 * records replay them, but only games started in debug mode accept them.
 */
export type DebugAction =
  /** Every field of the research tree with all its applications; xenon adds the never-researched raider techs. */
  | { kind: "unlockTechs"; xenon?: boolean }
  | { kind: "addBc"; amount: number }
  | { kind: "addResearch"; amount: number }
  /** Makes the current research field break through at the end of the turn. */
  | { kind: "finishResearch" }
  /** Pays for the head of every colony's build queue; it completes at the end of the turn. */
  | { kind: "finishBuilds" }
  /** Explores every star, with the one-time finds that brings. */
  | { kind: "revealMap" }
  | { kind: "meetAll" }
  | { kind: "spawnShips"; designId: string; count: number; starId: Id }
  | { kind: "setPopulation"; colonyId: Id; population: number }
  /** The Vexari raid this empire at the end of the turn. */
  | { kind: "raid" }
  | { kind: "event"; event: EventId };

/** Why a debug action can't be taken, or null. */
export function debugProblem(state: GameState, playerId: PlayerId, a: DebugAction): string | null {
  if (!state.settings.debug) return "debug mode is off";
  const player = state.players[playerId]!;
  switch (a.kind) {
    case "addBc":
    case "addResearch":
      return Number.isInteger(a.amount) && a.amount > 0 ? null : "bad amount";
    case "spawnShips": {
      if (!findDesign(player, a.designId)) return "no such design";
      if (!state.galaxy.stars.some((s) => s.id === a.starId && s.special !== "raiderHome")) return "no such star";
      return Number.isInteger(a.count) && a.count > 0 && a.count <= DEBUG.maxSpawn ? null : "bad ship count";
    }
    case "setPopulation": {
      const c = state.colonies[a.colonyId];
      if (!c || c.ownerId !== playerId || c.outpost) return "not your colony";
      return Number.isInteger(a.population) && a.population >= 1 ? null : "population must be at least 1";
    }
    case "finishResearch":
      return player.research.tierId ? null : "nothing being researched";
    case "raid":
      return raidersId(state) === null || state.raiders.defeated ? "no raiders in this game" : null;
    case "event":
      return EVENTS[a.event] ? null : "unknown event";
    default:
      return null;
  }
}

export function applyDebug(ctx: TurnContext, playerId: PlayerId, a: DebugAction): void {
  const { state } = ctx;
  const player = state.players[playerId]!;
  switch (a.kind) {
    case "unlockTechs":
      for (const tier of TECH_TIERS) {
        if (tier.hyper) continue;
        if (!player.tiers.includes(tier.id)) player.tiers.push(tier.id);
        for (const t of tier.techs) grantTech(player, t);
      }
      if (a.xenon) for (const t of XENON_TECHS) grantTech(player, t);
      if (player.research.tierId && player.tiers.includes(player.research.tierId)) {
        player.research.tierId = null;
        player.research.techChoice = null;
      }
      break;
    case "addBc":
      player.bc += a.amount;
      break;
    case "addResearch":
      player.research.progress += a.amount;
      break;
    case "finishResearch": {
      // Twice the cost makes the breakthrough certain.
      const tier = TIERS_BY_ID[player.research.tierId!]!;
      player.research.progress = Math.max(player.research.progress, 2 * researchCost(player, tier));
      break;
    }
    case "finishBuilds":
      for (const c of Object.values(state.colonies)) {
        if (c.ownerId !== playerId || !c.queue[0]) continue;
        const cost = itemCost(state, playerId, c.queue[0], c);
        if (Number.isFinite(cost)) c.progress = Math.max(c.progress, cost);
      }
      break;
    case "revealMap":
      for (const s of state.galaxy.stars) if (s.special !== "raiderHome") explore(ctx, playerId, s.id);
      break;
    case "meetAll":
      for (const other of state.players) {
        if (other.kind !== "empire" || other.id === playerId || !other.alive) continue;
        if (!player.contacts.includes(other.id)) player.contacts.push(other.id);
        if (!other.contacts.includes(playerId)) other.contacts.push(playerId);
      }
      break;
    case "spawnShips": {
      const star = state.galaxy.stars.find((s) => s.id === a.starId)!;
      const design = findDesign(player, a.designId)!;
      const fleet = Object.values(state.fleets).find((f) => f.ownerId === playerId && f.starId === star.id && !f.destStarId)
        ?? spawn(state, playerId, star, [], `${design.name} Group`);
      addShips(fleet, design.id, a.count);
      break;
    }
    case "setPopulation": {
      const c = state.colonies[a.colonyId]!;
      const planet = state.planets[c.planetId]!;
      const target = Math.max(1, Math.min(a.population, maxPopulation(planet, getRace(c.raceId), c.buildings, player)));
      const now = population(c);
      if (target < now) removePopulation(c, now - target);
      else c.workers += Math.max(0, target - now);
      break;
    }
    case "raid":
      forceRaid(state, playerId, DEBUG.raidBudget);
      break;
    case "event":
      fireEvent(ctx, a.event, player);
      break;
  }
}
