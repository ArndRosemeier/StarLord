import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { ATTITUDE_EVENTS, SPY } from "./data/diplomacy.js";
import { TIER_OF_TECH } from "./data/techs.js";
import { adjustAttitude } from "./diplomacy.js";
import { grantTech, securityLevel, spyingLevel } from "./empire.js";
import { population } from "./economy.js";
import { removePopulation } from "./jobs.js";
import type { Rng } from "./rng.js";
import type { GameState } from "./types.js";
import type { Emit } from "./context.js";

/**
 * Spies are trained at colonies and either guard home as counter-agents or
 * are sent to another empire as agents to steal technology or sabotage. Every
 * agent rolls each turn: d100 + 10 x (offensive spy level - target's
 * defensive level) - 2 per counter-agent. Offense gets the full race pick,
 * defense half of it (as in the original); spy techs and telepathy help both.
 * - 88 or more: the mission succeeds (and is always noticed by the target);
 *   now and then the agent dies doing it.
 * - 80-87: the agent kills one counter-agent.
 * - 20 or less: the agent is caught and killed.
 * Most turns nothing happens.
 */

export const SUCCESS_THRESHOLD = SPY.success;
export const CAPTURE_THRESHOLD = SPY.caught;

export function espionageTick(state: GameState, rng: Rng, emit: Emit): void {
  for (const spyMaster of state.players) {
    if (spyMaster.kind !== "empire" || !spyMaster.alive) continue;
    for (const [targetKey, cell] of Object.entries(spyMaster.spies.abroad)) {
      const targetId = Number(targetKey);
      const target = state.players[targetId];
      if (!target || !target.alive) {
        spyMaster.spies.home += cell.count;
        delete spyMaster.spies.abroad[targetKey];
        continue;
      }
      if (cell.mission === "idle" || cell.count <= 0) continue;
      const edge = spyingLevel(spyMaster) - securityLevel(state, targetId);
      for (let i = 0; i < cell.count; i++) {
        const roll = rng.int(1, 100) + edge * 10 - target.spies.home * SPY.perCounterAgent;
        if (roll >= SPY.success) {
          if (cell.mission === "steal") steal(state, rng, spyMaster.id, targetId, emit);
          else sabotage(state, rng, spyMaster.id, targetId, emit);
          // Success is always noticed and hurts relations.
          adjustAttitude(state, targetId, spyMaster.id, ATTITUDE_EVENTS.spyNoticed);
          if (rng.chance(SPY.diesOnSuccess)) {
            cell.count--;
            i--;
            emit({ kind: "spy", playerId: spyMaster.id, other: targetId, what: "lost a spy on a successful mission" });
            if (cell.count <= 0) break;
          }
        } else if (roll >= SPY.killCounterAgent && target.spies.home > 0) {
          target.spies.home--;
          emit({ kind: "spy", playerId: targetId, other: spyMaster.id, what: "lost a counter-agent to an enemy spy" });
        } else if (roll <= SPY.caught) {
          cell.count--;
          i--;
          adjustAttitude(state, targetId, spyMaster.id, ATTITUDE_EVENTS.spyCaught);
          emit({ kind: "spy", playerId: targetId, other: spyMaster.id, what: "caught an enemy spy" });
          emit({ kind: "spy", playerId: spyMaster.id, other: targetId, what: "lost a spy" });
          if (cell.count <= 0) break;
        }
      }
      if (cell.count <= 0) delete spyMaster.spies.abroad[targetKey];
    }
  }
}

function steal(state: GameState, rng: Rng, thief: number, victim: number, emit: Emit): void {
  const me = state.players[thief]!;
  const them = state.players[victim]!;
  const options = them.techs.filter((t) => !me.techs.includes(t) && TIER_OF_TECH[t]);
  if (options.length === 0) return;
  const tech = rng.pick(options);
  grantTech(me, tech);
  const tier = TIER_OF_TECH[tech]!;
  emit({ kind: "techLearned", playerId: thief, techId: tech, tierId: tier.id, source: "stolen" });
  emit({ kind: "spy", playerId: victim, other: thief, what: `had ${tech} stolen` });
}

function sabotage(state: GameState, rng: Rng, saboteur: number, victim: number, emit: Emit): void {
  const colonies = Object.values(state.colonies).filter((c) => c.ownerId === victim && !c.outpost);
  if (colonies.length === 0) return;
  const c = rng.pick(colonies);
  if (c.buildings.length > 0 && rng.chance(SPY.sabotageBuilding)) {
    const b = rng.pick(c.buildings);
    c.buildings = c.buildings.filter((x) => x !== b);
    emit({ kind: "spy", playerId: victim, other: saboteur, what: `${BUILDINGS_BY_ID[b]?.name ?? b} destroyed at ${c.name}` });
  } else if (population(c) > 1) {
    removePopulation(c, 1);
    emit({ kind: "spy", playerId: victim, other: saboteur, what: `sabotage killed population at ${c.name}` });
  }
  emit({ kind: "spy", playerId: saboteur, other: victim, what: "sabotage succeeded" });
}
