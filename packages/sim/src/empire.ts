import { BUILDINGS_BY_ID, PROJECT_UPKEEP } from "./data/buildings.js";
import { DRIVES, FUEL_RANGES, HULLS_BY_ID } from "./data/components.js";
import { GOVERNMENTS, type GovernmentDef } from "./data/governments.js";
import { getRace } from "./data/races.js";
import { colonyOutput, foodPlan, type EmpireIncome } from "./economy.js";
import { ORBITAL_BASES, RESEARCH, TECHS, type EmpireBonus, type TechField } from "./data/techs.js";
import type { GameState, Player, PlayerId } from "./types.js";

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

export function fleetSpeed(player: Player): number {
  const known = DRIVES.filter((d) => knows(player, d.tech));
  const base = known.length ? known[known.length - 1]!.speed : 1;
  return base + (knows(player, "jumpGate") ? 1 : 0);
}

export function combatSpeed(player: Player): number {
  const known = DRIVES.filter((d) => knows(player, d.tech));
  return known.length ? known[known.length - 1]!.combatSpeed : 2;
}

export function fleetRange(player: Player): number {
  const known = FUEL_RANGES.filter((f) => knows(player, f.tech));
  return known.length ? known[known.length - 1]!.range : 3;
}

export const BASE_SCAN_RANGE = 2;

export function scanRange(player: Player): number {
  return BASE_SCAN_RANGE + empireBonus(player).scanRange;
}

export const BASE_COMMAND_POINTS = 3;
/** BC per turn for each command point over the limit. */
export const COMMAND_OVERAGE_COST = 10;

export function commandPointsAvailable(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]!;
  let cp = BASE_COMMAND_POINTS + empireBonus(player).commandPoints;
  const perBase = empireBonus(player).commandPointsPerBase;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
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
      if (!d || d.module || d.fixed) continue;
      if (d.weapons.length === 0) continue;
      used += HULLS_BY_ID[d.hull].commandPoints * s.count;
    }
  }
  return used;
}

export function spyingLevel(player: Player): number {
  return getRace(player.raceId).picks.spying + empireBonus(player).spying;
}

export function securityLevel(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]!;
  let sec = getRace(player.raceId).picks.spying + empireBonus(player).security + government(player).security;
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
