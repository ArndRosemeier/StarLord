import {
  BARRACKS, BATTLEOID_HITS, BOMB_BUILDING_CHANCE, BOMB_DAMAGE_PER_POP, BOMB_DAMAGE_PER_TROOP, CAPTURE_TECH_CHANCE,
  CONQUEST_UNREST_TURNS, MILITIA_PER_POP, POWERED_ARMOR_HITS,
  RATING_PER_LEVEL, SPORE_DEFENSE, SPORE_KILL_CHANCE_PER_POINT, TROOPS, WARLORD_TROOP_MULT, type TroopKind,
} from "./data/ground.js";
import { hullIndex } from "./data/components.js";
import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { getRace, hasTrait } from "./data/races.js";
import { commandoBonusAt } from "./leaders.js";
import { raceGroundBonus, troopHits } from "./raceEffects.js";
import { TIER_OF_TECH } from "./data/techs.js";
import { bombardment } from "./combat.js";
import type { TurnContext } from "./context.js";
import { designStats, findDesign } from "./designs.js";
import { bioWeaponOutrage, exterminationOutrage, isHostile } from "./diplomacy.js";
import { maxPopulation, population } from "./economy.js";
import { empireBonus, grantTech, knows } from "./empire.js";
import { removeShips } from "./fleetOps.js";
import { removePopulation } from "./jobs.js";
import type { Colony, Fleet, GameState, Garrison, Id, PlayerId } from "./types.js";

/**
 * Bombing, ground combat and conquest. Colonies are defended by militia
 * (every colony), marines (Marine Barracks) and tanks (Armor Barracks), which
 * train over time. Invaders land marines from troop ships; each fight pairs
 * one unit from each side, the higher roll plus rating wins and the loser
 * takes a hit. Ratings come from troop kind, race picks, equipment techs
 * (best rifle, armor and suit only), gravity and terrain.
 */

export interface GroundForces {
  militia: number;
  marines: number;
  armor: number;
}

function warlord(state: GameState, playerId: PlayerId): boolean {
  const p = state.players[playerId];
  return !!p && p.kind === "empire" && hasTrait(getRace(p.raceId), "warlord");
}

/** Most marines (or tanks) a colony's barracks keep. */
export function barracksCap(state: GameState, colony: Colony, kind: "marines" | "armor"): number {
  const def = kind === "marines" ? BARRACKS.marineBarracks : BARRACKS.armorBarracks;
  const pop = population(colony);
  const planet = state.planets[colony.planetId]!;
  const baseMax = maxPopulation(planet, getRace(colony.raceId));
  let cap = Math.floor(pop * def.capShare);
  if (kind === "marines") cap = Math.min(cap, Math.floor(baseMax * def.capShare));
  return cap * (warlord(state, colony.ownerId) ? WARLORD_TROOP_MULT : 1);
}

/** The ground units defending a colony now. */
export function garrisonOf(state: GameState, colony: Colony): GroundForces {
  if (colony.outpost) return { militia: 0, marines: 0, armor: 0 };
  const g = colony.garrison;
  return {
    militia: Math.ceil(population(colony) / MILITIA_PER_POP),
    marines: g?.marines ?? 0,
    armor: g?.armor ?? 0,
  };
}

/** Total defending ground units, for display and AI estimates. */
export function defendingTroops(state: GameState, colony: Colony): number {
  const g = garrisonOf(state, colony);
  return g.militia + g.marines + g.armor;
}

/** Barracks train troops: marines every 5 turns, tanks every 10 (twice as fast for warlords), up to their caps. */
export function garrisonTick(state: GameState): void {
  for (const c of Object.values(state.colonies)) {
    if (c.outpost) continue;
    const g: Garrison = (c.garrison ??= { marines: 0, armor: 0, marineTurn: 0, armorTurn: 0 });
    const speed = warlord(state, c.ownerId) ? WARLORD_TROOP_MULT : 1;
    for (const [building, def] of Object.entries(BARRACKS)) {
      const key = def.kind === "marines" ? "marineTurn" : "armorTurn";
      if (!c.buildings.includes(building)) continue;
      if (g[key] === 0) {
        // A new barracks comes with its first units.
        g[def.kind] = Math.max(g[def.kind], def.initial);
        g[key] = state.turn;
        continue;
      }
      if (state.turn - g[key] >= def.every / speed) {
        g[key] = state.turn;
        if (g[def.kind] < barracksCap(state, c, def.kind)) g[def.kind]++;
      }
    }
  }
}

interface Unit {
  rating: number;
  hits: number;
}

/** Rating and toughness of one unit of a kind fighting for a player's race. */
export function troopUnit(
  state: GameState, playerId: PlayerId, raceId: string, kind: TroopKind, defending: boolean, starId?: Id,
): Unit {
  const player = state.players[playerId]!;
  const race = getRace(raceId);
  // Race picks, low-G and subterranean come from the race module; Commando leaders fight where they serve.
  let rating = TROOPS[kind].rating + RATING_PER_LEVEL * empireBonus(player).groundCombat + raceGroundBonus(race, defending);
  if (starId) rating += commandoBonusAt(state, playerId, starId);
  let hits: number = TROOPS[kind].hits;
  if (kind === "armor" && knows(player, "battleoids")) hits = BATTLEOID_HITS;
  if (kind === "marines" && knows(player, "poweredArmor")) hits += POWERED_ARMOR_HITS;
  // High-G troops take one more hit.
  hits += troopHits(race) - 1;
  return { rating, hits };
}

/** Bomb damage first kills ground units: tanks, then marines, then militia (who are colonists). */
function bombTroops(colony: Colony, kills: number): number {
  const g = colony.garrison;
  let left = kills;
  if (g) {
    const a = Math.min(g.armor, left);
    g.armor -= a;
    left -= a;
    const m = Math.min(g.marines, left);
    g.marines -= m;
    left -= m;
  }
  return left;
}

/** Colonies whose orbital defenses are down this turn. */
export type Silenced = Set<Id>;

function hostileArmedAt(state: GameState, starId: Id, playerId: PlayerId): boolean {
  return Object.values(state.fleets).some((f) => f.starId === starId && isHostile(state, playerId, f.ownerId) && isArmedFleet(state, f));
}

export function isArmedFleet(state: GameState, f: Fleet): boolean {
  const owner = state.players[f.ownerId]!;
  return f.ships.some((s) => {
    const d = findDesign(owner, s.designId);
    return !!d && (!!d.fixed || d.weapons.length > 0);
  });
}

/** Whether a fleet can mind-control colonies: a telepathic owner and a cruiser or larger. */
export function canMindControl(state: GameState, fleet: Fleet, colony: Colony): boolean {
  const owner = state.players[fleet.ownerId]!;
  if (owner.kind !== "empire" || !hasTrait(getRace(owner.raceId), "telepathic")) return false;
  if (hasTrait(getRace(colony.raceId), "telepathic")) return false;
  return fleet.ships.some((s) => {
    const d = findDesign(owner, s.designId);
    return !!d && !d.fixed && hullIndex(d.hull) >= TRAIT_EFFECTS.telepathicMindControlSize;
  });
}

/** Bombing, invasion and mind control after orbital combat. */
export function groundPhase(ctx: TurnContext, silenced: Silenced): void {
  const { state, rng } = ctx;
  const sporeUsers = new Set<PlayerId>();
  for (const f of Object.values(state.fleets)) {
    if (!f.starId || !state.fleets[f.id]) continue;
    const owner = state.players[f.ownerId]!;
    if (owner.kind === "monsters") continue;
    const targets = Object.values(state.colonies).filter(
      (c) => state.planets[c.planetId]!.starId === f.starId && isHostile(state, f.ownerId, c.ownerId) && silenced.has(c.id),
    );
    if (targets.length === 0 || hostileArmedAt(state, f.starId, f.ownerId)) continue;

    if (f.invadeTarget && targets.some((c) => c.id === f.invadeTarget)) {
      const target = state.colonies[f.invadeTarget]!;
      // Telepaths take a beaten colony by will alone; their troops stay aboard.
      if (canMindControl(state, f, target)) {
        delete f.invadeTarget;

        ctx.emit({ kind: "colonyLost", playerId: target.ownerId, colonyId: target.id, to: f.ownerId, how: "invaded" });
        captureColony(ctx, target, f.ownerId, { assimilated: true });
      } else invade(ctx, f, target);
      continue;
    }
    if (f.stance !== "attack" && owner.kind !== "raiders") continue;
    for (const c of targets) {
      if (owner.kind === "raiders") {
        raze(ctx, c, rng.int(1, 3));
        continue;
      }
      const { bombs, spores } = bombardment(state, f);
      if (bombs <= 0 && spores <= 0) continue;
      let kills = 0;
      if (bombs > 0) {
        const troopKills = Math.floor(bombs / BOMB_DAMAGE_PER_TROOP + rng.next());
        bombTroops(c, troopKills);
        kills += Math.floor(bombs / BOMB_DAMAGE_PER_POP + rng.next());
      }
      if (spores > 0) {
        sporeUsers.add(f.ownerId);
        const defender = state.players[c.ownerId]!;
        const mult = Math.min(1, ...SPORE_DEFENSE.filter((d) => knows(defender, d.tech)).map((d) => d.mult));
        for (let i = 0; i < spores; i++) if (rng.chance(SPORE_KILL_CHANCE_PER_POINT * mult)) kills++;
      }
      raze(ctx, c, kills);
      if (bombs > 0 && state.colonies[c.id] && c.buildings.length > 0 && rng.chance(Math.min(BOMB_BUILDING_CHANCE.max, bombs * BOMB_BUILDING_CHANCE.perDamage))) {
        c.buildings.splice(rng.int(0, c.buildings.length - 1), 1);
      }
    }
  }
  for (const user of sporeUsers) bioWeaponOutrage(state, user);
}

/** Kills colonists; a colony with nobody left is gone and the planet is free again. */
export function raze(ctx: TurnContext, c: Colony, kills: number): void {
  const { state } = ctx;
  if (!state.colonies[c.id] || kills <= 0) return;
  const lost = removePopulation(c, kills);
  if (lost > 0) ctx.emit({ kind: "bombarded", playerId: c.ownerId, colonyId: c.id, popLost: lost });
  if (!c.outpost && population(c) === 0) {
    ctx.emit({ kind: "colonyLost", playerId: c.ownerId, colonyId: c.id, to: null, how: "destroyed" });
    destroyColony(state, c);
  }
}

export function destroyColony(state: GameState, colony: Colony): void {
  state.planets[colony.planetId]!.colonyId = null;
  delete state.colonies[colony.id];
}

/** Lands every troop ship in the fleet and fights it out. */
export function invade(ctx: TurnContext, f: Fleet, colony: Colony): void {
  const { state, rng } = ctx;
  const attacker = state.players[f.ownerId]!;
  let landed = 0;
  for (const s of [...f.ships]) {
    const d = findDesign(attacker, s.designId);
    const t = d ? designStats(attacker, d).troops : 0;
    if (t > 0) {
      landed += t * s.count;
      removeShips(state, f, s.designId, s.count);
    }
  }
  delete f.invadeTarget;
  const starId = state.planets[colony.planetId]!.starId;
  const atk = troopUnit(state, attacker.id, attacker.raceId, "marines", false, starId);
  const attackers: number[] = Array(landed).fill(atk.hits);
  const g = garrisonOf(state, colony);
  const defenders: { unit: Unit; hp: number; kind: TroopKind }[] = [];
  for (const kind of ["armor", "marines", "militia"] as const) {
    const unit = troopUnit(state, colony.ownerId, colony.raceId, kind, true, starId);
    for (let i = 0; i < g[kind]; i++) defenders.push({ unit, hp: unit.hits, kind });
  }
  // Each clash pairs the next invader with a random defender; the higher roll wounds the other.
  while (attackers.length > 0 && defenders.length > 0) {
    const di = rng.int(0, defenders.length - 1);
    const d = defenders[di]!;
    if (rng.int(1, 100) + atk.rating > rng.int(1, 100) + d.unit.rating) {
      if (--d.hp <= 0) defenders.splice(di, 1);
    } else if (--attackers[0]! <= 0) attackers.shift();
  }
  // Survivors stay on as the garrison; militia losses are colonists' lives.
  const left = (k: TroopKind) => defenders.filter((d) => d.kind === k).length;
  if (colony.garrison) {
    colony.garrison.armor = left("armor");
    colony.garrison.marines = left("marines");
  }
  if (attackers.length === 0) {
    ctx.emit({ kind: "invasionFailed", playerId: attacker.id, colonyId: colony.id });
    return;
  }
  const loser = colony.ownerId;
  ctx.emit({ kind: "colonyLost", playerId: loser, colonyId: colony.id, to: attacker.id, how: "invaded" });
  captureColony(ctx, colony, attacker.id, { marines: attackers.length });
}

/**
 * Hands a colony to a new owner after a conquest. Captured scientists
 * sometimes yield a technology. The conquered people keep their race and
 * resent their new rulers for a while (assimilation and revolts belong to the
 * economy; `conqueredFrom` tells it where a revolt would send the colony).
 */
export function captureColony(
  ctx: TurnContext, colony: Colony, newOwner: PlayerId, opts: { marines?: number; assimilated?: boolean } = {},
): void {
  const { state, rng } = ctx;
  const loser = colony.ownerId;
  const attacker = state.players[newOwner]!;
  colony.ownerId = newOwner;
  colony.queue = [];
  colony.progress = 0;
  colony.conqueredFrom = loser;
  if (opts.assimilated) {
    // Mind control: the population is assimilated at once.
    colony.raceId = colony.outpost ? attacker.raceId : colony.raceId;
  } else {
    colony.unrestUntil = state.turn + CONQUEST_UNREST_TURNS;
  }
  if (colony.outpost) colony.raceId = attacker.raceId;
  colony.garrison = { marines: opts.marines ?? 0, armor: 0, marineTurn: state.turn, armorTurn: state.turn };
  ctx.emit({ kind: "colonyCaptured", playerId: newOwner, colonyId: colony.id, from: loser });
  const loserTechs = state.players[loser]!.techs.filter((t) => !attacker.techs.includes(t) && TIER_OF_TECH[t]);
  if (loserTechs.length > 0 && rng.chance(CAPTURE_TECH_CHANCE)) {
    const tech = rng.pick(loserTechs);
    if (grantTech(attacker, tech)) ctx.emit({ kind: "techLearned", playerId: newOwner, techId: tech, tierId: TIER_OF_TECH[tech]!.id, source: "salvage" });
  }
  for (const l of Object.values(state.leaders)) {
    if (l.ownerId === loser && l.assignedTo === state.planets[colony.planetId]!.starId) l.assignedTo = null;
  }
}

/**
 * Hook for revolts (the economy decides when unassimilated people rise): the
 * colony returns to the empire it was taken from, if that empire still lives.
 */
export function revertColony(ctx: TurnContext, colony: Colony): boolean {
  const back = colony.conqueredFrom;
  if (back === undefined || !ctx.state.players[back]?.alive) return false;
  const from = colony.ownerId;
  ctx.emit({ kind: "colonyLost", playerId: from, colonyId: colony.id, to: back, how: "invaded" });
  colony.ownerId = back;
  colony.queue = [];
  colony.progress = 0;
  delete colony.conqueredFrom;
  colony.garrison = { marines: 0, armor: 0, marineTurn: ctx.state.turn, armorTurn: ctx.state.turn };
  ctx.emit({ kind: "colonyCaptured", playerId: back, colonyId: colony.id, from });
  return true;
}

/** Why a conquered colony's people cannot be exterminated, or null. */
export function exterminateProblem(state: GameState, playerId: PlayerId, colonyId: Id): string | null {
  const c = state.colonies[colonyId];
  const player = state.players[playerId]!;
  if (!c || c.ownerId !== playerId) return "not your colony";
  if (c.raceId === player.raceId && !(c.natives ?? 0)) return "these are your own people";
  if (player.government === "democracy" || player.government === "federation") return "democracies may not annihilate captured populations";
  return null;
}

/**
 * Exterminates the alien population of a colony. If nobody of your race is
 * left, the colony is lost. Every other empire is appalled.
 */
export function exterminate(ctx: TurnContext, playerId: PlayerId, colonyId: Id): void {
  const { state } = ctx;
  const c = state.colonies[colonyId]!;
  const player = state.players[playerId]!;
  if (c.raceId !== player.raceId) {
    const pop = population(c);
    ctx.emit({ kind: "bombarded", playerId, colonyId, popLost: pop });
    ctx.emit({ kind: "colonyLost", playerId, colonyId, to: null, how: "destroyed" });
    destroyColony(state, c);
  } else {
    const natives = c.natives ?? 0;
    c.farmers -= natives;
    c.natives = 0;
    if (population(c) === 0) destroyColony(state, c);
  }
  exterminationOutrage(state, playerId);
}
