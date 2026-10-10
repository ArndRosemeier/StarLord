import { BUILDINGS_BY_ID, PROJECT_UPKEEP } from "./data/buildings.js";
import { DRIVES, FUEL_RANGES, HULLS_BY_ID, SUPPORT_SHIP_COMMAND_POINTS } from "./data/components.js";
import { GOVERNMENTS, type GovernmentDef } from "./data/governments.js";
import { getRace } from "./data/races.js";
import { colonyOutput, foodPlan, type EmpireIncome } from "./economy.js";
import { ORBITAL_BASES, RESEARCH, TECHS, type EmpireBonus, type TechField } from "./data/techs.js";
import { leaderCommandPoints, leaderSpyDefense, leaderSpyOffense } from "./leaders.js";
import { defensiveSpyPoints, offensiveSpyPoints, raceCommandPointsPerColony, raceFleetSpeedBonus } from "./raceEffects.js";
import { PICK_VALUES } from "./data/racePicks.js";
import type { Colony, GameState, Player, PlayerId } from "./types.js";

/** Empire-wide derived numbers: tech bonuses, government, speed, range, command points. */

export function knows(player: Player, tech: string | null): boolean {
  return tech === null || player.techs.includes(tech);
}

/** Adds an application to a player, with the side effects some have. Returns false if already known. */
export function grantTech(player: Player, tech: string): boolean {
  if (player.techs.includes(tech)) return false;
  player.techs.push(tech);
  if (tech === "evolutionaryMutation") player.mutationPoints = (player.mutationPoints ?? 0) + RESEARCH.mutationPicks;
  return true;
}

/**
 * Hyper-advanced levels researched in a category. Each level improves
 * miniaturization of that category's components (applied in ship design).
 */
export function hyperLevel(player: Player, field: TechField): number {
  return player.hyperLevels?.[field] ?? 0;
}

const bonusCache = new Map<string, Required<EmpireBonus>>();

const ZERO_BONUS: Required<EmpireBonus> = {
  foodPerFarmer: 0, industryPerWorker: 0, researchPerScientist: 0, maxPopPerSize: 0, growth: 0,
  groundCombat: 0, spying: 0, scanRange: 0, bcPerPop: 0, morale: 0, shipAttack: 0, shipDefense: 0,
  commandPoints: 0, commandPointsPerBase: 0, pollutionTolerance: 0, maxPopFlat: 0, hostileFarming: 0, security: 0, diplomacy: 0,
};

/**
 * Sum of every known tech's bonus. Techs in the same group don't stack: only
 * the best value of each number in a group counts, like MoO2's equipment.
 */
export function empireBonus(player: Player): Required<EmpireBonus> {
  const key = `${player.government}|${player.techs.join(",")}`;
  const cached = bonusCache.get(key);
  if (cached) return cached;
  if (bonusCache.size > 5000) bonusCache.clear();
  const total: Required<EmpireBonus> = { ...ZERO_BONUS };
  const best = new Map<string, number>();
  const add = (b: EmpireBonus | undefined, group: string | undefined) => {
    for (const [k, v] of Object.entries(b ?? {}) as [keyof EmpireBonus, number][]) {
      if (!group) total[k] += v;
      else best.set(`${group}.${k}`, Math.max(best.get(`${group}.${k}`) ?? -Infinity, v));
    }
  };
  for (const t of player.techs) {
    const def = TECHS[t];
    if (!def) continue;
    add(def.bonus, def.group);
    if (def.governmentBonus?.governments.includes(player.government)) add(def.governmentBonus.bonus, def.group);
  }
  for (const [k, v] of best) total[k.slice(k.indexOf(".") + 1) as keyof EmpireBonus] += v;
  bonusCache.set(key, total);
  return total;
}

export function government(player: Player): GovernmentDef {
  return GOVERNMENTS[player.government];
}

/**
 * Base galaxy-map speed in parsecs per turn: the best drive known, plus 2 for
 * trans-dimensional races. Jump gates, nebulae and interdictors adjust single
 * moves (see movement.ts).
 */
export function fleetSpeed(player: Player): number {
  const known = DRIVES.filter((d) => knows(player, d.tech));
  const base = known.length ? known[known.length - 1]!.speed : 1;
  return base + raceFleetSpeedBonus(getRace(player.raceId));
}

/** Whether a player has any faster-than-light drive; pre-warp empires cannot leave their home system. */
export function hasFtl(player: Player): boolean {
  return DRIVES.some((d) => knows(player, d.tech));
}

export function fleetRange(player: Player): number {
  const known = FUEL_RANGES.filter((f) => knows(player, f.tech));
  return known.length ? known[known.length - 1]!.range : 3;
}

/** Space Scanner range; Tachyon, Neutron and Sensors raise it to 3, 5 and 8. */
export const BASE_SCAN_RANGE = 1;

export function scanRange(player: Player): number {
  return BASE_SCAN_RANGE + empireBonus(player).scanRange;
}

/** Extra scanner range an orbital station gives around its colony. */
export function colonyScanBonus(colony: Colony): number {
  return Math.max(0, ...colony.buildings.map((b) => BUILDINGS_BY_ID[b]?.effects.scanRange ?? 0));
}

export const BASE_COMMAND_POINTS = 3;
/** BC per turn for each command point over the limit. */
export const COMMAND_OVERAGE_COST = 10;

export function commandPointsAvailable(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]!;
  let cp = BASE_COMMAND_POINTS + empireBonus(player).commandPoints + leaderCommandPoints(state, playerId);
  const perBase = empireBonus(player).commandPointsPerBase;
  const perColony = raceCommandPointsPerColony(getRace(player.raceId));
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    if (!c.outpost) cp += perColony;
    for (const b of c.buildings) {
      cp += BUILDINGS_BY_ID[b]?.effects.commandPoints ?? 0;
      // Communication techs add to every orbital base.
      if (ORBITAL_BASES.includes(b)) cp += perBase;
    }
  }
  // The Imperium raises the whole rating.
  return Math.floor(cp * government(player).commandPointsMult);
}

export function commandPointsUsed(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]!;
  let used = 0;
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId !== playerId) continue;
    for (const s of f.ships) {
      const d = player.designs.find((x) => x.id === s.designId);
      if (!d || d.fixed) continue;
      // Every ship uses command points; support ships count as the smallest warship.
      used += (d.module ? SUPPORT_SHIP_COMMAND_POINTS : HULLS_BY_ID[d.hull].commandPoints) * s.count;
    }
  }
  return used;
}

/**
 * Spying level of an empire's agents abroad; one level is 10 points on the
 * d100 spy roll. Race (full pick, telepathy), techs and, given the state, the
 * best Spy Master leader.
 */
export function spyingLevel(player: Player, state?: GameState): number {
  const leader = state ? leaderSpyOffense(state, player.id) : 0;
  return (offensiveSpyPoints(getRace(player.raceId)) + leader) / PICK_VALUES.spyingPerLevel + empireBonus(player).spying;
}

/**
 * Defensive spy level: counter-agents get only half the race pick, plus the
 * spy techs, telepathy, government security and security buildings.
 */
export function securityLevel(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]!;
  // Defending spies get half the racial spying bonus (telepaths +10 in full) and the best Telepath leader's points.
  const points = defensiveSpyPoints(getRace(player.raceId)) + leaderSpyDefense(state, playerId);
  let sec = points / PICK_VALUES.spyingPerLevel + empireBonus(player).security + government(player).security;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    for (const b of c.buildings) sec += BUILDINGS_BY_ID[b]?.effects.security ?? 0;
  }
  return sec;
}

export function isEmpire(player: Player): boolean {
  return player.kind === "empire";
}

export function empires(state: GameState): Player[] {
  return state.players.filter((p) => p.kind === "empire");
}

/** BC income breakdown for the current state, as the next turn will book it (minus trade goods and treaties). */
export function empireIncome(state: GameState, playerId: PlayerId): EmpireIncome {
  let colonies = 0;
  let maintenance = 0;
  const outputs = [];
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId || c.outpost) continue;
    const o = colonyOutput(state, c);
    outputs.push({ colony: c, out: o });
    colonies += o.bc;
    maintenance += o.maintenance;
  }
  const food = foodPlan(state, playerId, outputs);
  const projects = state.players[playerId]!.hasPortal ? PROJECT_UPKEEP.dimensionalPortal : 0;
  const salaries = Object.values(state.leaders).filter((l) => l.ownerId === playerId).reduce((s, l) => s + l.salary, 0);
  const over = Math.max(0, commandPointsUsed(state, playerId) - commandPointsAvailable(state, playerId));
  const commandOverage = over * COMMAND_OVERAGE_COST;
  return {
    colonies, foodSales: food.saleBC, maintenance, freighters: food.upkeep, projects, salaries, commandOverage,
    net: colonies + food.saleBC - maintenance - food.upkeep - projects - salaries - commandOverage,
  };
}
