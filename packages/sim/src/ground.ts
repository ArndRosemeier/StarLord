import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { MILITIA_PER_POP } from "./data/economy.js";
import { GOVERNMENTS } from "./data/governments.js";
import {
  BATTLEOID_HITS, BOMB_BUILDING_CHANCE, BOMB_DAMAGE_PER_POP, BOMB_DAMAGE_PER_TROOP, CAPTURE_TECH_CHANCE,
  POWERED_ARMOR_HITS, RATING_PER_LEVEL, SPORE_DEFENSE, SPORE_KILL_CHANCE_PER_POINT, TROOPS, type TroopKind,
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
import { blocksInvasion } from "./commands.js";
import { destructibleBuildings, population } from "./economy.js";
import { empireBonus, grantTech, knows } from "./empire.js";
import { removeShips } from "./fleetOps.js";
import { removePopulation } from "./jobs.js";
import type { Colony, Fleet, GameState, Id, PlayerId } from "./types.js";

export interface GroundForces {
  militia: number;
  marines: number;
  armor: number;
}

/** Barracks troops a building fields from the start (marines from a Marine Barracks, tanks from an Armor Barracks). */
function barracksTroops(colony: Colony, kind: "marines" | "tanks"): number {
  let n = 0;
  for (const b of colony.buildings) {
    const e = BUILDINGS_BY_ID[b]?.effects;
    if (e?.troops && e.training?.kind === kind) n += e.troops;
  }
  return n;
}

/**
 * The ground units defending a colony now: militia from the population and
 * the barracks' marines and tanks (the economy trains more over time).
 */
export function garrisonOf(state: GameState, colony: Colony): GroundForces {
  if (colony.outpost) return { militia: 0, marines: 0, armor: 0 };
  return {
    militia: Math.ceil(population(colony) * MILITIA_PER_POP),
    marines: barracksTroops(colony, "marines") + (colony.marinesTrained ?? 0),
    armor: barracksTroops(colony, "tanks") + (colony.tanksTrained ?? 0),
  };
}

/** Total defending ground units, for display and AI estimates. */
export function defendingTroops(state: GameState, colony: Colony): number {
  const g = garrisonOf(state, colony);
  return g.militia + g.marines + g.armor;
}

/**
 * Bombing, ground combat and conquest. Colonies are defended by militia
 * (every colony), marines (Marine Barracks) and tanks (Armor Barracks), which
 * train over time. Invaders land marines from troop ships; each fight pairs
 * one unit from each side, the higher roll plus rating wins and the loser
 * takes a hit. Ratings come from troop kind, race picks, equipment techs
 * (best rifle, armor and suit only), gravity and terrain.
 */

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
  let left = kills;
  const a = Math.min(colony.tanksTrained ?? 0, left);
  if (a > 0) colony.tanksTrained = (colony.tanksTrained ?? 0) - a;
  left -= a;
  const m = Math.min(colony.marinesTrained ?? 0, left);
  if (m > 0) colony.marinesTrained = (colony.marinesTrained ?? 0) - m;
  left -= m;
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

    // A Planetary Barrier Shield keeps every troop out.
    if (f.invadeTarget && targets.some((c) => c.id === f.invadeTarget) && !blocksInvasion(state.colonies[f.invadeTarget]!)) {
      const target = state.colonies[f.invadeTarget]!;
      // Telepaths take a beaten colony by will alone; their troops stay aboard.
      if (canMindControl(state, f, target)) {
        delete f.invadeTarget;

        ctx.emit({ kind: "colonyLost", playerId: target.ownerId, colonyId: target.id, to: f.ownerId, how: "invaded" });
        captureColony(ctx, target, f.ownerId);
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
      // Biological weapons can't get through a barrier shield.
      if (spores > 0 && !blocksInvasion(c)) {
        sporeUsers.add(f.ownerId);
        const defender = state.players[c.ownerId]!;
        const mult = Math.min(1, ...SPORE_DEFENSE.filter((d) => knows(defender, d.tech)).map((d) => d.mult));
        for (let i = 0; i < spores; i++) if (rng.chance(SPORE_KILL_CHANCE_PER_POINT * mult)) kills++;
      }
      raze(ctx, c, kills);
      const wreckable = state.colonies[c.id] ? destructibleBuildings(c) : [];
      if (bombs > 0 && wreckable.length > 0 && rng.chance(Math.min(BOMB_BUILDING_CHANCE.max, bombs * BOMB_BUILDING_CHANCE.perDamage))) {
        const hit = wreckable[rng.int(0, wreckable.length - 1)]!;
        c.buildings.splice(c.buildings.indexOf(hit), 1);

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
  colony.tanksTrained = Math.max(0, left("armor") - barracksTroops(colony, "tanks"));
  colony.marinesTrained = Math.max(0, left("marines") - barracksTroops(colony, "marines"));
  if (attackers.length === 0) {
    ctx.emit({ kind: "invasionFailed", playerId: attacker.id, colonyId: colony.id });
    return;
  }
  const loser = colony.ownerId;
  ctx.emit({ kind: "colonyLost", playerId: loser, colonyId: colony.id, to: attacker.id, how: "invaded" });
  captureColony(ctx, colony, attacker.id);
}

/**
 * Hands a colony to a new owner (conquest, mind control or revolt). Its
 * people become aliens who must be assimilated, unless they came from a
 * feudal empire, the new ruler is telepathic or they return to an empire of
 * their own race. A captured Capitol is lost. Conquerors (not rebels) may
 * learn a technology from captured scientists.
 */
export function captureColony(ctx: TurnContext, colony: Colony, newOwner: PlayerId, opts: { revolt?: boolean } = {}): void {
  const { state, rng } = ctx;
  const loser = colony.ownerId;
  const loserPlayer = state.players[loser]!;
  const attacker = state.players[newOwner]!;
  const instantly = (loserPlayer.kind === "empire" && GOVERNMENTS[loserPlayer.government].assimilatesInstantly) ||
    hasTrait(getRace(attacker.raceId), "telepathic");
  colony.formerOwnerId = loser;
  colony.ownerId = newOwner;
  colony.queue = [];
  colony.progress = 0;
  colony.unrestUntil = 0;
  colony.assimilation = 0;
  colony.marinesTrained = 0;
  colony.tanksTrained = 0;
  colony.buildings = colony.buildings.filter((b) => !BUILDINGS_BY_ID[b]?.effects.capitol);
  if (colony.outpost) colony.raceId = attacker.raceId;
  colony.aliens = colony.outpost || instantly || colony.raceId === attacker.raceId ? 0 : population(colony);
  ctx.emit({ kind: "colonyCaptured", playerId: newOwner, colonyId: colony.id, from: loser });
  for (const l of Object.values(state.leaders)) {
    if (l.ownerId === loser && l.assignedTo === state.planets[colony.planetId]!.starId) l.assignedTo = null;
  }
  if (opts.revolt) return;
  const loserTechs = state.players[loser]!.techs.filter((t) => !attacker.techs.includes(t) && TIER_OF_TECH[t]);
  if (loserTechs.length > 0 && rng.chance(CAPTURE_TECH_CHANCE)) {
    const tech = rng.pick(loserTechs);
    if (grantTech(attacker, tech)) ctx.emit({ kind: "techLearned", playerId: newOwner, techId: tech, tierId: TIER_OF_TECH[tech]!.id, source: "salvage" });
  }
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
