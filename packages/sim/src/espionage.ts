import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { TIER_OF_TECH } from "./data/techs.js";
import { adjustAttitude } from "./diplomacy.js";
import { grantTech, securityLevel, spyingLevel } from "./empire.js";
import { population } from "./economy.js";
import { leaderAssassinChance } from "./leaders.js";
import type { Rng } from "./rng.js";
import type { GameState } from "./types.js";
import type { Emit } from "./context.js";

/**
 * Spies are trained at colonies and either guard home or are sent to another
 * empire to steal technology or sabotage. Each turn every spy abroad rolls
 * against the target's security; success and capture odds shift by 10% per
 * point of difference between spying and security levels.
 */

export const SUCCESS_THRESHOLD = 88;
export const CAPTURE_THRESHOLD = 20;


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
      const edge = spyingLevel(spyMaster, state) - securityLevel(state, targetId);
      const defenders = target.spies.home;
      // Assassin leaders hunt down foreign agents before they act.
      const assassin = leaderAssassinChance(state, targetId);
      if (assassin > 0) {
        let killed = 0;
        for (let i = 0; i < cell.count; i++) if (rng.int(0, 99) < assassin) killed++;
        if (killed > 0) {
          cell.count -= killed;
          emit({ kind: "spy", playerId: targetId, other: spyMaster.id, what: `assassinated ${killed} enemy spy${killed > 1 ? "s" : ""}` });
          emit({ kind: "spy", playerId: spyMaster.id, other: targetId, what: `lost ${killed} spy${killed > 1 ? "s" : ""} to assassins` });
          if (cell.count <= 0) continue;
        }
      }
      for (let i = 0; i < cell.count; i++) {
        const roll = rng.int(1, 100) + edge * 10 - defenders * 2;
        if (roll >= SUCCESS_THRESHOLD) {
          if (cell.mission === "steal") steal(state, rng, spyMaster.id, targetId, emit);
          else sabotage(state, rng, spyMaster.id, targetId, emit);
          // Successful spies are sometimes identified.
          if (rng.chance(0.5)) adjustAttitude(state, targetId, spyMaster.id, -5);
        } else if (roll <= CAPTURE_THRESHOLD) {
          cell.count--;
          i--;
          adjustAttitude(state, targetId, spyMaster.id, -8);
          emit({ kind: "spy", playerId: targetId, other: spyMaster.id, what: "caught an enemy spy" });
          emit({ kind: "spy", playerId: spyMaster.id, other: targetId, what: "lost a spy" });
          if (cell.count <= 0) break;
        }
      }
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
  if (c.buildings.length > 0 && rng.chance(0.6)) {
    const b = rng.pick(c.buildings);
    c.buildings = c.buildings.filter((x) => x !== b);
    emit({ kind: "spy", playerId: victim, other: saboteur, what: `${BUILDINGS_BY_ID[b]?.name ?? b} destroyed at ${c.name}` });
  } else if (population(c) > 1) {
    if (c.workers > 0) c.workers--;
    else if (c.farmers > 0) c.farmers--;
    else c.scientists--;
    emit({ kind: "spy", playerId: victim, other: saboteur, what: `sabotage killed population at ${c.name}` });
  }
  emit({ kind: "spy", playerId: saboteur, other: victim, what: "sabotage succeeded" });
}
