import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { BUY_PRICE_PER_POINT, FREIGHTERS, TAX_STEPS } from "./data/economy.js";
import { CLIMATES } from "./data/planets.js";
import { TIERS_BY_ID } from "./data/techs.js";
import { hullIndex } from "./data/components.js";
import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { getRace, hasTrait } from "./data/races.js";
import { hasRoomFor, hiredLeaders, hirePrice } from "./leaders.js";
import {
  audienceTired, canSign, giftProblem, hasTreaty, isHostile, relation, type Gift, type ProposalTerms, type TreatyName,
} from "./diplomacy.js";
import { designStats, findDesign, validateDesign } from "./designs.js";
import { foodPlan, population } from "./economy.js";
import { MAX_LEADERS } from "./data/leaders.js";
import { ORBITAL_CHOICES, canMindControl, exterminateProblem } from "./ground.js";
import { moveProblem } from "./movement.js";
import { bribeProblem } from "./randomEvents.js";
import {
  PLACED_PROJECTS, availableBuildings, baseClaims, baseTargets, canBuildShips, availableDesigns, availableProjects, availableTiers, itemCost,
  researchOptions,
} from "./rules.js";
import { validateMutation } from "./mutation.js";
import { debugProblem, type DebugAction } from "./debug.js";
import type { RacePicks } from "./data/races.js";
import type {
  BuildItem, Colony, CombatDoctrine, Fleet, FleetStance, GameState, Id, PlayerId, OrbitalChoice, ProposalKind, ShipDesign, SpyMission, TacticalOrder,
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
  /** Puts a finished Colony Base or Artificial Planet waiting at this colony on a planet in its system. */
  | { type: "placeBase"; colonyId: Id; projectId: string; planetId: Id }
  /** techId picks the application; general and hyper-advanced fields need none. */
  | { type: "setResearch"; tierId: string; techId?: string }
  /** Spends Evolutionary Mutation points on new race picks (same government). */
  | { type: "mutateRace"; picks: RacePicks }
  | { type: "setTaxRate"; rate: number }
  /** Freighters carry colonists to another colony of the same race; a whole fleet per colonist. */
  | { type: "moveColonists"; fromColonyId: Id; toColonyId: Id; count: number }
  /** Scraps idle freighters; they are worth nothing, but no longer need upkeep. */
  | { type: "scrapFreighters"; count: number }
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
  /** Whether this human commands their battles (the default) or lets them resolve by themselves. */
  | { type: "setAutoBattles"; on: boolean }
  /**
   * The player's orders for a battle of this turn, keyed by `battleKey`: one
   * per turn of their units in the order the units act, or "auto" when they
   * let the whole battle resolve by itself.
   */
  | { type: "battleOrders"; battle: string; orders: TacticalOrder[] | "auto" }
  /**
   * What this player's fleets do this turn to an enemy colony if they hold its orbit after the battles (see
   * `OrbitalChoice`). Without one, attack-stance fleets bombard without biological weapons.
   */
  | { type: "orbitalStrike"; colonyId: Id; choice: OrbitalChoice }
  /** Terms name the technologies, system, third empire or tribute share the proposal is about. */
  | ({ type: "propose"; to: PlayerId; kind: ProposalKind } & ProposalTerms)
  | { type: "breakTreaty"; target: PlayerId; treaty: TreatyName }
  | ({ type: "gift"; to: PlayerId } & Gift)
  /** Hands the whole empire to another; takes effect at the end of the turn. */
  | { type: "surrender"; to: PlayerId }
  /** Accept or refuse the council's verdict; refusing means war with everyone who accepts it. */
  | { type: "councilResponse"; accept: boolean }
  /** Kills a conquered colony's whole population (not under Democracy or Federation). */
  | { type: "exterminate"; colonyId: Id }

  /** Pays a monster's demand so it leaves the system. */
  | { type: "bribeMonster"; eventId: Id }
  | { type: "respond"; proposalId: Id; accept: boolean }
  | { type: "declareWar"; target: PlayerId }
  | { type: "setSpies"; target: PlayerId; count: number; mission: SpyMission }
  | { type: "hireLeader"; leaderId: Id }
  | { type: "assignLeader"; leaderId: Id; targetId: Id | null }
  | { type: "dismissLeader"; leaderId: Id }
  | { type: "setCouncilVote"; vote: PlayerId | "abstain" | "auto" }
  | { type: "setAutomation"; domains: string[] }
  /** Picks the strategy an automated area follows; "balanced" is the default. */
  | { type: "setAutomationStrategy"; domain: string; strategy: string }
  /** Whether the end-turn check lists colonies that only make Trade Goods; a per-game choice, on by default. */
  | { type: "setIdleAlert"; on: boolean }
  /** Cheats, accepted only in games started in debug mode. */
  | { type: "debug"; action: DebugAction };

export type CommandType = Command["type"];

export type CommandResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

export const MAX_QUEUE = 7;

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
      if (cmd.farmers < (c.natives ?? 0)) return fail("natives only farm");
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
        if (item.kind === "ship" && !canBuildShips(c, findDesign(player, item.designId))) {
          return fail(findDesign(player, item.designId)?.module === "transport" ? "troop ships need a Marine Barracks here" : "ships larger than destroyers need an orbital station here");
        }
        // A one-off project already queued here stays valid when the queue is reordered.
        const alreadyHere = item.kind === "project" && c.queue.some((q) => q.kind === "project" && q.id === item.id);
        if (item.kind === "project" && !projects.has(item.id) && !alreadyHere) return fail(`project ${item.id} not available`);
      }
      // Every Colony Base or Artificial Planet needs a planet of its own.
      for (const id of new Set(cmd.queue.flatMap((q) => (q.kind === "project" && PLACED_PROJECTS[q.id] ? [q.id] : [])))) {
        const claims = baseClaims(state, c, id, cmd.queue);
        const free = baseTargets(state, c, id).length;
        if (claims > free && claims > baseClaims(state, c, id)) return fail(`only ${free} free planet${free === 1 ? "" : "s"} in this system for ${id}`);
      }
      return OK;
    }
    case "placeBase": {
      const c = ownColony(state, playerId, cmd.colonyId);
      if (!c) return fail("not your colony");
      if (!(c.readyBases ?? []).includes(cmd.projectId)) return fail("no such base waiting here");
      if (!baseTargets(state, c, cmd.projectId).some((p) => p.id === cmd.planetId)) return fail("that planet can't take it");
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
    case "moveColonists": {
      const from = ownColony(state, playerId, cmd.fromColonyId);
      const to = ownColony(state, playerId, cmd.toColonyId);
      if (!from || !to || from.id === to.id) return fail("not your colonies");
      if (from.outpost || to.outpost) return fail("outposts hold no colonists");
      if (from.raceId !== to.raceId) return fail("colonists only join colonies of their own race");
      if (!Number.isInteger(cmd.count) || cmd.count <= 0) return fail("bad colonist count");
      if (population(from) - (from.aliens ?? 0) - cmd.count < 1) return fail("a colony must keep at least one loyal colonist");
      if (freeFreighters(state, playerId) < cmd.count * FREIGHTERS.perColonist) return fail("not enough idle freighters");
      return OK;
    }
    case "scrapFreighters":
      return Number.isInteger(cmd.count) && cmd.count > 0 && cmd.count <= freeFreighters(state, playerId)
        ? OK : fail("not that many idle freighters");
    case "moveFleet": {
      const f = ownFleet(state, playerId, cmd.fleetId);
      if (!f) return fail("not your fleet");
      if (cmd.destStarId === f.starId) return OK;
      const why = moveProblem(state, playerId, f, cmd.destStarId);
      return why ? fail(why) : OK;
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
      if (blocksInvasion(c)) return fail("a planetary barrier shield keeps troops out");
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
      if (cmd.design.module || existing?.module) return fail("colony ships, outpost ships and transports are fixed designs");
      if (existing && shipsBuilt(state, playerId, existing.id)) return fail("design is in use; save it under a new id");
      return validateDesign(player, cmd.design) === null ? OK : fail(validateDesign(player, cmd.design)!);
    }
    case "obsoleteDesign":
      return findDesign(player, cmd.designId) ? OK : fail("no such design");
    case "setAutoBattles":
      return OK;
    case "orbitalStrike":
      if (!state.colonies[cmd.colonyId]) return fail("no such colony");
      return ORBITAL_CHOICES.includes(cmd.choice) ? OK : fail("bad orbital choice");
    case "battleOrders": {
      if (typeof cmd.battle !== "string") return fail("no such battle");
      if (cmd.orders === "auto") return OK;
      if (!Array.isArray(cmd.orders)) return fail("bad orders");
      const kinds = ["act", "retreat", "ai", "auto"];
      return cmd.orders.every((o) => o && kinds.includes(o.kind)) ? OK : fail("bad orders");
    }
    case "setDoctrine": {
      const d = cmd.doctrine;
      if (!(d.retreatBelow >= 0 && d.retreatBelow <= 1)) return fail("retreat threshold must be 0..1");
      return ["nearest", "weakest", "strongest"].includes(d.focus) ? OK : fail("unknown focus");
    }
    case "propose": {
      const target = state.players[cmd.to];
      if (!target || target.kind !== "empire" || !target.alive || cmd.to === playerId) return fail("no such empire");
      if (state.proposals.some((p) => p.from === playerId && p.to === cmd.to && p.kind === cmd.kind)) return fail("already proposed");
      if (audienceTired(state, playerId, cmd.to)) return fail("they will hear no more this turn");
      const why = canSign(state, playerId, cmd.to, cmd.kind, termsOf(cmd));
      return why ? fail(why) : OK;
    }
    case "respond": {
      const p = state.proposals.find((x) => x.id === cmd.proposalId);
      if (!p || p.to !== playerId) return fail("no such proposal");
      if (cmd.accept && canSign(state, p.from, p.to, p.kind, termsOf(p))) return fail("no longer possible");
      return OK;
    }
    case "breakTreaty": {
      const target = state.players[cmd.target];
      if (!target || target.kind !== "empire" || cmd.target === playerId) return fail("no such empire");
      return hasTreaty(state, playerId, cmd.target, cmd.treaty) ? OK : fail("no such treaty");
    }
    case "gift": {
      const why = giftProblem(state, playerId, cmd.to, { bc: cmd.bc, techId: cmd.techId, starId: cmd.starId, tribute: cmd.tribute });
      return why ? fail(why) : OK;
    }
    case "surrender": {
      const target = state.players[cmd.to];
      if (!target || target.kind !== "empire" || !target.alive || cmd.to === playerId) return fail("no such empire");
      if (!player.contacts.includes(cmd.to)) return fail("no contact");
      return OK;
    }
    case "councilResponse": {
      const pending = state.council.pending;
      if (!pending) return fail("no verdict to answer");
      if (pending.winner === playerId) return fail("you won the vote");
      return OK;
    }
    case "exterminate": {
      const why = exterminateProblem(state, playerId, cmd.colonyId);
      return why ? fail(why) : OK;
    }

    case "bribeMonster": {
      const why = bribeProblem(state, playerId, cmd.eventId);
      return why ? fail(why) : OK;
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
    case "setAutomationStrategy":
      return typeof cmd.domain === "string" && /^[a-zA-Z]{1,32}$/.test(cmd.domain) && typeof cmd.strategy === "string" && /^[a-zA-Z]{1,32}$/.test(cmd.strategy)
        ? OK
        : fail("bad automation strategy");
    case "setIdleAlert":
      return typeof cmd.on === "boolean" ? OK : fail("bad idle alert setting");
    case "debug": {
      const why = debugProblem(state, playerId, cmd.action);
      return why ? fail(why) : OK;
    }
  }
}

/** Freighters not carrying colonists or food this turn. */
export function freeFreighters(state: GameState, playerId: PlayerId): number {
  return foodPlan(state, playerId).free;
}

/** A Planetary Barrier Shield keeps out troops and biological weapons. */
export function blocksInvasion(colony: Colony): boolean {
  return colony.buildings.some((id) => BUILDINGS_BY_ID[id]?.effects.blocksInvasion);
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

/** The negotiable terms carried by a proposal or a propose command. */
export function termsOf(x: ProposalTerms): ProposalTerms {
  const out: ProposalTerms = {};
  if (x.techId !== undefined) out.techId = x.techId;
  if (x.wantTechId !== undefined) out.wantTechId = x.wantTechId;
  if (x.starId !== undefined) out.starId = x.starId;
  if (x.third !== undefined) out.third = x.third;
  if (x.percent !== undefined) out.percent = x.percent;
  if (x.price !== undefined) out.price = x.price;
  return out;
}


/**
 * MoO2 buy price for the rest of the current item: each missing point costs
 * 2 BC in the item's last half, 5 BC between 10% and half done, and 10 BC
 * below 10%, so buying from scratch costs about four times the item.
 */
export function buyCost(state: GameState, colony: Colony): number {
  const head = colony.queue[0];
  if (!head) return Infinity;
  const cost = itemCost(state, colony.ownerId, head, colony);
  if (!Number.isFinite(cost)) return Infinity;
  return buyPrice(cost, colony.progress);
}

export function buyPrice(cost: number, progress: number): number {
  const p = Math.floor(progress);
  if (p >= cost) return 0;
  const half = Math.trunc(cost / 2);
  const tenth = Math.trunc(cost / 10);
  const [late, mid, early] = BUY_PRICE_PER_POINT;
  if (p >= half) return late * (cost - p);
  if (p >= tenth) return late * (cost - half) + mid * (half - p);
  return late * (cost - half) + mid * (half - tenth) + early * (tenth - p);
}
