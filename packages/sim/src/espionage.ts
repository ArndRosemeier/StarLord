import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { ATTITUDE_EVENTS, SPY, spyCountBonus } from "./data/diplomacy.js";
import { DIFFICULTY_ORDER } from "./data/galaxy.js";
import { PICK_VALUES } from "./data/racePicks.js";
import { TIER_OF_TECH } from "./data/techs.js";
import { adjustAttitude } from "./diplomacy.js";
import { grantTech, securityLevel, spyingLevel } from "./empire.js";
import { destructibleBuildings } from "./economy.js";
import { leaderAssassinChance } from "./leaders.js";
import type { Rng } from "./rng.js";
import type { GameState } from "./types.js";
import type { Emit } from "./context.js";

/**
 * Spies are trained at colonies and either guard home or are sent to another
 * empire to steal technology, sabotage or just hide. As in the original, each
 * spying empire rolls once a turn per target, not once per spy: d100 plus its
 * spying and a bonus for its spy count, against d100 plus the target's
 * security and home spies. 80 steals, 70 sabotages, 90 makes the target blame
 * a third empire. A second roll decides whether a spy on either side dies.
 */

export const SUCCESS_THRESHOLD = SPY.steal;
export const CAPTURE_THRESHOLD = -SPY.killThreshold;

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
      if (cell.count <= 0) continue;
      // Assassin leaders may hunt down one foreign agent a turn before they act.
      const assassin = leaderAssassinChance(state, targetId);
      if (assassin > 0) {
        const killed = rng.int(1, 100) <= assassin ? 1 : 0;
        if (killed > 0) {
          cell.count -= killed;
          emit({ kind: "spy", playerId: targetId, other: spyMaster.id, what: `assassinated ${killed} enemy spy${killed > 1 ? "s" : ""}` });
          emit({ kind: "spy", playerId: spyMaster.id, other: targetId, what: `lost ${killed} spy${killed > 1 ? "s" : ""} to assassins` });
          if (cell.count <= 0) {
            delete spyMaster.spies.abroad[targetKey];
            continue;
          }
        }
      }
      // Offense and defense in roll points; computer spies get the difficulty shift against humans.
      let edge = (spyingLevel(spyMaster, state) - securityLevel(state, targetId)) * PICK_VALUES.spyingPerLevel +
        spyCountBonus(cell.count) - spyCountBonus(target.spies.home);
      if (!spyMaster.isHuman && target.isHuman) edge += DIFFICULTY_ORDER.indexOf(state.settings.difficulty ?? "average") - 2;

      if (cell.mission !== "idle") {
        const die = rng.int(1, 100);
        const x = die + edge - rng.int(1, 100);
        const need = cell.mission === "steal" ? SPY.steal : SPY.sabotage;
        if (x >= need || die === 100) {
          const scapegoat = x >= SPY.blame || die === 100 ? blameTarget(state, rng, spyMaster.id, targetId) : null;
          const done = cell.mission === "steal" ? steal(state, rng, spyMaster.id, targetId, emit) : sabotage(state, rng, spyMaster.id, targetId, emit);
          // A framed empire takes a bigger, random hit than a caught culprit.
          if (done) adjustAttitude(state, targetId, scapegoat ?? spyMaster.id, scapegoat !== null ? -(rng.int(1, SPY.blameDrop[0]) + rng.int(1, SPY.blameDrop[1])) : ATTITUDE_EVENTS.spyNoticed);
        }
      }

      // Second roll: does a spy on either side die?
      const dieA = rng.int(1, 100);
      const dieB = rng.int(1, 100);
      const y = dieA + edge - dieB - (cell.mission === "idle" ? 0 : SPY.killPenalty);
      if ((y >= SPY.killThreshold || dieA === 100) && target.spies.home > 0) {
        target.spies.home--;
        emit({ kind: "spy", playerId: targetId, other: spyMaster.id, what: "lost a counter-agent to an enemy spy" });
      } else if (y <= -SPY.killThreshold || dieB === 100) {
        cell.count--;
        adjustAttitude(state, targetId, spyMaster.id, ATTITUDE_EVENTS.spyCaught);
        emit({ kind: "spy", playerId: targetId, other: spyMaster.id, what: "caught an enemy spy" });
        emit({ kind: "spy", playerId: spyMaster.id, other: targetId, what: "lost a spy" });
      }
      if (cell.count <= 0) delete spyMaster.spies.abroad[targetKey];
    }
  }
}

/** A third empire both sides know, to take the blame for a very good job. */
function blameTarget(state: GameState, rng: Rng, spy: number, victim: number): number | null {
  const a = state.players[spy]!;
  const b = state.players[victim]!;
  const options = a.contacts.filter((id) => id !== victim && b.contacts.includes(id) && state.players[id]?.alive);
  return options.length > 0 ? rng.pick(options) : null;
}

/** Picks by weight; the weights are positive. */
function weightedPick<T>(rng: Rng, items: T[], weight: (x: T) => number): T {
  const total = items.reduce((n, x) => n + weight(x), 0);
  let roll = rng.next() * total;
  for (const x of items) {
    roll -= weight(x);
    if (roll < 0) return x;
  }
  return items[items.length - 1]!;
}

/** Steals a technology the thief lacks, likelier from costlier fields. */
function steal(state: GameState, rng: Rng, thief: number, victim: number, emit: Emit): boolean {
  const me = state.players[thief]!;
  const them = state.players[victim]!;
  // Never from the field the thief is researching right now.
  const options = them.techs.filter((t) => !me.techs.includes(t) && TIER_OF_TECH[t] && TIER_OF_TECH[t]!.id !== me.research.tierId);
  if (options.length === 0) return false;
  const tech = weightedPick(rng, options, (t) => Math.max(1, TIER_OF_TECH[t]!.cost));
  grantTech(me, tech);
  const tier = TIER_OF_TECH[tech]!;
  emit({ kind: "techLearned", playerId: thief, techId: tech, tierId: tier.id, source: "stolen" });
  emit({ kind: "spy", playerId: victim, other: thief, what: `had ${tech} stolen` });
  return true;
}

/** Destroys one building somewhere in the victim's empire, likelier the costlier it is. */
function sabotage(state: GameState, rng: Rng, saboteur: number, victim: number, emit: Emit): boolean {
  const targets = Object.values(state.colonies)
    .filter((c) => c.ownerId === victim && !c.outpost)
    .flatMap((c) => destructibleBuildings(c).map((b) => ({ c, b })));
  if (targets.length === 0) return false;
  const { c, b } = weightedPick(rng, targets, (x) => Math.max(1, BUILDINGS_BY_ID[x.b]?.cost ?? 1));
  c.buildings = c.buildings.filter((x) => x !== b);
  emit({ kind: "spy", playerId: victim, other: saboteur, what: `${BUILDINGS_BY_ID[b]?.name ?? b} destroyed at ${c.name}` });
  emit({ kind: "spy", playerId: saboteur, other: victim, what: "sabotage succeeded" });
  return true;
}
