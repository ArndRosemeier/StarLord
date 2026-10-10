import {
  COMM_REDIRECT_RANGE, INTERDICTOR_RADIUS, INTERDICTOR_SPEED, JUMP_GATE_BONUS, MOVE_STEP, NEBULA_SPEED, WARP_INTERDICTOR,
} from "./data/movement.js";
import { ORBITAL_BASES } from "./data/techs.js";
import { relation, isHostile } from "./diplomacy.js";
import { fleetRange, fleetSpeed, hasFtl, knows } from "./empire.js";
import { blockedByBlackHole, distance } from "./galaxy.js";
import { getRace } from "./data/races.js";
import { ignoresSpaceHazards } from "./raceEffects.js";
import type { Fleet, GameState, Id, Nebula, PlayerId, Star } from "./types.js";

/**
 * Galaxy-map movement: fuel range (with allied refuelling), black holes,
 * wormholes, star gates, jump gates, nebulae, warp interdictors and in-flight
 * course changes. Everything here works on a PlayerView as well as on the
 * full state, so the UI and the AI see the same rules as the sim.
 */

type Point = { x: number; y: number };

function starById(state: GameState, id: Id | null | undefined): Star | undefined {
  return id ? state.galaxy.stars.find((s) => s.id === id) : undefined;
}

/** Colonies (and outposts) a player may refuel from: its own and, per the alliance treaty, its allies'. */
function refuelOwners(state: GameState, playerId: PlayerId): Set<PlayerId> {
  const owners = new Set<PlayerId>([playerId]);
  for (const p of state.players) {
    if (p.id !== playerId && p.kind === "empire" && relation(state, playerId, p.id).status === "alliance") owners.add(p.id);
  }
  return owners;
}

export function distanceToNearestColony(state: GameState, playerId: PlayerId, point: Point): number {
  const owners = refuelOwners(state, playerId);
  let best = Infinity;
  for (const c of Object.values(state.colonies)) {
    if (!owners.has(c.ownerId)) continue;
    const s = starById(state, state.planets[c.planetId]?.starId);
    if (s) best = Math.min(best, distance(s, point));
  }
  return best;
}

export function ownsColonyAt(state: GameState, playerId: PlayerId, starId: Id): boolean {
  return Object.values(state.colonies).some((c) => c.ownerId === playerId && state.planets[c.planetId]?.starId === starId);
}

/** A populated colony (not just an outpost) of this player at the star: star gates and jump gates are built there. */
export function hasColonyAt(state: GameState, playerId: PlayerId, starId: Id): boolean {
  return Object.values(state.colonies).some(
    (c) => c.ownerId === playerId && !c.outpost && state.planets[c.planetId]?.starId === starId,
  );
}

/** Parsecs per turn a Navigator captain adds to the fleet (0 without one). */
export function navigatorBonus(state: GameState, fleet: Fleet): number {
  return Math.max(0, ...Object.values(state.leaders).filter((l) => l.assignedTo === fleet.id).map((l) => l.skills.galaxySpeed ?? 0));
}

/** Whether a fleet's captain is a Navigator: nebulae don't slow it and it steers safely past black holes. */
export function hasNavigator(state: GameState, fleet: Fleet): boolean {
  return navigatorBonus(state, fleet) > 0;
}

/** Star Gate: instant travel between two of your colonies once the technology is known. */
export function isStarGateMove(state: GameState, playerId: PlayerId, fromStarId: Id | null, destStarId: Id): boolean {
  const player = state.players[playerId]!;
  if (!fromStarId || fromStarId === destStarId || !knows(player, "starGate")) return false;
  return hasColonyAt(state, playerId, fromStarId) && hasColonyAt(state, playerId, destStarId);
}

/** A stable wormhole joins two stars: one turn between them, whatever the distance. */
export function isWormholeMove(state: GameState, fromStarId: Id | null, destStarId: Id): boolean {
  return !!fromStarId && starById(state, fromStarId)?.wormholeTo === destStarId;
}

function isPortalMove(state: GameState, fromStarId: Id | null, destStarId: Id): boolean {
  return starById(state, destStarId)?.special === "raiderHome" || starById(state, fromStarId)?.special === "raiderHome";
}

/**
 * Whether a fleet already in hyperspace can be given a new destination:
 * Tachyon Communications reach 3 parsecs from one of your orbital bases,
 * Subspace 6, Hyperspace Communications anywhere.
 */
export function canRedirect(state: GameState, playerId: PlayerId, fleet: Fleet): boolean {
  if (fleet.starId) return true;
  const player = state.players[playerId]!;
  const range = Math.max(0, ...COMM_REDIRECT_RANGE.filter((c) => knows(player, c.tech)).map((c) => c.range));
  if (range === 0) return false;
  if (range === Infinity) return true;
  return Object.values(state.colonies).some((c) => {
    if (c.ownerId !== playerId || !c.buildings.some((b) => ORBITAL_BASES.includes(b))) return false;
    const s = starById(state, state.planets[c.planetId]?.starId);
    return !!s && distance(s, fleet) <= range;
  });
}

/** Why a fleet cannot be sent to a star, or null if it can. */
export function moveProblem(state: GameState, playerId: PlayerId, fleet: Fleet, destStarId: Id): string | null {
  const player = state.players[playerId]!;
  const dest = starById(state, destStarId);
  if (!dest) return "no such star";
  const here = starById(state, fleet.starId);
  if (!fleet.starId && !fleet.destStarId) return "fleet is lost in space";
  if (!fleet.starId && fleet.destStarId !== destStarId && !canRedirect(state, playerId, fleet)) {
    return "fleets in hyperspace can only be redirected with communication technology";
  }
  if (dest.special === "raiderHome") {
    return player.hasPortal && !!here && ownsColonyAt(state, playerId, here.id) ? null : "only a dimensional portal reaches there";
  }
  if (here?.special === "raiderHome") return ownsColonyAt(state, playerId, dest.id) ? null : "the portal only leads back to your colonies";
  if (!hasFtl(player)) return "no faster-than-light drive yet";
  if (dest.color === "blackHole") return "black holes cannot be entered";
  if (isStarGateMove(state, playerId, fleet.starId, destStarId) || isWormholeMove(state, fleet.starId, destStarId)) return null;
  if (blockedByBlackHole(state.galaxy.stars, fleet, dest) && !hasNavigator(state, fleet)) return "blocked by a black hole";
  if (ownsColonyAt(state, playerId, dest.id)) return null;
  return distanceToNearestColony(state, playerId, dest) <= fleetRange(player) ? null : "out of range";
}

/** Fuel range, black holes, gates and the dimensional portal. */
export function canReach(state: GameState, playerId: PlayerId, fleet: Fleet, destStarId: Id): boolean {
  return moveProblem(state, playerId, fleet, destStarId) === null;
}

/** Hostile warp interdictor fields a fleet's owner must cross. */
function interdictorFields(state: GameState, ownerId: PlayerId): Point[] {
  const out: Point[] = [];
  for (const c of Object.values(state.colonies)) {
    if (!c.buildings.includes(WARP_INTERDICTOR) || !isHostile(state, ownerId, c.ownerId)) continue;
    const s = starById(state, state.planets[c.planetId]?.starId);
    if (s) out.push(s);
  }
  return out;
}

interface Leg {
  speed: number;
  nebulae: Nebula[];
  interdictors: Point[];
  /** Arrives at once (portal, star gate, wormhole). */
  instant: boolean;
}

/** The rules for one fleet's current trip. */
function legFor(state: GameState, fleet: Fleet, dest: Star): Leg {
  const owner = state.players[fleet.ownerId]!;
  const from = fleet.starId ?? null;
  const instant = isPortalMove(state, from, dest.id) || isStarGateMove(state, fleet.ownerId, from, dest.id) || isWormholeMove(state, from, dest.id);
  const navigator = navigatorBonus(state, fleet);
  let speed = (fleet.speed ?? fleetSpeed(owner)) + navigator;
  // Jump gates speed travel between two of your colony systems.
  const origin = fleet.starId ?? fleet.fromStarId;
  if (origin && knows(owner, "jumpGate") && hasColonyAt(state, fleet.ownerId, origin) && hasColonyAt(state, fleet.ownerId, dest.id)) {
    speed += JUMP_GATE_BONUS;
  }
  // Navigators and trans-dimensional races are not slowed by nebulae.
  const hazardFree = navigator > 0 || ignoresSpaceHazards(getRace(owner.raceId));
  return { speed, nebulae: hazardFree ? [] : (state.nebulae ?? []), interdictors: interdictorFields(state, fleet.ownerId), instant };

}

/**
 * Advances a point toward a destination for one turn. Inside a nebula or an
 * enemy interdictor field ships crawl at 1 parsec per turn; elsewhere they go
 * at full speed, so only the part of the trip inside is slowed.
 */
function advance(leg: Leg, pos: Point, dest: Point): Point {
  let { x, y } = pos;
  let budget = 1;
  for (let guard = 0; guard < 10000 && budget > 1e-9; guard++) {
    const remaining = Math.hypot(dest.x - x, dest.y - y);
    if (remaining < 1e-9) return { x: dest.x, y: dest.y };
    const slow = leg.nebulae.some((n) => Math.hypot(n.x - x, n.y - y) <= n.r) ||
      leg.interdictors.some((p) => Math.hypot(p.x - x, p.y - y) <= INTERDICTOR_RADIUS);
    const speed = slow ? Math.min(leg.speed, NEBULA_SPEED, INTERDICTOR_SPEED) : leg.speed;
    // Fast path: nothing slows this fleet anywhere near, so the rest of the turn is one straight hop.
    const clear = leg.nebulae.length === 0 && leg.interdictors.length === 0;
    const step = clear ? remaining : Math.min(MOVE_STEP, remaining);
    const cost = step / speed;
    if (cost > budget) {
      const go = budget * speed;
      x += ((dest.x - x) / remaining) * go;
      y += ((dest.y - y) / remaining) * go;
      return { x, y };
    }
    budget -= cost;
    if (step === remaining) return { x: dest.x, y: dest.y };
    x += ((dest.x - x) / remaining) * step;
    y += ((dest.y - y) / remaining) * step;
  }
  return { x, y };
}

/** Moves one fleet for one turn. Returns true when it arrived. */
export function moveFleet(state: GameState, fleet: Fleet): boolean {
  const dest = starById(state, fleet.destStarId);
  if (!dest) return false;
  if (movementHalted(state, fleet)) return false;
  const leg = legFor(state, fleet, dest);
  if (fleet.starId) fleet.fromStarId = fleet.starId;
  const next = leg.instant ? { x: dest.x, y: dest.y } : advance(leg, fleet, dest);
  if (next.x === dest.x && next.y === dest.y) {
    fleet.x = dest.x;
    fleet.y = dest.y;
    fleet.starId = dest.id;
    fleet.destStarId = null;
    return true;
  }
  fleet.x = Math.round(next.x * 1000) / 1000;
  fleet.y = Math.round(next.y * 1000) / 1000;
  fleet.starId = null;
  return false;
}

/** Hyperspace flux holds every empire's ships except those of trans-dimensional races. */
function fluxBound(state: GameState, fleet: Fleet): boolean {
  const owner = state.players[fleet.ownerId];
  return owner?.kind === "empire" && !ignoresSpaceHazards(getRace(owner.raceId));
}

/** Hyperspace flux stops every ship; a warp funnel holds one fleet. */
export function movementHalted(state: GameState, fleet: Fleet): boolean {
  return (state.activeEvents ?? []).some(
    (e) => (e.kind === "hyperspaceFlux" && fluxBound(state, fleet)) || (e.kind === "warpFunnel" && e.fleetId === fleet.id),
  );
}

/** Whole turns a fleet needs to reach a star, matching movement in processTurn. */
export function travelTurns(state: GameState, fleet: Fleet, destStarId: Id): number {
  const dest = starById(state, destStarId);
  if (!dest) return 0;
  if (distance(fleet, dest) === 0) return 0;
  const leg = legFor(state, fleet, dest);
  if (leg.instant) return 1;
  let pos: Point = { x: fleet.x, y: fleet.y };
  for (let turns = 1; turns < 500; turns++) {
    pos = advance(leg, pos, dest);
    if (pos.x === dest.x && pos.y === dest.y) return turns;
  }
  return 500;
}

/**
 * An armed hostile fleet sitting unchallenged in a system blockades your
 * colonies there: production is halved and freighters cannot get through.
 */
export function isBlockaded(state: GameState, colonyId: Id): boolean {
  const colony = state.colonies[colonyId];
  if (!colony || colony.outpost) return false;
  const starId = state.planets[colony.planetId]?.starId;
  const armed = (f: Fleet) => {
    const owner = state.players[f.ownerId]!;
    return f.ships.some((s) => {
      const d = owner.designs.find((x) => x.id === s.designId);
      return !!d && (!!d.fixed || d.weapons.length > 0);
    });
  };
  const here = Object.values(state.fleets).filter((f) => f.starId === starId && armed(f));
  const enemy = here.some((f) => isHostile(state, colony.ownerId, f.ownerId));
  if (!enemy) return false;
  const friends = refuelOwners(state, colony.ownerId);
  return !here.some((f) => friends.has(f.ownerId));
}

