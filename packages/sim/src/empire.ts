import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { DRIVES, FUEL_RANGES, HULLS_BY_ID, SUPPORT_SHIP_COMMAND_POINTS } from "./data/components.js";
import { GOVERNMENTS, type GovernmentDef } from "./data/governments.js";
import { getRace, hasTrait } from "./data/races.js";
import { TRANS_DIMENSIONAL_BONUS } from "./data/movement.js";

import { colonyOutput, type EmpireIncome } from "./economy.js";
import { ORBITAL_BASES, RESEARCH, TECHS, type EmpireBonus, type TechField } from "./data/techs.js";
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
  commandPoints: 0, commandPointsPerBase: 0, pollutionCleanup: 0, maxPopFlat: 0, freeFood: 0, security: 0, diplomacy: 0,
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
  total.pollutionCleanup = Math.min(1, total.pollutionCleanup);
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
  return base + (hasTrait(getRace(player.raceId), "transDimensional") ? TRANS_DIMENSIONAL_BONUS : 0);
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
/** Warlord races get this many command points from every colony. */
export const WARLORD_CP_PER_COLONY = 2;
/** BC per turn for each command point over the limit. */
export const COMMAND_OVERAGE_COST = 10;

export function commandPointsAvailable(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]!;
  let cp = BASE_COMMAND_POINTS + empireBonus(player).commandPoints;
  const perBase = empireBonus(player).commandPointsPerBase;
  const warlord = hasTrait(getRace(player.raceId), "warlord");
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    if (warlord && !c.outpost) cp += WARLORD_CP_PER_COLONY;
    for (const b of c.buildings) {
      cp += BUILDINGS_BY_ID[b]?.effects.commandPoints ?? 0;
      // Communication techs add to every orbital base.
      if (ORBITAL_BASES.includes(b)) cp += perBase;
    }
  }
  return cp;
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

/** Telepathic spies get +10 on every spy roll (one level). */
export const TELEPATHIC_SPY_LEVELS = 1;

/**
 * Offensive spy level (x10 on the roll): the full race pick, spy techs
 * (Neural Scanner, Stealth Suit, Cyber-Security Link, Telepathic Training,
 * Psionics) and telepathy.
 */
export function spyingLevel(player: Player): number {
  const race = getRace(player.raceId);
  return race.picks.spying + empireBonus(player).spying + (hasTrait(race, "telepathic") ? TELEPATHIC_SPY_LEVELS : 0);
}

/**
 * Defensive spy level: counter-agents get only half the race pick, plus the
 * spy techs, telepathy, government security and security buildings.
 */
export function securityLevel(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]!;
  const race = getRace(player.raceId);
  let sec = race.picks.spying / 2 + empireBonus(player).spying + empireBonus(player).security + government(player).security +
    (hasTrait(race, "telepathic") ? TELEPATHIC_SPY_LEVELS : 0);

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
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId || c.outpost) continue;
    const o = colonyOutput(state, c);
    colonies += o.bc;
    maintenance += o.maintenance;
  }
  const salaries = Object.values(state.leaders).filter((l) => l.ownerId === playerId).reduce((s, l) => s + l.salary, 0);
  const over = Math.max(0, commandPointsUsed(state, playerId) - commandPointsAvailable(state, playerId));
  const commandOverage = over * COMMAND_OVERAGE_COST;
  return { colonies, maintenance, salaries, commandOverage, net: colonies - maintenance - salaries - commandOverage };
}
