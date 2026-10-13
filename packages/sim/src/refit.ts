import { HULLS_BY_ID, REFIT } from "./data/components.js";
import { designStats, findDesign } from "./designs.js";
import { colonyOutput } from "./economy.js";
import { addShips, deleteFleet, takeShips } from "./fleetOps.js";
import { newId } from "./context.js";
import { availableDesigns, canBuildShips, isContinuous, itemCost, starOf } from "./rules.js";
import type { BuildItem, Colony, Fleet, GameState, Id, Player, PlayerId, ShipDesign } from "./types.js";

/**
 * Refitting, as in the original: a ship orbiting a system with one of your
 * colonies that could build its hull can be rebuilt to another design of the
 * same hull. The job goes into that colony's build queue and is paid with its
 * production like anything else; until it is done the ship is in dock and
 * takes no part in anything. It comes back with its crew's experience and
 * repaired. Removing the job from the queue scraps the ship.
 *
 * Drives (combat and travel speed) and fuel range follow your best technology
 * on every ship without a refit; armor, shields, computers, weapons and
 * specials are part of the design and change only by refitting.
 */

export type RefitJob = Extract<BuildItem, { kind: "refit" }>;

/** Ships that can be refitted: warships and scouts, not colony, outpost or troop ships, monsters or the raiders' citadel. */
export function refittable(design: ShipDesign | undefined): design is ShipDesign {
  return !!design && !design.module && !design.fixed;
}

/**
 * Production a refit costs: twice what the new design costs more than the
 * old one (both at today's prices), at least a quarter of the hull's base cost.
 */
export function refitCost(player: Player, from: ShipDesign, to: ShipDesign): number {
  const min = Math.floor(HULLS_BY_ID[to.hull].cost / REFIT.minHullCostDivisor);
  const diff = REFIT.costDifferenceMult * (designStats(player, to).cost - designStats(player, from).cost);
  return Math.max(min, Math.round(diff));
}

/** Designs a ship of `fromDesignId` can be refitted to: buildable designs of the same hull. */
export function refitTargets(state: GameState, playerId: PlayerId, fromDesignId: string): ShipDesign[] {
  const player = state.players[playerId]!;
  const from = findDesign(player, fromDesignId);
  if (!refittable(from)) return [];
  const ok = new Set(availableDesigns(state, playerId));
  return player.designs.filter((d) => ok.has(d.id) && refittable(d) && d.hull === from.hull && d.id !== from.id);
}

/** Your colonies at a star that can take a refit: anywhere you could build the hull (big hulls need an orbital station). */
export function refitDocks(state: GameState, playerId: PlayerId, starId: Id, to?: ShipDesign): Colony[] {
  return Object.values(state.colonies).filter(
    (c) => c.ownerId === playerId && state.planets[c.planetId]?.starId === starId && canBuildShips(c, to),
  );
}

/** Where a new refit job goes: at the end of the queue, but ahead of Trade Goods or Housing, which never finish. */
export function refitQueueIndex(queue: readonly BuildItem[]): number {
  const i = queue.findIndex((q) => isContinuous(q));
  return i < 0 ? queue.length : i;
}

/**
 * Turns until a refit of this cost, queued now at this colony, would be done
 * at the colony's current industry; null when it makes no industry. Every
 * item ahead of it takes at least a turn.
 */
export function refitTurns(state: GameState, colony: Colony, cost: number): number | null {
  const industry = colonyOutput(state, colony).industry;
  if (industry <= 0) return null;
  const ahead = colony.queue.slice(0, refitQueueIndex(colony.queue));
  const costAhead = ahead.reduce((n, q) => n + itemCost(state, colony.ownerId, q, colony), 0);
  if (!Number.isFinite(costAhead)) return null;
  const turns = Math.ceil((costAhead + cost - colony.progress) / industry);
  return Math.max(ahead.length + 1, turns);
}

export interface RefitOrder {
  fleetId: Id;
  designId: string;
  toDesignId: string;
  colonyId: Id;
  count: number;
}

/** Why a refit order can't be carried out, or null. */
export function refitProblem(state: GameState, playerId: PlayerId, o: RefitOrder): string | null {
  const player = state.players[playerId]!;
  const f = state.fleets[o.fleetId];
  if (!f || f.ownerId !== playerId) return "not your fleet";
  if (!f.starId) return "ships can only be refitted in orbit";
  const stack = f.ships.find((s) => s.designId === o.designId);
  if (!Number.isInteger(o.count) || o.count < 1 || !stack || stack.count < o.count) return "not that many ships";
  const from = findDesign(player, o.designId);
  if (!refittable(from)) return "colony, outpost and troop ships cannot be refitted";
  const to = findDesign(player, o.toDesignId);
  if (!to || !availableDesigns(state, playerId).includes(to.id) || !refittable(to)) return "that design can't be built";
  if (to.id === from.id) return "the ship already has that design";
  if (to.hull !== from.hull) return "a refit cannot change the hull";
  const c = state.colonies[o.colonyId];
  if (!c || c.ownerId !== playerId) return "not your colony";
  if (state.planets[c.planetId]?.starId !== f.starId) return "the colony must be in the system the ships orbit";
  if (!canBuildShips(c, to)) return c.outpost ? "outposts cannot refit ships" : "ships larger than destroyers need an orbital station here";
  return null;
}

/** Takes the ships out of their fleet and queues a refit job for each at the colony. */
export function startRefit(state: GameState, playerId: PlayerId, o: RefitOrder): void {
  const player = state.players[playerId]!;
  const f = state.fleets[o.fleetId]!;
  const c = state.colonies[o.colonyId]!;
  const from = findDesign(player, o.designId)!;
  const to = findDesign(player, o.toDesignId)!;
  const cost = refitCost(player, from, to);
  const stack = f.ships.find((s) => s.designId === o.designId)!;
  const xp = stack.xp ?? 0;
  // Intact ships go first; any damage is repaired in dock anyway.
  takeShips(stack, o.count);
  f.ships = f.ships.filter((s) => s.count > 0);
  if (f.ships.length === 0) deleteFleet(state, f.id);
  // Ids derive from the fleet and turn, not a game-wide counter, so the player's own
  // preview and the real turn agree on them whatever other empires did first.
  const used = new Set(refitJobs(state, playerId).map((x) => x.job.refitId));
  let n = 1;
  for (let i = 0; i < o.count; i++) {
    while (used.has(`${f.id}/${state.turn}/${n}`)) n++;
    const refitId = `${f.id}/${state.turn}/${n}`;
    used.add(refitId);
    const job: RefitJob = {
      kind: "refit", refitId, fromDesignId: from.id, designId: to.id, cost,
      ...(xp > 0 ? { xp } : {}), fleetId: f.id,
    };
    c.queue.splice(refitQueueIndex(c.queue), 0, job);
  }
}

/** Removes a refit job; the ship in dock is scrapped with it. */
export function cancelRefit(state: GameState, colony: Colony, refitId: Id): void {
  colony.queue = colony.queue.filter((q) => !(q.kind === "refit" && q.refitId === refitId));
  if (colony.queue.length === 0) colony.progress = 0;
}

/** A finished refit: the ship leaves dock with its new design, rejoining its old fleet if that still waits here. */
export function completeRefit(state: GameState, colony: Colony, job: RefitJob): void {
  const player = state.players[colony.ownerId]!;
  const design = findDesign(player, job.designId);
  if (!design) return;
  const star = starOf(state, colony.planetId);
  const idle = (f: Fleet) => f.ownerId === colony.ownerId && f.starId === star.id && !f.destStarId;
  const home = job.fleetId ? state.fleets[job.fleetId] : undefined;
  const fleet = (home && idle(home) ? home : undefined) ??
    Object.values(state.fleets).find((f) => idle(f) && f.stance === "defend" && f.ships.every((s) => refittable(findDesign(player, s.designId))));
  if (fleet) {
    addShips(fleet, design.id, 1, job.xp ?? 0);
    return;
  }
  const f: Fleet = {
    id: newId(state, "f"), ownerId: colony.ownerId, x: star.x, y: star.y, starId: star.id, destStarId: null,
    ships: [{ designId: design.id, count: 1, ...(job.xp ? { xp: job.xp } : {}) }], stance: "defend", name: `${design.name} Group`,
  };
  state.fleets[f.id] = f;
}

/** Refit jobs waiting in your colonies' queues. */
export function refitJobs(state: GameState, playerId: PlayerId): { colony: Colony; job: RefitJob }[] {
  return Object.values(state.colonies)
    .filter((c) => c.ownerId === playerId)
    .flatMap((c) => c.queue.flatMap((q) => (q.kind === "refit" ? [{ colony: c, job: q }] : [])));
}
