import { attackTargetAt, targetKey, type Targets } from "./targets.js";
import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { MILITIA_PER_POP } from "./data/economy.js";
import { DIFFICULTY_ORDER } from "./data/galaxy.js";
import { GOVERNMENTS } from "./data/governments.js";
import {
  BASE_EQUIPMENT, BATTLEOID_HITS, BOMB_DAMAGE_PER_HIT, SPECIAL_UNIT_RATING, CAPTURE_LOSSES, CAPTURE_TECH, MARINES_PER_TRANSPORT,
  ASTEROID_BELT_SIZE, POWERED_ARMOR_HITS, RATING_PER_LEVEL, SPORE_DEFENSE, SPORE_KILL_CHANCE_PER_POINT, TROOPS, type TroopKind,
} from "./data/ground.js";
import { hullIndex } from "./data/components.js";
import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { getRace, hasTrait } from "./data/races.js";
import { commandoBonusAt, leaderStar } from "./leaders.js";
import { raceGroundBonus, troopHits } from "./raceEffects.js";
import { TIER_OF_TECH } from "./data/techs.js";
import { bombardment, planetDefense } from "./combat.js";

import { RELATION_EVENTS } from "./data/diplomacy.js";
import { SIZE_POP_BASE, gravityOf } from "./data/planets.js";
import type { TurnContext } from "./context.js";
import { ALL_WEAPONS, designStats, findDesign } from "./designs.js";
import { isHostile } from "./diplomacy.js";
import { destructionOutrage, rngRoll, scaleRelationEvent } from "./relations.js";
import { blocksInvasion } from "./commands.js";
import { destructibleBuildings, population } from "./economy.js";
import { empireBonus, grantTech, knows } from "./empire.js";
import { removeShips } from "./fleetOps.js";
import { removePopulation } from "./jobs.js";
import { noteAttack } from "./score.js";
import type { Colony, Fleet, GameState, Id, OrbitalChoice, PlayerId, ShipDesign } from "./types.js";

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
    militia: Math.floor(population(colony) * MILITIA_PER_POP),
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
  let rating = TROOPS[kind].rating + BASE_EQUIPMENT + RATING_PER_LEVEL * empireBonus(player).groundCombat + raceGroundBonus(race, defending);
  if (starId) rating += commandoBonusAt(state, playerId, starId, defending);
  // Computer players fight better on harder levels: -2 (tutor) to +2 (impossible).
  if (!player.isHuman && player.kind === "empire") rating += DIFFICULTY_ORDER.indexOf(state.settings.difficulty ?? "average") - 2;
  let hits: number = TROOPS[kind].hits;
  if (kind === "armor" && knows(player, "battleoids")) {
    hits += BATTLEOID_HITS;
    rating += SPECIAL_UNIT_RATING;
  }
  if (kind === "marines" && knows(player, "poweredArmor")) {
    hits += POWERED_ARMOR_HITS;
    rating += SPECIAL_UNIT_RATING;
  }
  // High-G troops take one more hit.
  hits += troopHits(race) - 1;
  return { rating, hits };
}

/** Bomb damage first kills ground units: tanks, then marines, then militia (who are colonists). */
/**
 * Spends bomb hits on a colony: each lands at random on a building (not its
 * defenses or capitol), a trained marine or tank (which needs as many hits as
 * it can take) or a colonist. Returns the colonists killed.
 */
function bombHits(ctx: TurnContext, colony: Colony, hits: number): number {
  const { state, rng } = ctx;
  const starId = state.planets[colony.planetId]!.starId;
  const cost = (kind: "marines" | "armor") => troopUnit(state, colony.ownerId, state.players[colony.ownerId]!.raceId, kind, true, starId).hits;
  let left = hits;
  let kills = 0;
  while (left > 0) {
    const wreckable = destructibleBuildings(colony).filter((b) => {
      const d = BUILDINGS_BY_ID[b]?.effects.defense;
      return !d?.station && !d?.installation && !d?.fighters;
    });
    const marines = colony.marinesTrained ?? 0;
    const tanks = colony.tanksTrained ?? 0;
    const pop = Math.max(0, population(colony) - kills);
    const total = wreckable.length + marines + tanks + pop;
    if (total === 0) break;
    let r = rng.int(1, total);
    if (r <= wreckable.length) {
      colony.buildings.splice(colony.buildings.indexOf(wreckable[r - 1]!), 1);
      left--;
      continue;
    }
    r -= wreckable.length;
    if (r <= marines + tanks) {
      const kind = r <= marines ? "marines" : "armor";
      const need = cost(kind);
      // A unit tougher than the hits left survives, and the bombing stops there.
      if (need > left) break;
      if (kind === "marines") colony.marinesTrained = marines - 1;
      else colony.tanksTrained = tanks - 1;
      left -= need;
      continue;
    }
    kills++;
    left--;
  }
  return kills;
}

/** Lands bombing hits from a battle on a colony: buildings, troops and colonists, as after-battle bombing does. */
export function bombColony(ctx: TurnContext, colony: Colony, hits: number): void {
  if (hits <= 0 || !ctx.state.colonies[colony.id]) return;
  raze(ctx, colony, bombHits(ctx, colony, hits));
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

/**
 * Why a player can't take a colony by mind control now, or null when they can.
 * The original's rule (FUN_000c620e): the player's race is telepathic, one of
 * their warships at the colony's star is a cruiser or larger, the colony's owner
 * is not telepathic too, and no Telepath officer of the owner is at that star
 * (a captain with a fleet there or the system's administrator). The orbit must
 * have been won first; a Planetary Barrier Shield does not stop it.
 */
export function mindControlProblem(state: GameState, playerId: PlayerId, colony: Colony): string | null {
  const player = state.players[playerId];
  if (!player || !telepathic(state, playerId)) return "only telepathic races can mind-control colonies";
  const starId = state.planets[colony.planetId]?.starId;
  const big = Object.values(state.fleets).some((f) => f.ownerId === playerId && f.starId === starId && f.ships.some((s) => {
    const d = findDesign(player, s.designId);
    return s.count > 0 && !!d && !d.fixed && hullIndex(d.hull) >= TRAIT_EFFECTS.telepathicMindControlSize;
  }));
  if (!big) return "needs a cruiser or larger warship in orbit";
  const owner = state.players[colony.ownerId];
  if (owner?.kind === "empire" && hasTrait(getRace(owner.raceId), "telepathic")) return `the ${owner.name} are telepathic too and shrug off the attempt`;
  const guard = Object.values(state.leaders ?? {}).find((l) => l.ownerId === colony.ownerId && l.status !== "pool" && l.status !== "offered"
    && l.assignedTo && leaderStar(state, l) === starId && l.abilities.some((a) => a.skill === "telepath"));
  if (guard) return `${guard.name}, a Telepath officer of the ${owner?.name ?? "defender"}, guards this system`;
  return null;
}

const telepathic = (state: GameState, playerId: PlayerId) => {
  const p = state.players[playerId];
  return p?.kind === "empire" && hasTrait(getRace(p.raceId), "telepathic");
};

/** Whether a fleet's owner can mind-control a colony at the fleet's star (see `mindControlProblem`). */
export function canMindControl(state: GameState, fleet: Fleet, colony: Colony): boolean {
  return fleet.starId === state.planets[colony.planetId]?.starId && mindControlProblem(state, fleet.ownerId, colony) === null;
}

/** Takes a beaten colony by mind control: it changes hands with every colonist assimilated at once. */
export function mindControl(ctx: TurnContext, by: PlayerId, colony: Colony): void {
  noteAttack(ctx.state, colony.ownerId, by);
  captureColony(ctx, colony, by, { mindControl: true });
}

/** Every orbital choice, in the order the prompt offers them. */
export const ORBITAL_CHOICES: readonly OrbitalChoice[] = ["mind", "bomb", "bio", "destroy", "none"];

/** Whether a ship of the design carries a Stellar Converter. */
function hasConverter(d: ShipDesign | undefined): boolean {
  return !!d && !d.fixed && d.weapons.some((m) => ALL_WEAPONS[m.weaponId]?.effect === "stellarConverter");
}

/** Whether any of a player's ships at a star carries a Stellar Converter (the original checks every ship in orbit). */
export function converterInOrbit(state: GameState, playerId: PlayerId, starId: Id): boolean {
  const owner = state.players[playerId];
  if (!owner) return false;
  return Object.values(state.fleets).some((f) => f.ownerId === playerId && f.starId === starId
    && f.ships.some((s) => s.count > 0 && hasConverter(findDesign(owner, s.designId))));
}

/**
 * The colony a fleet could strike from orbit now: the one planet its owner attacked at its star this turn, when its
 * defenses are down and no armed enemy is left there. Combat has planet scale, so every other colony in the
 * system is out of reach until a battle is fought over it.
 */
function orbitTargets(state: GameState, f: Fleet, silenced: Silenced, targets?: Targets): Colony[] {
  if (!f.starId || hostileArmedAt(state, f.starId, f.ownerId)) return [];
  const c = targets ? state.colonies[targets.get(targetKey(f.ownerId, f.starId)) ?? ""] : attackTargetAt(state, f.ownerId, f.starId);
  return c && state.planets[c.planetId]!.starId === f.starId && isHostile(state, f.ownerId, c.ownerId) && silenced.has(c.id) ? [c] : [];
}

/** What a fleet does to a colony when its owner gave no orbital order: attack-stance fleets and raiders bombard, without biological weapons. */
export function defaultOrbitalChoice(state: GameState, f: Fleet): OrbitalChoice {
  return f.stance === "attack" || state.players[f.ownerId]!.kind === "raiders" ? "bomb" : "none";
}

/** Thrown inside `processTurn` when a player has to decide what to do to a colony whose orbit they hold (see `pendingOrbital`). */
export class OrbitalPause {
  constructor(readonly prompt: OrbitalPrompt) {}
}

/** Bombing, invasion, mind control and planet destruction after orbital combat. */
export function groundPhase(ctx: TurnContext, silenced: Silenced, targets?: Targets): void {
  const { state, rng } = ctx;
  const outraged = new Set<PlayerId>();
  for (const f of Object.values(state.fleets)) {
    if (!f.starId || !state.fleets[f.id]) continue;
    const owner = state.players[f.ownerId]!;
    if (owner.kind === "monsters") continue;
    const open = orbitTargets(state, f, silenced, targets);
    if (open.length === 0) continue;

    const invadeTarget = f.invadeTarget ? open.find((c) => c.id === f.invadeTarget) : undefined;
    // Telepaths take a beaten colony by will alone, barrier shield or not; their troops stay aboard.
    if (invadeTarget && canMindControl(state, f, invadeTarget)) {
      delete f.invadeTarget;
      mindControl(ctx, f.ownerId, invadeTarget);
      continue;
    }
    // A Planetary Barrier Shield keeps every troop out.
    if (invadeTarget && !blocksInvasion(invadeTarget)) {
      invade(ctx, f, invadeTarget);
      continue;
    }
    for (const c of open) {
      if (!state.colonies[c.id] || !state.fleets[f.id]) continue;
      const choice = orbitalChoiceFor(ctx, f, c);
      if (choice === "none") continue;
      if (choice === "mind") {
        if (mindControlProblem(state, f.ownerId, c) === null) mindControl(ctx, f.ownerId, c);
        continue;
      }
      if (choice === "destroy" && converterInOrbit(state, f.ownerId, f.starId)) {
        destroyPlanet(ctx, f.ownerId, c);
        outraged.add(f.ownerId);
        continue;
      }
      // Raiders who hold the field always bombard with whatever their ships carry; they never invade.
      const { bombs, spores } = bombardment(state, f, planetDefense(c).shield);
      // Biological weapons are released only when ordered, and can't get through a barrier shield.
      const bio = choice === "bio" && spores > 0 && !blocksInvasion(c);
      if (bombs <= 0 && !bio) continue;
      const buildingsBefore = c.buildings.length;
      const popBefore = population(c);
      noteAttack(state, c.ownerId, f.ownerId);
      let kills = 0;
      if (bombs > 0) kills += bombHits(ctx, c, Math.floor(bombs / BOMB_DAMAGE_PER_HIT + rng.next()));
      if (bio) {
        outraged.add(f.ownerId);
        const mult = bioDefense(state, c);
        for (let i = 0; i < spores; i++) if (rng.chance(SPORE_KILL_CHANCE_PER_POINT * mult)) kills++;
      }
      const victim = c.ownerId;
      const name = c.name;
      raze(ctx, c, kills);
      if (owner.kind === "empire") {
        ctx.emit({
          kind: "orbitalStrike", playerId: f.ownerId, by: f.ownerId, victim, starId: f.starId, colonyName: name,
          choice: bio ? "bio" : "bomb", popKilled: Math.min(popBefore, kills), buildingsLost: buildingsBefore - c.buildings.length,
          colonyGone: !state.colonies[c.id], planetDestroyed: false,
        });
      }
    }
  }
  for (const user of outraged) destructionOutrage(state, user, rngRoll(rng));
}

/** How much of the biological weapons' kill chance gets through a colony owner's medicine (Microbiotics, Universal Antidote). */
function bioDefense(state: GameState, c: Colony): number {
  const defender = state.players[c.ownerId]!;
  return Math.min(1, ...SPORE_DEFENSE.filter((d) => knows(defender, d.tech)).map((d) => d.mult));
}

/** The orbital choice a fleet follows for a colony: its owner's order, else (asking a human first when the turn can stop) the default. */
function orbitalChoiceFor(ctx: TurnContext, f: Fleet, c: Colony): OrbitalChoice {
  const ordered = ctx.orbitalOrders?.get(c.id)?.get(f.ownerId);
  if (ordered) return ordered;
  const choice = defaultOrbitalChoice(ctx.state, f);
  // A telepath who could take the colony is always asked, whatever the fleet's stance.
  const ask = choice !== "none" || mindControlProblem(ctx.state, f.ownerId, c) === null;
  if (ask && ctx.pauseAtOrbit?.(f.ownerId, c.id)) throw new OrbitalPause(orbitalPrompt(ctx.state, f.ownerId, c.id));
  return choice;
}

/**
 * A Stellar Converter fired from orbit: the planet becomes an asteroid belt,
 * and the colony with everyone and everything on it is gone. Its special
 * (and any natives) go with it, as in the original.
 */
export function destroyPlanet(ctx: TurnContext, by: PlayerId, c: Colony): void {
  const { state } = ctx;
  const planet = state.planets[c.planetId]!;
  const pop = population(c);
  const buildings = c.buildings.length;
  const victim = c.ownerId;
  noteAttack(state, victim, by);
  if (pop > 0) ctx.emit({ kind: "bombarded", playerId: victim, colonyId: c.id, popLost: pop });
  ctx.emit({ kind: "colonyLost", playerId: victim, colonyId: c.id, to: null, how: "destroyed" });
  for (const p of new Set([by, victim])) {
    if (state.players[p]?.kind !== "empire") continue;
    ctx.emit({
      kind: "orbitalStrike", playerId: p, by, victim, starId: planet.starId, colonyName: c.name, choice: "destroy",
      popKilled: pop, buildingsLost: buildings, colonyGone: true, planetDestroyed: true,
    });
  }
  destroyColony(state, c);
  for (const l of Object.values(state.leaders)) {
    const stillThere = Object.values(state.colonies).some((o) => o.ownerId === victim && state.planets[o.planetId]!.starId === planet.starId);
    if (l.ownerId === victim && l.assignedTo === planet.starId && !stillThere) l.assignedTo = null;
  }
  planet.type = "asteroids";
  planet.size = ASTEROID_BELT_SIZE;
  planet.gravity = gravityOf(ASTEROID_BELT_SIZE, planet.minerals);
  planet.special = "none";
  delete planet.natives;
}

/** One orbital option for the prompt, with what it is expected to do. */
export interface OrbitalOption {
  choice: OrbitalChoice;
  available: boolean;
  /** Why it cannot be chosen, when it cannot. */
  why?: string;
  /** Expected bombing hits (each lands on a building, a trained unit or a colonist). */
  hits: number;
  /** Expected colonists killed, out of `OrbitalPrompt.population`. */
  popKilled: number;
  /** Expected buildings wrecked. */
  buildingsLost: number;
  /** Every other computer empire in contact takes a relation hit (see `OrbitalPrompt.outrage`). */
  outrage: boolean;
}

/** What a player's fleets in orbit over an enemy colony can do to it now, for the orbital prompt and the AI. */
export interface OrbitalPrompt {
  playerId: PlayerId;
  colonyId: Id;
  colonyName: string;
  ownerId: PlayerId;
  starId: Id;
  /** Colonists living there now. */
  population: number;
  /** Buildings bombs can hit (defenses and the capitol can't be hit). */
  buildings: number;
  troops: GroundForces;
  /** Damage the planetary shield takes off every bomb. */
  shield: number;
  barrier: boolean;
  /** Fleets that would strike. */
  fleetIds: Id[];
  /**
   * Biological weapons and planet destruction appal every computer empire in contact that is not at war with the
   * player: each relation changes by -1 to -`roll` before scaling, here `from`..`to` after it.
   */
  outrage: { roll: number; empires: { playerId: PlayerId; from: number; to: number }[] };
  options: OrbitalOption[];
  /** Building ids torn down if the colony is taken (invasion or mind control), and BC the taker gets back. */
  captureLosses: { buildings: string[]; refund: number };
}

/** Bomb-hit targets a colony offers: wreckable buildings, trained marines and tanks, colonists. */
function bombTargets(colony: Colony): { buildings: number; units: number; pop: number } {
  const buildings = destructibleBuildings(colony).filter((b) => {
    const d = BUILDINGS_BY_ID[b]?.effects.defense;
    return !d?.station && !d?.installation && !d?.fighters;
  }).length;
  return { buildings, units: (colony.marinesTrained ?? 0) + (colony.tanksTrained ?? 0), pop: population(colony) };
}

/**
 * What each orbital choice would do to a colony with the player's fleets at
 * its star (expected values; the strike rolls them), and which are open:
 * biological weapons need a ship that carries them and no barrier shield,
 * destruction a Stellar Converter in orbit.
 */
export function orbitalPrompt(state: GameState, playerId: PlayerId, colonyId: Id): OrbitalPrompt {
  const c = state.colonies[colonyId]!;
  const starId = state.planets[c.planetId]!.starId;
  const shield = planetDefense(c).shield;
  const fleets = Object.values(state.fleets).filter((f) => f.ownerId === playerId && f.starId === starId && !f.invadeTarget);
  let bombs = 0;
  let spores = 0;
  for (const f of fleets) {
    const b = bombardment(state, f, shield);
    bombs += b.bombs;
    spores += b.spores;
  }
  const t = bombTargets(c);
  const barrier = blocksInvasion(c);
  const hits = bombs / BOMB_DAMAGE_PER_HIT;
  const pool = t.buildings + t.units + t.pop;
  const share = (n: number) => (pool > 0 ? Math.min(n, (hits * n) / pool) : 0);
  const bombKills = share(t.pop);
  const bioKills = barrier ? 0 : Math.max(0, Math.min(t.pop - bombKills, spores * SPORE_KILL_CHANCE_PER_POINT * bioDefense(state, c)));
  const converter = converterInOrbit(state, playerId, starId);
  const mind = mindControlProblem(state, playerId, c);
  const all: OrbitalOption[] = [
    {
      choice: "mind", available: mind === null, why: mind ?? undefined,
      hits: 0, popKilled: 0, buildingsLost: 0, outrage: false,
    },
    {
      choice: "bomb", available: bombs > 0, why: bombs > 0 ? undefined : "no weapon in orbit gets through the planetary shield",
      hits, popKilled: bombKills, buildingsLost: share(t.buildings), outrage: false,
    },
    {
      choice: "bio", available: spores > 0 && !barrier,
      why: spores <= 0 ? "no ship in orbit carries biological weapons" : barrier ? "a Planetary Barrier Shield keeps biological weapons out" : undefined,
      hits, popKilled: bombKills + bioKills, buildingsLost: share(t.buildings), outrage: true,
    },
    {
      choice: "destroy", available: converter, why: converter ? undefined : "needs a ship with a Stellar Converter in orbit",
      hits: 0, popKilled: t.pop, buildingsLost: c.buildings.length, outrage: true,
    },
    { choice: "none", available: true, hits: 0, popKilled: 0, buildingsLost: 0, outrage: false },
  ];
  // Only telepaths are offered mind control.
  const options = all.filter((o) => o.choice !== "mind" || telepathic(state, playerId));
  // Computer empires in contact and not at war take it (scaled by their feelings and temperament).
  const appalled = state.players.flatMap((p) => {
    const worst = scaleRelationEvent(state, -RELATION_EVENTS.destruction, playerId, p.id);
    const least = scaleRelationEvent(state, -1, playerId, p.id);
    return worst === null || least === null ? [] : [{ playerId: p.id, from: least, to: worst }];
  });
  return {
    playerId, colonyId, colonyName: c.name, ownerId: c.ownerId, starId, population: t.pop, buildings: t.buildings,
    troops: garrisonOf(state, c), shield, barrier, fleetIds: fleets.map((f) => f.id),
    outrage: { roll: RELATION_EVENTS.destruction, empires: appalled },
    options,
    captureLosses: captureLosses(state, c, playerId),
  };
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
  noteAttack(state, colony.ownerId, attacker.id);
  let landed = 0;
  const transports: { designId: string; count: number }[] = [];
  for (const s of f.ships) {
    const d = findDesign(attacker, s.designId);
    const t = d ? designStats(attacker, d).troops : 0;
    if (t > 0) {
      landed += t * s.count;
      transports.push({ designId: s.designId, count: s.count });
    }
  }
  delete f.invadeTarget;
  const starId = state.planets[colony.planetId]!.starId;
  const atk = troopUnit(state, attacker.id, attacker.raceId, "marines", false, starId);
  const attackers: number[] = Array(landed).fill(atk.hits);
  const g = garrisonOf(state, colony);
  const defenders: { unit: Unit; hp: number; kind: TroopKind }[] = [];
  for (const kind of ["armor", "marines", "militia"] as const) {
    const unit = troopUnit(state, colony.ownerId, state.players[colony.ownerId]!.raceId, kind, true, starId);
    for (let i = 0; i < g[kind]; i++) defenders.push({ unit, hp: unit.hits, kind });
  }
  // The defenders fight tanks first, then marines, then militia. Each clash pits the next unit of each side:
  // the lower roll takes a hit, and a tie wounds both.
  while (attackers.length > 0 && defenders.length > 0) {
    const d = defenders[0]!;
    const a = rng.int(1, 100) + atk.rating;
    const b = rng.int(1, 100) + d.unit.rating;
    if (a >= b && --d.hp <= 0) defenders.shift();
    if (b >= a && --attackers[0]! <= 0) attackers.shift();
  }
  // Survivors stay on as the garrison; militia losses are colonists' lives.
  const left = (k: TroopKind) => defenders.filter((d) => d.kind === k).length;
  colony.tanksTrained = Math.max(0, left("armor") - barracksTroops(colony, "tanks"));
  colony.marinesTrained = Math.max(0, left("marines") - barracksTroops(colony, "marines"));
  if (attackers.length === 0) {
    for (const t of transports) removeShips(state, f, t.designId, t.count);
    ctx.emit({ kind: "invasionFailed", playerId: attacker.id, colonyId: colony.id });
    return;
  }
  // The survivors re-board full troop ships, keeping at least one marine on the planet; the empty ships are dismantled.
  let spare = attackers.length - 1;
  let reboarded = 0;
  for (const t of transports) {
    const keep = Math.min(t.count, Math.floor(spare / MARINES_PER_TRANSPORT));
    spare -= keep * MARINES_PER_TRANSPORT;
    reboarded += keep;
    if (t.count > keep) removeShips(state, f, t.designId, t.count - keep);
  }
  captureColony(ctx, colony, attacker.id, { garrison: 1 + spare, reboarded });
}

/** Most marines a colony can hold as a garrison: half its planet size's base (warlords the whole), at least 1. */
export function marineCap(state: GameState, colony: Colony): number {
  const owner = state.players[colony.ownerId];
  const mult = owner && hasTrait(getRace(owner.raceId), "warlord") ? TRAIT_EFFECTS.warlordTroopMult : 1;
  const share = BUILDINGS_BY_ID["marineBarracks"]!.effects.training!.popShare;
  return Math.max(1, Math.floor(SIZE_POP_BASE[state.planets[colony.planetId]!.size] * share * mult));
}

/** Buildings a colony loses when it passes to a new owner, with any BC the new owner gets back for them. */
export function captureLosses(state: GameState, colony: Colony, newOwner: PlayerId): { buildings: string[]; refund: number } {
  const owner = state.players[newOwner]!;
  const unification = owner.government === "unification" || owner.government === "galacticUnification";
  const torn: readonly string[] = CAPTURE_LOSSES.buildings;
  const sold: readonly string[] = unification ? CAPTURE_LOSSES.unificationRefunds : [];
  const buildings = colony.buildings.filter((b) => torn.includes(b) || sold.includes(b));
  const refund = buildings.filter((b) => sold.includes(b))
    .reduce((sum, b) => sum + Math.floor((BUILDINGS_BY_ID[b]?.cost ?? 0) * CAPTURE_LOSSES.refundShare), 0);
  return { buildings, refund };
}

/** Rebels fight with their ruler's equipment, 20 below a marine. */
export const REBEL_RATING_SHIFT = -10;

/**
 * Rebels rise against a colony's garrison: they fight with the ruler's
 * equipment and their own race's picks at 20 below a marine, against the
 * tanks, marines and loyal militia in the usual order. Returns how many rebels
 * fell and whether they won.
 */
export function revoltFight(ctx: TurnContext, colony: Colony, rebels: number): { won: boolean; killed: number } {
  const { state, rng } = ctx;
  const starId = state.planets[colony.planetId]!.starId;
  const rebel = troopUnit(state, colony.ownerId, colony.raceId, "militia", false);
  rebel.rating += REBEL_RATING_SHIFT;
  const attackers: number[] = Array(rebels).fill(rebel.hits);
  const g = garrisonOf(state, colony);
  const loyal = population(colony) - (colony.aliens ?? 0);
  g.militia = Math.floor(loyal * MILITIA_PER_POP);
  const owner = state.players[colony.ownerId]!;
  const defenders: { unit: Unit; hp: number }[] = [];
  for (const kind of ["armor", "marines", "militia"] as const) {
    const unit = troopUnit(state, owner.id, owner.raceId, kind, true, starId);
    for (let i = 0; i < g[kind]; i++) defenders.push({ unit, hp: unit.hits });
  }
  let killed = 0;
  while (attackers.length > 0 && defenders.length > 0) {
    const d = defenders[0]!;
    const a = rng.int(1, 100) + rebel.rating;
    const b = rng.int(1, 100) + d.unit.rating;
    if (a >= b && --d.hp <= 0) defenders.shift();
    if (b >= a && --attackers[0]! <= 0) {
      attackers.shift();
      killed++;
    }
  }
  return { won: attackers.length > 0, killed };
}

/**
 * Hands a colony to a new owner (conquest, mind control or revolt), as the
 * original does for all three. Its people become aliens who must be
 * assimilated, unless they came from a feudal empire, the new ruler is
 * telepathic or they return to an empire of their own race. The Capitol,
 * barracks and Alien Management Center are torn down (see CAPTURE_LOSSES),
 * the queue and every trained ground unit are lost; `garrison` marines (capped
 * by `marineCap`) stay on for the new owner. Conquerors (not rebels) may learn
 * a technology from captured scientists.
 */
export function captureColony(
  ctx: TurnContext, colony: Colony, newOwner: PlayerId,
  opts: { revolt?: boolean; mindControl?: boolean; garrison?: number; reboarded?: number } = {},
): void {
  const { state, rng } = ctx;
  const loser = colony.ownerId;
  const loserPlayer = state.players[loser]!;
  const attacker = state.players[newOwner]!;
  const instantly = (loserPlayer.kind === "empire" && GOVERNMENTS[loserPlayer.government].assimilatesInstantly) ||
    hasTrait(getRace(attacker.raceId), "telepathic");
  const { buildings: lost, refund } = captureLosses(state, colony, newOwner);
  const how = opts.revolt ? "revolted" : opts.mindControl ? "mindControlled" : "invaded";
  ctx.emit({ kind: "colonyLost", playerId: loser, colonyId: colony.id, to: newOwner, how, lostBuildings: lost });
  colony.formerOwnerId = loser;
  colony.ownerId = newOwner;
  colony.queue = [];
  colony.progress = 0;
  colony.assimilation = 0;
  colony.tanksTrained = 0;
  colony.buildings = colony.buildings.filter((b) => !lost.includes(b));
  delete colony.readyBases;
  attacker.bc += refund;
  colony.marinesTrained = colony.outpost ? 0 : Math.min(marineCap(state, colony), Math.max(0, opts.garrison ?? 0));
  if (colony.outpost) colony.raceId = attacker.raceId;
  colony.aliens = colony.outpost || instantly || colony.raceId === attacker.raceId ? 0 : population(colony);
  ctx.emit({
    kind: "colonyCaptured", playerId: newOwner, colonyId: colony.id, from: loser,
    ...(opts.mindControl ? { mindControl: true as const } : {}),
    ...(opts.revolt ? { revolt: true as const } : {}),
    lostBuildings: lost, refund, garrison: colony.marinesTrained,
    ...(opts.reboarded ? { reboarded: opts.reboarded } : {}),
  });
  for (const l of Object.values(state.leaders)) {
    if (l.ownerId === loser && l.assignedTo === state.planets[colony.planetId]!.starId) l.assignedTo = null;
  }
  if (opts.revolt) return;
  // Conquered people earn the conqueror a score premium.
  if (!colony.outpost) attacker.capturedPop = (attacker.capturedPop ?? 0) + population(colony);
  // The conqueror studies the colony's buildings, then questions its people (see CAPTURE_TECH).
  const C = CAPTURE_TECH;
  const level = DIFFICULTY_ORDER.indexOf(state.settings.difficulty ?? "average");
  const odds = (o: { human: number; ai: number; aiPerDifficulty: number }) => (attacker.isHuman ? o.human : o.ai + o.aiPerDifficulty * level);
  let taken = 0;
  const learn = (tech: string) => {
    taken++;
    if (grantTech(attacker, tech)) ctx.emit({ kind: "techLearned", playerId: newOwner, techId: tech, tierId: TIER_OF_TECH[tech]!.id, source: "salvage" });
  };
  for (const b of colony.buildings) {
    if (taken >= C.maxTechs) break;
    const tech = BUILDINGS_BY_ID[b]?.requires;
    if (!tech || !TIER_OF_TECH[tech] || attacker.techs.includes(tech)) continue;
    if (rng.int(1, 1000) <= Math.floor(odds(C.perBuilding) / (taken + 1))) learn(tech);
  }
  const pool = loserPlayer.techs.filter((t) => !attacker.techs.includes(t) && TIER_OF_TECH[t]);
  for (let i = population(colony); i > 0 && taken < C.maxTechs && pool.length > 0; i--) {
    if (rng.int(1, 1000) > Math.floor(odds(C.perColonist) / (taken + 1))) continue;
    learn(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
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
 * left, the colony is lost. Every computer empire in contact is appalled (-d10 relation).
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
  destructionOutrage(state, playerId, rngRoll(ctx.rng));
}
