import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { CLIMATES } from "./data/planets.js";
import { TIERS_BY_ID } from "./data/techs.js";
import { canSign, isHostile, relation } from "./diplomacy.js";
import { designStats, findDesign, validateDesign } from "./designs.js";
import { fleetRange, fleetSpeed } from "./empire.js";
import { population } from "./economy.js";
import { distance } from "./galaxy.js";
import { MAX_LEADERS } from "./data/leaders.js";
import { hullIndex } from "./data/components.js";
import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { getRace, hasTrait } from "./data/races.js";
import { hasRoomFor, hiredLeaders, hirePrice } from "./leaders.js";
import {
  availableBuildings, canBuildShips, availableDesigns, availableProjects, availableTiers, itemCost, researchOptions, starOf,
} from "./rules.js";
import { validateMutation } from "./mutation.js";
import type { RacePicks } from "./data/races.js";
import type {
  BuildItem, Colony, CombatDoctrine, Fleet, FleetStance, GameState, Id, PlayerId, ProposalKind, ShipDesign, SpyMission,
} from "./types.js";

/**
 * Everything a player (human, AI or automation) can do is a Command. The sim
 * only changes through commands plus turn processing, which is what makes
 * headless runs, replays and lockstep multiplayer possible.
 */
export type Command =
  | { type: "setJobs"; colonyId: Id; farmers: number; workers: number; scientists: number }
  | { type: "setQueue"; colonyId: Id; queue: BuildItem[] }
  | { type: "buy"; colonyId: Id }
  /** techId picks the application; general and hyper-advanced fields need none. */
  | { type: "setResearch"; tierId: string; techId?: string }
  /** Spends Evolutionary Mutation points on new race picks (same government). */
  | { type: "mutateRace"; picks: RacePicks }
  | { type: "setTaxRate"; rate: number }
  | { type: "moveFleet"; fleetId: Id; destStarId: Id }
  | { type: "colonize"; fleetId: Id; planetId: Id }
  | { type: "invade"; fleetId: Id; colonyId: Id }
  | { type: "splitFleet"; fleetId: Id; ships: { designId: string; count: number }[] }
  | { type: "mergeFleets"; fleetIds: Id[] }
  | { type: "setStance"; fleetId: Id; stance: FleetStance }
  | { type: "renameFleet"; fleetId: Id; name: string }
  | { type: "scrapShips"; fleetId: Id; designId: string; count: number }
  | { type: "saveDesign"; design: ShipDesign }
  | { type: "obsoleteDesign"; designId: string; obsolete: boolean }
  | { type: "setDoctrine"; doctrine: CombatDoctrine }
  | { type: "propose"; to: PlayerId; kind: ProposalKind }
  | { type: "respond"; proposalId: Id; accept: boolean }
  | { type: "declareWar"; target: PlayerId }
  | { type: "setSpies"; target: PlayerId; count: number; mission: SpyMission }
  | { type: "hireLeader"; leaderId: Id }
  | { type: "assignLeader"; leaderId: Id; targetId: Id | null }
  | { type: "dismissLeader"; leaderId: Id }
  | { type: "setCouncilVote"; vote: PlayerId | "abstain" | "auto" }
  | { type: "setAutomation"; domains: string[] };

export type CommandType = Command["type"];

export type CommandResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

export const MAX_QUEUE = 7;
export const TAX_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

function ownColony(state: GameState, playerId: PlayerId, id: Id): Colony | undefined {
  const c = state.colonies[id];
  return c && c.ownerId === playerId ? c : undefined;
}

function ownFleet(state: GameState, playerId: PlayerId, id: Id): Fleet | undefined {
  const f = state.fleets[id];
  return f && f.ownerId === playerId ? f : undefined;
}

/** Validates a command without changing state. */
export function validateCommand(state: GameState, playerId: PlayerId, cmd: Command): CommandResult {
  const player = state.players[playerId];
  if (!player || !player.alive || player.kind !== "empire") return fail("no such player");

  switch (cmd.type) {
    case "setJobs": {
      const c = ownColony(state, playerId, cmd.colonyId);
      if (!c) return fail("not your colony");
      const values = [cmd.farmers, cmd.workers, cmd.scientists];
      if (values.some((v) => !Number.isInteger(v) || v < 0)) return fail("jobs must be whole numbers");
      if (cmd.farmers + cmd.workers + cmd.scientists !== population(c)) return fail("jobs must add up to population");
      return OK;
    }
    case "setQueue": {
      const c = ownColony(state, playerId, cmd.colonyId);
      if (!c) return fail("not your colony");
      if (c.outpost) return fail("outposts cannot build");
      if (cmd.queue.length > MAX_QUEUE) return fail(`queue holds at most ${MAX_QUEUE} items`);
      const buildable = new Set(availableBuildings(state, playerId, c));
      const projects = new Set(availableProjects(state, playerId, c));
      const designs = new Set(availableDesigns(state, playerId));
      const seen = new Set<string>();
      for (const item of cmd.queue) {
        if (item.kind === "building") {
          if (!BUILDINGS_BY_ID[item.id]) return fail(`unknown building ${item.id}`);
          if (!buildable.has(item.id)) return fail(`${item.id} not available`);
          if (seen.has(item.id)) return fail(`${item.id} queued twice`);
          seen.add(item.id);
        }
        if (item.kind === "ship" && !designs.has(item.designId)) return fail(`design ${item.designId} not available`);
        if (item.kind === "ship" && !canBuildShips(c, findDesign(player, item.designId))) return fail("ships larger than destroyers need an orbital station here");
        // A one-off project already queued here stays valid when the queue is reordered.
        const alreadyHere = item.kind === "project" && c.queue.some((q) => q.kind === "project" && q.id === item.id);
        if (item.kind === "project" && !projects.has(item.id) && !alreadyHere) return fail(`project ${item.id} not available`);
      }
      return OK;
    }
    case "buy": {
      const c = ownColony(state, playerId, cmd.colonyId);
      if (!c) return fail("not your colony");
      const head = c.queue[0];
      if (!head || !Number.isFinite(itemCost(state, playerId, head, c))) return fail("nothing to buy");
      if (player.bc < buyCost(state, c)) return fail("not enough BC");
      return OK;
    }
    case "setResearch": {
      const tier = TIERS_BY_ID[cmd.tierId];
      if (!tier) return fail("unknown tier");
      if (!availableTiers(state, playerId).includes(cmd.tierId)) return fail("tier not available");
      if (cmd.techId !== undefined && !researchOptions(player, tier).includes(cmd.techId)) return fail("tech not offered by this field");
      return OK;
    }
    case "mutateRace": {
      const why = validateMutation(player, cmd.picks);
      return why ? fail(why) : OK;
    }
    case "setTaxRate":
      return TAX_STEPS.includes(cmd.rate) ? OK : fail("tax rate must be 0-50% in 10% steps");
    case "moveFleet": {
      const f = ownFleet(state, playerId, cmd.fleetId);
      if (!f) return fail("not your fleet");
      const dest = state.galaxy.stars.find((s) => s.id === cmd.destStarId);
      if (!dest) return fail("no such star");
      return canReach(state, playerId, f, dest.id) ? OK : fail("out of range");
    }
    case "colonize": {
      const f = ownFleet(state, playerId, cmd.fleetId);
      if (!f) return fail("not your fleet");
      const p = state.planets[cmd.planetId];
      if (!p || p.starId !== f.starId) return fail("fleet is not at that planet's star");
      if (p.colonyId) return fail("planet already colonized");
      if (!CLIMATES[p.type].habitable) return fail("asteroids and gas giants need an Artificial Planet first");
      const hasShip = f.ships.some((s) => {
        const d = findDesign(player, s.designId);
        return d && (d.module === "colony" || d.module === "outpost") && s.count > 0;
      });
      if (!hasShip) return fail("no colony or outpost ship");
      if (guarded(state, playerId, p.starId)) return fail("system is guarded by hostile ships");
      return OK;
    }
    case "invade": {
      const f = ownFleet(state, playerId, cmd.fleetId);
      if (!f) return fail("not your fleet");
      const c = state.colonies[cmd.colonyId];
      if (!c || state.planets[c.planetId]!.starId !== f.starId) return fail("no such colony here");
      if (!isHostile(state, playerId, c.ownerId)) return fail("not at war with that colony's owner");
      const troops = f.ships.reduce((n, s) => {
        const d = findDesign(player, s.designId);
        return n + (d ? designStats(player, d).troops * s.count : 0);
      }, 0);
      if (troops <= 0 && !canMindControl(state, f, c)) return fail("fleet carries no troops");
      return OK;
    }
    case "splitFleet": {
      const f = ownFleet(state, playerId, cmd.fleetId);
      if (!f) return fail("not your fleet");
      for (const s of cmd.ships) {
        const have = f.ships.find((x) => x.designId === s.designId)?.count ?? 0;
        if (!Number.isInteger(s.count) || s.count <= 0 || s.count > have) return fail("not enough ships to split");
      }
      const total = f.ships.reduce((n, s) => n + s.count, 0);
      const moving = cmd.ships.reduce((n, s) => n + s.count, 0);
      if (moving >= total) return fail("split must leave ships behind");
      return OK;
    }
    case "mergeFleets": {
      const fleets = cmd.fleetIds.map((id) => ownFleet(state, playerId, id));
      if (fleets.length < 2 || fleets.some((f) => !f)) return fail("not your fleets");
      const at = fleets[0]!.starId;
      if (!at || fleets.some((f) => f!.starId !== at)) return fail("fleets must orbit the same star");
      return OK;
    }
    case "setStance":
      return ownFleet(state, playerId, cmd.fleetId) ? OK : fail("not your fleet");
    case "renameFleet":
      return ownFleet(state, playerId, cmd.fleetId) && cmd.name.trim() ? OK : fail("bad fleet or name");
    case "scrapShips": {
      const f = ownFleet(state, playerId, cmd.fleetId);
      const have = f?.ships.find((s) => s.designId === cmd.designId)?.count ?? 0;
      return f && Number.isInteger(cmd.count) && cmd.count > 0 && cmd.count <= have ? OK : fail("nothing to scrap");
    }
    case "saveDesign": {
      if (player.designs.filter((d) => !d.obsolete).length >= 30 && !findDesign(player, cmd.design.id)) {
        return fail("too many designs; mark some obsolete");
      }
      const existing = findDesign(player, cmd.design.id);
      if (existing && shipsBuilt(state, playerId, existing.id)) return fail("design is in use; save it under a new id");
      return validateDesign(player, cmd.design) === null ? OK : fail(validateDesign(player, cmd.design)!);
    }
    case "obsoleteDesign":
      return findDesign(player, cmd.designId) ? OK : fail("no such design");
    case "setDoctrine": {
      const d = cmd.doctrine;
      if (!(d.retreatBelow >= 0 && d.retreatBelow <= 1)) return fail("retreat threshold must be 0..1");
      return ["nearest", "weakest", "strongest"].includes(d.focus) ? OK : fail("unknown focus");
    }
    case "propose": {
      const target = state.players[cmd.to];
      if (!target || target.kind !== "empire" || !target.alive || cmd.to === playerId) return fail("no such empire");
      if (state.proposals.some((p) => p.from === playerId && p.to === cmd.to && p.kind === cmd.kind)) return fail("already proposed");
      const why = canSign(state, playerId, cmd.to, cmd.kind);
      return why ? fail(why) : OK;
    }
    case "respond": {
      const p = state.proposals.find((x) => x.id === cmd.proposalId);
      if (!p || p.to !== playerId) return fail("no such proposal");
      if (cmd.accept && canSign(state, p.from, p.to, p.kind)) return fail("no longer possible");
      return OK;
    }
    case "declareWar": {
      const target = state.players[cmd.target];
      if (!target || target.kind !== "empire" || !target.alive || cmd.target === playerId) return fail("no such empire");
      if (!player.contacts.includes(cmd.target)) return fail("no contact");
      return relation(state, playerId, cmd.target).status === "war" ? fail("already at war") : OK;
    }
    case "setSpies": {
      const target = state.players[cmd.target];
      if (!target || target.kind !== "empire" || cmd.target === playerId) return fail("no such empire");
      if (!player.contacts.includes(cmd.target)) return fail("no contact");
      const current = player.spies.abroad[cmd.target]?.count ?? 0;
      if (!Number.isInteger(cmd.count) || cmd.count < 0) return fail("bad spy count");
      if (cmd.count - current > player.spies.home) return fail("not enough spies at home");
      return OK;
    }
    case "hireLeader": {
      const l = state.leaders[cmd.leaderId];
      if (!l || l.status !== "offered" || l.offeredTo !== playerId) return fail("no such offer");
      if (player.bc < hirePrice(state, playerId, l)) return fail("not enough BC");
      if (hiredLeaders(state, playerId).length >= MAX_LEADERS) return fail("too many leaders");
      if (!hasRoomFor(state, playerId, l.kind)) return fail(`too many ${l.kind === "captain" ? "ship officers" : "colony leaders"}`);
      return OK;
    }
    case "assignLeader": {
      const l = state.leaders[cmd.leaderId];
      if (!l || l.ownerId !== playerId || l.status !== "hired") return fail("not your leader");
      if (cmd.targetId === null) return OK;
      if (l.kind === "captain") return ownFleet(state, playerId, cmd.targetId) ? OK : fail("captains command your fleets");
      const owns = Object.values(state.colonies).some(
        (c) => c.ownerId === playerId && state.planets[c.planetId]!.starId === cmd.targetId,
      );
      return owns ? OK : fail("administrators govern your star systems");
    }
    case "dismissLeader": {
      const l = state.leaders[cmd.leaderId];
      return l && l.ownerId === playerId && l.status === "hired" ? OK : fail("not your leader");
    }
    case "setCouncilVote":
      if (cmd.vote === "abstain" || cmd.vote === "auto") return OK;
      return state.players[cmd.vote]?.kind === "empire" ? OK : fail("no such empire");
    case "setAutomation":
      return Array.isArray(cmd.domains) ? OK : fail("bad automation list");
  }
}

/**
 * Whether a telepathic empire's fleet can take a colony by mind control: a
 * cruiser or larger in orbit, and a colony of a race that is not telepathic
 * itself. Defenses must be down, as for any invasion.
 */
export function canMindControl(state: GameState, f: Fleet, colony: Colony): boolean {
  const owner = state.players[f.ownerId]!;
  if (!hasTrait(getRace(owner.raceId), "telepathic") || hasTrait(getRace(colony.raceId), "telepathic")) return false;
  return f.ships.some((s) => {
    const d = findDesign(owner, s.designId);
    return !!d && hullIndex(d.hull) >= TRAIT_EFFECTS.telepathicMindControlSize;
  });
}

export function shipsBuilt(state: GameState, playerId: PlayerId, designId: string): boolean {
  return Object.values(state.fleets).some((f) => f.ownerId === playerId && f.ships.some((s) => s.designId === designId)) ||
    Object.values(state.colonies).some((c) => c.ownerId === playerId && c.queue.some((q) => q.kind === "ship" && q.designId === designId));
}

/** Hostile armed ships at a star stop colonization. */
export function guarded(state: GameState, playerId: PlayerId, starId: Id): boolean {
  return Object.values(state.fleets).some((f) => {
    if (f.starId !== starId || !isHostile(state, playerId, f.ownerId)) return false;
    const owner = state.players[f.ownerId]!;
    return f.ships.some((s) => {
      const d = findDesign(owner, s.designId);
      return d && (d.fixed || d.weapons.length > 0);
    });
  });
}

export function distanceToNearestColony(state: GameState, playerId: PlayerId, point: { x: number; y: number }): number {
  let best = Infinity;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    best = Math.min(best, distance(starOf(state, c.planetId), point));
  }
  return best;
}

export function ownsColonyAt(state: GameState, playerId: PlayerId, starId: Id): boolean {
  return Object.values(state.colonies).some((c) => c.ownerId === playerId && state.planets[c.planetId]!.starId === starId);
}

/** Fuel range, plus the dimensional portal to and from the raiders' home. */
export function canReach(state: GameState, playerId: PlayerId, fleet: Fleet, destStarId: Id): boolean {
  const player = state.players[playerId]!;
  const dest = state.galaxy.stars.find((s) => s.id === destStarId)!;
  const here = fleet.starId ? state.galaxy.stars.find((s) => s.id === fleet.starId) : undefined;
  if (dest.special === "raiderHome") return player.hasPortal && !!here && ownsColonyAt(state, playerId, here.id);
  if (here?.special === "raiderHome") return ownsColonyAt(state, playerId, dest.id);
  if (!fleet.starId && !fleet.destStarId) return false;
  if (ownsColonyAt(state, playerId, dest.id)) return true;
  return distanceToNearestColony(state, playerId, dest) <= fleetRange(player);
}

/** Whole turns a fleet needs to reach a star, matching movement in processTurn; the portal is instant. */
export function travelTurns(state: GameState, fleet: Fleet, destStarId: Id): number {
  const dest = state.galaxy.stars.find((s) => s.id === destStarId)!;
  const here = fleet.starId ? state.galaxy.stars.find((s) => s.id === fleet.starId) : undefined;
  const d = distance(fleet, dest);
  if (d === 0) return 0;
  if (dest.special === "raiderHome" || here?.special === "raiderHome") return 1;
  return Math.ceil(d / fleetSpeed(state.players[fleet.ownerId]!));
}

/** MoO2 buy price: double the remaining cost, quadruple if nothing has been spent yet. */
export function buyCost(state: GameState, colony: Colony): number {
  const head = colony.queue[0];
  if (!head) return Infinity;
  const remaining = Math.max(0, itemCost(state, colony.ownerId, head, colony) - colony.progress);
  return Math.ceil(remaining * (colony.progress > 0 ? 2 : 4));
}
