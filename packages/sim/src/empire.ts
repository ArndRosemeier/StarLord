import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { DRIVES, FUEL_RANGES, HULLS_BY_ID, SUPPORT_SHIP_COMMAND_POINTS } from "./data/components.js";
import { GOVERNMENTS, type GovernmentDef } from "./data/governments.js";
import { getRace } from "./data/races.js";
import { colonyOutput, type EmpireIncome } from "./economy.js";
import { TECHS, type EmpireBonus } from "./data/techs.js";
import type { Colony, GameState, Player, PlayerId } from "./types.js";

/** Empire-wide derived numbers: tech bonuses, government, speed, range, command points. */

export function knows(player: Player, tech: string | null): boolean {
  return tech === null || player.techs.includes(tech);
}

const bonusCache = new Map<string, Required<EmpireBonus>>();

export function empireBonus(player: Player): Required<EmpireBonus> {
  const key = player.techs.join(",");
  const cached = bonusCache.get(key);
  if (cached) return cached;
  if (bonusCache.size > 5000) bonusCache.clear();
  const total: Required<EmpireBonus> = {
    foodPerFarmer: 0, industryPerWorker: 0, researchPerScientist: 0, maxPopPerSize: 0, growth: 0,
    groundCombat: 0, spying: 0, scanRange: 0, bcPerPop: 0, morale: 0, shipAttack: 0, shipDefense: 0,
    commandPoints: 0, pollutionCleanup: 0, maxPopFlat: 0, freeFood: 0, security: 0,
  };
  for (const t of player.techs) {
    const b = TECHS[t]?.bonus;
    if (!b) continue;
    for (const [k, v] of Object.entries(b) as [keyof EmpireBonus, number][]) total[k] += v;
  }
  total.pollutionCleanup = Math.min(1, total.pollutionCleanup);
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

export function fleetRange(player: Player): number {
  const known = FUEL_RANGES.filter((f) => knows(player, f.tech));
  return known.length ? known[known.length - 1]!.range : 3;
}

export const BASE_SCAN_RANGE = 2;

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
  let cp = BASE_COMMAND_POINTS + empireBonus(player).commandPoints;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    for (const b of c.buildings) cp += BUILDINGS_BY_ID[b]?.effects.commandPoints ?? 0;
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
