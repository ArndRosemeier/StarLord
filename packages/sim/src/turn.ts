import { ANDROID_PROJECTS, ARTIFICIAL_PLANET, BASE_SCRAP_REFUND, BUILDINGS_BY_ID, PROJECT_UPKEEP, TERRAFORM_STEP } from "./data/buildings.js";
import { DIFFICULTIES } from "./data/galaxy.js";
import { FREIGHTERS, GROWTH, TRADE_GOODS_RATE } from "./data/economy.js";
import { GOVERNMENTS } from "./data/governments.js";
import type { PlanetType } from "./data/planets.js";
import { getRace, hasTrait, registerRaces } from "./data/races.js";
import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { RESEARCH, TECHS, TIERS_BY_ID, emptyHyperLevels, researchCost } from "./data/techs.js";
import { colonyDefenseStrength, hasArmedDefenses, resolveCombat, type CombatSide } from "./combat.js";
import { buyCost, termsOf, validateCommand, type Command } from "./commands.js";
import { newId, type TurnContext } from "./context.js";
import { councilTick } from "./council.js";
import { designStats, findDesign } from "./designs.js";
import { SCOUT_LAB_RESEARCH, hullIndex } from "./data/components.js";
import {
  acceptProposal, breakTreaty, chargePatience, declareWar, diplomacyTick, giveGift, isHostile, proposalId, rejectProposal, surrenderEmpire, treatyIncome,
} from "./diplomacy.js";
import { COMMAND_OVERAGE_COST, commandPointsAvailable, commandPointsUsed, fleetSpeed, grantTech } from "./empire.js";
import {
  androids, assimilationTurns, colonyOutput, foodPlan, maxPopulation, population, revoltChance, type ColonyOutput,
} from "./economy.js";
import { espionageTick } from "./espionage.js";
import { distance } from "./galaxy.js";
import { repairTick } from "./repair.js";
import { addShips, deleteFleet, removeShips, takeShips } from "./fleetOps.js";
import { builtCrewXp, crewTick } from "./crew.js";
import { captureColony, destroyColony, exterminate, groundPhase, revoltFight, type Silenced } from "./ground.js";
import { assignDefaultJobs, newUnitJob, removeAndroids, removePopulation } from "./jobs.js";
import {
  assignLeader, captainLost, combatXp, dismissLeader, heroJoins, hireLeader, leaderResearch, leaderTick, salaries,
} from "./leaders.js";
import { moveFleet } from "./movement.js";
import { tradeGoodsMult } from "./raceEffects.js";
import { guardianSlain } from "./npc.js";
import { raidTick, returnThroughPortal, salvageTech, syncPortals } from "./raiders.js";
import { absorbResearch, payBribe, randomEventTick, systemFrozen } from "./randomEvents.js";
import { explore, onColonize } from "./specials.js";
import { Rng } from "./rng.js";
import { PLACED_PROJECTS, baseTargets, colonyRoom, freePlanetsInSystem, isContinuous, itemCost, learnsWholeField, researchOptions, starOf } from "./rules.js";
import { applyMutation } from "./mutation.js";
import { applyDebug } from "./debug.js";
import { score } from "./score.js";
import type { BuildItem, Colony, Fleet, GameState, Id, Planet, Player, PlayerId } from "./types.js";

export type TurnOrders = Partial<Record<PlayerId, Command[]>>;

/**
 * Advances the game by one turn. Pure with respect to its input: the given
 * state is cloned, so callers can keep history for replays and undo.
 */
export function processTurn(prev: GameState, orders: TurnOrders): GameState {
  registerRaces(prev.settings.customRaces);
  const state = structuredClone(prev);
  if (state.over) return state;
  state.events = [];
  state.combats = [];
  const rng = new Rng(state.rng);
  const ctx: TurnContext = { state, rng, emit: (e) => state.events.push({ turn: state.turn, ...e }) };

  // Rotate who acts first each turn so no seat always wins same-turn contests.
  // Answers to proposals come after everything else, so an empire can answer
  // in the same turn a proposal put to it in an audience.
  const n = state.players.length;
  const seats = Array.from({ length: n }, (_, i) => state.players[(state.turn + i) % n]!.id);
  for (const id of seats) for (const cmd of orders[id] ?? []) if (cmd.type !== "respond") applyCommand(ctx, id, cmd);
  for (const id of seats) for (const cmd of orders[id] ?? []) if (cmd.type === "respond") applyCommand(ctx, id, cmd);

  // Ships that spent the last turn at one of their own systems leave it repaired.
  repairTick(state);
  raidTick(ctx);
  moveFleets(ctx);
  const silenced = combatPhase(ctx);
  groundPhase(ctx, silenced);
  syncPortals(state);
  runEconomy(ctx);
  espionageTick(state, rng, ctx.emit);
  diplomacyTick(state, ctx.emit);
  leaderTick(state, rng, ctx.emit);
  crewTick(state);
  const elected = councilTick(state, ctx.emit);
  if (elected) endGame(ctx, elected.winner, "council");
  randomEventTick(ctx);
  surrenders(ctx);
  checkElimination(ctx);

  state.turn += 1;
  if (!state.over && state.settings.maxTurns > 0 && state.turn > state.settings.maxTurns) {
    const alive = state.players.filter((p) => p.alive && p.kind === "empire");
    const best = alive.reduce((b, p) => (score(state, p.id) > score(state, b.id) ? p : b), alive[0]!);
    endGame(ctx, best.id, "score");
  }
  return state;
}

function endGame(ctx: TurnContext, winner: PlayerId, how: GameState["victory"] & string): void {
  if (ctx.state.over) return;
  ctx.state.over = true;
  ctx.state.winner = winner;
  ctx.state.victory = how;
  ctx.emit({ kind: "victory", playerId: winner, how });
}

// ---------------------------------------------------------------- commands

/**
 * A fleet split off another gets an id derived from its parent, so a player
 * can split and then order the new fleet in the same turn: the id doesn't
 * depend on what other players did first.
 */
export function splitFleetId(state: GameState, parentId: Id): Id {
  let n = 1;
  while (state.fleets[`${parentId}.${n}`]) n++;
  return `${parentId}.${n}`;
}

/**
 * Applies one player's orders without running the turn, so a UI can show
 * their effect right away. Returns the resulting state and the reasons for
 * any rejected commands.
 */
export function previewOrders(prev: GameState, playerId: PlayerId, cmds: Command[]): { state: GameState; rejected: string[] } {
  registerRaces(prev.settings.customRaces);
  const state = structuredClone(prev);
  state.events = [];
  const rng = new Rng(state.rng);
  const rejected: string[] = [];
  const ctx: TurnContext = {
    state,
    rng,
    emit: (e) => {
      if (e.kind === "commandRejected") rejected.push(e.reason);
    },
  };
  for (const cmd of answersLast(cmds)) applyCommand(ctx, playerId, cmd);
  return { state, rejected };
}

/** Orders with answers to proposals moved to the end, as the turn applies them. */
function answersLast(cmds: Command[]): Command[] {
  return [...cmds.filter((c) => c.type !== "respond"), ...cmds.filter((c) => c.type === "respond")];
}

/** Validates and applies a single command. Invalid commands are reported, not thrown. */
export function applyCommand(ctx: TurnContext, playerId: PlayerId, cmd: Command): void {
  const { state } = ctx;
  const check = validateCommand(state, playerId, cmd);
  if (!check.ok) {
    ctx.emit({ kind: "commandRejected", playerId, reason: `${cmd.type}: ${check.reason}` });
    return;
  }
  const player = state.players[playerId]!;
  switch (cmd.type) {
    case "setJobs": {
      const c = state.colonies[cmd.colonyId]!;
      c.farmers = cmd.farmers;
      c.workers = cmd.workers;
      c.scientists = cmd.scientists;
      break;
    }
    case "setQueue": {
      const c = state.colonies[cmd.colonyId]!;
      // Like MoO2, progress carries over when the head of the queue changes.
      c.queue = cmd.queue.map((i) => ({ ...i }));
      if (c.queue.length === 0) c.progress = 0;
      break;
    }
    case "placeBase": {
      const c = state.colonies[cmd.colonyId]!;
      c.readyBases!.splice(c.readyBases!.indexOf(cmd.projectId), 1);
      if (c.readyBases!.length === 0) delete c.readyBases;
      placeBase(ctx, c, cmd.projectId, state.planets[cmd.planetId]!);
      break;
    }
    case "buy": {
      const c = state.colonies[cmd.colonyId]!;
      player.bc -= buyCost(state, c);
      c.progress = itemCost(state, playerId, c.queue[0]!, c);
      break;
    }
    case "setResearch":
      player.research.tierId = cmd.tierId;
      player.research.techChoice = cmd.techId ?? null;
      break;
    case "mutateRace":
      applyMutation(state, playerId, cmd.picks);
      break;
    case "setTaxRate":
      player.taxRate = cmd.rate;
      break;
    case "moveColonists": {
      const from = state.colonies[cmd.fromColonyId]!;
      const to = state.colonies[cmd.toColonyId]!;
      removePopulation(from, cmd.count);
      const turns = Math.max(1, Math.ceil(distance(starOf(state, from.planetId), starOf(state, to.planetId)) / fleetSpeed(player)));
      (player.transfers ??= []).push({
        fromColonyId: from.id, toColonyId: to.id, raceId: from.raceId, count: cmd.count, arrives: state.turn + turns - 1,
      });
      break;
    }
    case "scrapFreighters":
      player.freighters = (player.freighters ?? 0) - cmd.count;
      break;
    case "moveFleet": {
      const f = state.fleets[cmd.fleetId]!;
      f.destStarId = cmd.destStarId === f.starId ? null : cmd.destStarId;
      if (f.starId) f.fromStarId = f.starId;
      break;
    }
    case "colonize": {
      const f = state.fleets[cmd.fleetId]!;
      const planet = state.planets[cmd.planetId]!;
      const pickModule = (m: "colony" | "outpost") =>
        f.ships.find((s) => findDesign(player, s.designId)?.module === m && s.count > 0);
      const stack = pickModule("colony") ?? pickModule("outpost")!;
      const outpost = findDesign(player, stack.designId)!.module === "outpost";
      removeShips(state, f, stack.designId, 1);
      foundColony(ctx, playerId, cmd.planetId, outpost ? 0 : 1, player.raceId);
      break;
    }
    case "invade":
      state.fleets[cmd.fleetId]!.invadeTarget = cmd.colonyId;
      break;
    case "splitFleet": {
      const f = state.fleets[cmd.fleetId]!;
      // The split-off ships keep their crews' experience.
      const ships = cmd.ships.map((s) => {
        const from = f.ships.find((x) => x.designId === s.designId)!;
        const damage = takeShips(from, s.count);
        return { designId: s.designId, count: s.count, ...(from.xp ? { xp: from.xp } : {}), ...(damage.length > 0 ? { damage } : {}) };
      });
      f.ships = f.ships.filter((s) => s.count > 0);
      const nf: Fleet = { ...f, id: splitFleetId(state, f.id), ships, name: `${f.name} II` };
      delete nf.invadeTarget;
      state.fleets[nf.id] = nf;
      break;
    }
    case "mergeFleets": {
      const [first, ...rest] = cmd.fleetIds.map((id) => state.fleets[id]!);
      for (const f of rest) {
        for (const s of f.ships) addShips(first!, s.designId, s.count, s.xp ?? 0, s.damage);
        deleteFleet(state, f.id);
      }
      break;
    }
    case "setStance":
      state.fleets[cmd.fleetId]!.stance = cmd.stance;
      break;
    case "renameFleet":
      state.fleets[cmd.fleetId]!.name = cmd.name.trim().slice(0, 40);
      break;
    case "scrapShips": {
      const f = state.fleets[cmd.fleetId]!;
      const d = findDesign(player, cmd.designId);
      if (d) player.bc += Math.floor(designStats(player, d).cost * 0.25) * cmd.count;
      removeShips(state, f, cmd.designId, cmd.count);
      // Taking a captured ship apart can teach its builders' technology.
      if (d) salvageTech(ctx, playerId, d, cmd.count);
      break;
    }
    case "saveDesign": {
      const design = structuredClone(cmd.design);
      design.obsolete = false;
      const i = player.designs.findIndex((d) => d.id === design.id);
      if (i >= 0) player.designs[i] = design;
      else player.designs.push(design);
      break;
    }
    case "obsoleteDesign":
      player.designs.find((d) => d.id === cmd.designId)!.obsolete = cmd.obsolete;
      break;
    case "setDoctrine":
      player.doctrine = { ...cmd.doctrine };
      break;
    case "propose": {
      const id = proposalId(state.turn, playerId, cmd.to, cmd.kind);
      const charged = chargePatience(state, playerId, cmd.to, cmd.kind, id);
      state.proposals.push({ id, from: playerId, to: cmd.to, kind: cmd.kind, turn: state.turn, ...termsOf(cmd), ...charged });
      break;
    }
    case "respond": {
      const p = state.proposals.find((x) => x.id === cmd.proposalId)!;
      state.proposals = state.proposals.filter((x) => x.id !== p.id);
      if (cmd.accept) {
        acceptProposal(state, p, ctx.emit);
        ctx.emit({ kind: "diplomacy", playerId: p.from, other: p.to, what: `accepted ${p.kind}` });
      } else {
        rejectProposal(state, p);
        ctx.emit({ kind: "diplomacy", playerId: p.from, other: p.to, what: `rejected ${p.kind}` });
      }
      break;
    }
    case "breakTreaty":
      breakTreaty(state, playerId, cmd.target, cmd.treaty);
      ctx.emit({ kind: "diplomacy", playerId: cmd.target, other: playerId, what: `ended the ${cmd.treaty} treaty` });
      break;
    case "gift":
      giveGift(state, playerId, cmd.to, { bc: cmd.bc, techId: cmd.techId, starId: cmd.starId, tribute: cmd.tribute }, ctx.emit);
      break;
    case "surrender":
      state.surrenders = { ...(state.surrenders ?? {}), [playerId]: cmd.to };
      break;
    case "councilResponse": {
      const pending = state.council.pending!;
      pending.refused = pending.refused.filter((x) => x !== playerId);
      if (!cmd.accept) pending.refused.push(playerId);
      break;
    }
    case "exterminate":
      exterminate(ctx, playerId, cmd.colonyId);
      break;
    case "bribeMonster":
      payBribe(ctx, playerId, cmd.eventId);
      break;
    case "declareWar":
      declareWar(state, playerId, cmd.target);
      ctx.emit({ kind: "diplomacy", playerId: cmd.target, other: playerId, what: "declared war on you" });
      break;
    case "setSpies": {
      const current = player.spies.abroad[cmd.target]?.count ?? 0;
      player.spies.home -= cmd.count - current;
      if (cmd.count === 0) delete player.spies.abroad[cmd.target];
      else player.spies.abroad[cmd.target] = { count: cmd.count, mission: cmd.mission };
      break;
    }
    case "hireLeader": {
      hireLeader(state, playerId, cmd.leaderId, ctx.emit);
      break;
    }
    case "assignLeader":
      // One leader per system or fleet: whoever held the post is relieved when the new one arrives.
      assignLeader(state, playerId, cmd.leaderId, cmd.targetId);
      break;
    case "dismissLeader":
      dismissLeader(state, cmd.leaderId);
      break;
    case "setCouncilVote":
      player.councilVote = cmd.vote;
      break;
    case "setAutomation":
      player.automation = [...cmd.domains];
      break;
    case "setAutomationStrategy": {
      const strategies = { ...player.automationStrategies };
      if (cmd.strategy === "balanced") delete strategies[cmd.domain];
      else strategies[cmd.domain] = cmd.strategy;
      if (Object.keys(strategies).length > 0) player.automationStrategies = strategies;
      else delete player.automationStrategies;
      break;
    }
    case "debug":
      applyDebug(ctx, playerId, cmd.action);
      break;
  }
}

function foundColony(ctx: TurnContext, playerId: PlayerId, planetId: Id, pop: number, raceId: string): Colony {
  const { state } = ctx;
  const planet = state.planets[planetId]!;
  const star = starOf(state, planetId);
  const sameStar = Object.values(state.colonies).filter((c) => state.planets[c.planetId]!.starId === star.id).length;
  const roman = ["", " II", " III", " IV", " V", " VI"][sameStar] ?? "";
  const colony: Colony = {
    id: newId(state, "c"), planetId, ownerId: playerId, raceId, name: `${star.name}${roman}`, outpost: pop === 0,
    farmers: 0, workers: pop, scientists: 0, growthK: 0,
    buildings: [], queue: [], progress: 0, founded: state.turn, terraformed: 0, unrestUntil: 0,
  };
  planet.colonyId = colony.id;
  state.colonies[colony.id] = colony;
  if (pop > 0) assignDefaultJobs(state, colony);
  ctx.emit({ kind: "colonyFounded", playerId, colonyId: colony.id, planetId });
  onColonize(ctx, colony);
  return colony;
}

// ---------------------------------------------------------------- movement

/** Movement rules (gates, nebulae, interdictors, black holes) live in movement.ts. */
function moveFleets(ctx: TurnContext): void {
  const { state } = ctx;
  for (const f of Object.values(state.fleets).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const owner = state.players[f.ownerId]!;
    if (f.destStarId) {
      moveFleet(state, f);
      if (f.invadeTarget && f.starId !== state.planets[state.colonies[f.invadeTarget]?.planetId ?? ""]?.starId) delete f.invadeTarget;
    }
    if (f.starId && owner.kind === "empire") explore(ctx, f.ownerId, f.starId);
  }
}

// ---------------------------------------------------------------- combat

function isArmed(state: GameState, f: Fleet): boolean {
  const owner = state.players[f.ownerId]!;
  return f.ships.some((s) => {
    const d = findDesign(owner, s.designId);
    return !!d && (!!d.fixed || d.weapons.length > 0);
  });
}


function combatPhase(ctx: TurnContext): Silenced {
  const { state, rng } = ctx;
  const silenced: Silenced = new Set();
  const stars = new Set<Id>();
  for (const f of Object.values(state.fleets)) if (f.starId) stars.add(f.starId);

  for (const starId of [...stars].sort()) {
    // Nobody can fight inside a time-space anomaly.
    if (systemFrozen(state, starId)) continue;
    // Each pair of enemies fights once a turn; a battle that runs out of time goes on next turn.
    const fought = new Set<string>();
    for (let guard = 0; guard < 6; guard++) {
      const pair = nextBattle(state, starId, silenced, fought);
      if (!pair) break;
      const [a, b] = pair;
      fought.add(`${a.ownerId}:${b.ownerId}`);
      const outcome = resolveCombat(state, rng, starId, a, b, newId(state, "cb"));
      state.combats.push(outcome.report);
      applyCombat(ctx, starId, [a, b], outcome);
      for (const [owner, down] of outcome.planetSilenced) {
        const side = owner === a.ownerId ? a : b;
        if (down && side.colony) silenced.add(side.colony.id);
      }
    }
  }
  // Colonies without a station or armed ground defenses are open to attack-stance fleets.
  for (const c of Object.values(state.colonies)) {
    if (!hasArmedDefenses(c)) silenced.add(c.id);
  }
  return silenced;
}

function sideAt(state: GameState, starId: Id, ownerId: PlayerId, silenced: Silenced): CombatSide {
  const fleets = Object.values(state.fleets).filter((f) => f.starId === starId && f.ownerId === ownerId);
  const colonies = Object.values(state.colonies).filter(
    (c) => c.ownerId === ownerId && state.planets[c.planetId]!.starId === starId,
  );
  // A colony whose defenses were beaten this turn does not rise again until next turn.
  const colony = colonies
    .filter((c) => !silenced.has(c.id))
    .map((c) => ({ c, s: colonyDefenseStrength(state, c) }))
    .sort((x, y) => y.s - x.s || (x.c.id < y.c.id ? -1 : 1))[0]?.c;
  const owner = state.players[ownerId]!;
  return {
    ownerId,
    fleets,
    colony,
    attacksPlanet: owner.kind === "raiders" || fleets.some((f) => f.stance === "attack"),
  };
}

/** Finds the next pair of hostile parties at a star that will fight, if any. */
function nextBattle(state: GameState, starId: Id, silenced: Silenced, fought: Set<string>): [CombatSide, CombatSide] | null {
  const owners = new Set<PlayerId>();
  for (const f of Object.values(state.fleets)) if (f.starId === starId) owners.add(f.ownerId);
  for (const c of Object.values(state.colonies)) if (state.planets[c.planetId]!.starId === starId) owners.add(c.ownerId);
  const list = [...owners].sort((x, y) => x - y);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (!isHostile(state, list[i]!, list[j]!) || fought.has(`${list[i]}:${list[j]}`)) continue;
      const a = sideAt(state, starId, list[i]!, silenced);
      const b = sideAt(state, starId, list[j]!, silenced);
      if (wantsFight(state, a, b) || wantsFight(state, b, a)) return [a, b];
    }
  }
  return null;
}

const hasDefenses = hasArmedDefenses;

function wantsFight(state: GameState, me: CombatSide, them: CombatSide): boolean {
  const armedFleets = me.fleets.some((f) => isArmed(state, f));
  if (armedFleets && them.fleets.length > 0) return true;
  if (armedFleets && me.attacksPlanet && hasDefenses(them.colony)) return true;
  // Armed planets fire on any enemy ships in orbit.
  if (hasDefenses(me.colony) && them.fleets.length > 0) return true;
  return false;
}

function applyCombat(
  ctx: TurnContext,
  starId: Id,
  sides: [CombatSide, CombatSide],
  outcome: ReturnType<typeof resolveCombat>,
): void {
  const { state } = ctx;
  // A destroyed orbital station is gone for good.
  for (const colonyId of outcome.stationsLost) {
    const c = state.colonies[colonyId];
    if (c) c.buildings = c.buildings.filter((b) => !BUILDINGS_BY_ID[b]?.effects.defense?.station);
  }
  // Boarded ships join the captor's fleet under a copy of their design.
  for (const cap of outcome.captured) {
    const from = state.players[cap.fromOwner]!;
    const to = state.players[cap.ownerId]!;
    const design = findDesign(from, cap.designId);
    const fleetShips = outcome.survivors.get(cap.fleetId);
    if (!design || !fleetShips || design.fixed) continue;
    const id = `cap${cap.fromOwner}-${design.id}`;
    if (!findDesign(to, id)) to.designs.push({ ...structuredClone(design), id, name: `${design.name} (captured)`, obsolete: true, capturedFrom: cap.fromOwner });
    const stack = fleetShips.find((x) => x.designId === id);
    if (stack) stack.count++;
    else fleetShips.push({ designId: id, count: 1 });
  }
  // The winner's crews and captains learn from battle (capped again at the next turn's training).
  if (outcome.crewXp) {
    const { ownerId, amount } = outcome.crewXp;
    const fleetIds = sides.find((s) => s.ownerId === ownerId)!.fleets.map((f) => f.id).filter((id) => outcome.survivors.has(id));
    for (const id of fleetIds) for (const s of outcome.survivors.get(id)!) s.xp = (s.xp ?? 0) + amount;
    combatXp(state, fleetIds, amount, ctx.emit);
  }
  for (const [fleetId, ships] of outcome.survivors) {
    const f = state.fleets[fleetId];
    if (!f) continue;
    const before = f.ships.reduce((n, s) => n + s.count, 0);
    f.ships = ships;
    if (ships.length === 0) {
      const rescued = [...outcome.survivors].some(([id, list]) => id !== fleetId && state.fleets[id]?.ownerId === f.ownerId && list.length > 0);
      captainLost(state, fleetId, rescued, ctx.emit);
      deleteFleet(state, fleetId);
      const owner = state.players[f.ownerId]!;
      const killer = sides.find((s) => s.ownerId !== f.ownerId)!.ownerId;
      if (owner.kind === "monsters" && before > 0) guardianSlain(ctx, killer, starId);
      // A raider captain who sees his fleet beaten offers his sword to the victor (StarLord's trigger for the original's renegade hero).
      if (owner.kind === "raiders" && before > 0 && state.players[killer]!.kind === "empire") heroJoins(state, killer, "raiders", ctx.emit);
      if (owner.kind === "raiders" && state.galaxy.stars.find((s) => s.id === starId)?.special === "raiderHome") {
        const homeLeft = Object.values(state.fleets).some((x) => x.ownerId === f.ownerId && x.starId === starId);
        if (!homeLeft && state.players[killer]!.kind === "empire") raidersDefeated(ctx, killer);
      }
    }
  }
  // Whoever is still at the raiders' home after the battle comes back through the portal.
  if (state.galaxy.stars.find((s) => s.id === starId)?.special === "raiderHome" && !state.raiders.defeated) {
    returnThroughPortal(state, starId);
  }
  for (const f of Object.values(state.fleets)) {
    if (f.starId !== starId || !(outcome.retreated.has(f.ownerId) || outcome.fled.has(f.id))) continue;
    const home = nearestOwnStar(state, f.ownerId, starId);
    if (home && home !== starId) {
      f.destStarId = home;
      f.starId = null;
    }
  }
  for (const s of sides) {
    if (state.players[s.ownerId]!.kind !== "empire") continue;
    ctx.emit({
      kind: "combat", playerId: s.ownerId, reportId: outcome.report.id, starId, won: outcome.report.winner === s.ownerId,
    });
  }
}

/**
 * The raiders are beaten at home: they are gone for good, every other empire
 * capitulates to the victor, and the game ends.
 */
function raidersDefeated(ctx: TurnContext, victor: PlayerId): void {
  const { state } = ctx;
  state.raiders.defeated = true;
  state.raiders.defeatedBy = victor;
  for (const p of state.players) {
    if (p.kind === "raiders") p.alive = false;
    if (p.kind === "empire") ctx.emit({ kind: "raidersDefeated", playerId: p.id, by: victor });
  }
  endGame(ctx, victor, "raiders");
}

function nearestOwnStar(state: GameState, playerId: PlayerId, fromStarId: Id): Id | null {
  const from = state.galaxy.stars.find((s) => s.id === fromStarId)!;
  let best: Id | null = null;
  let bestD = Infinity;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    const s = starOf(state, c.planetId);
    const d = distance(s, from);
    if (d < bestD && s.id !== fromStarId) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

// ---------------------------------------------------------------- economy

function runEconomy(ctx: TurnContext): void {
  const { state } = ctx;
  for (const player of state.players) if (player.kind === "empire" && player.alive) arriveColonists(ctx, player.id);

  const byPlayer = new Map<PlayerId, { colony: Colony; out: ColonyOutput }[]>();
  const totals = new Map<PlayerId, { population: number; research: number }>();
  for (const c of Object.values(state.colonies)) {
    const list = byPlayer.get(c.ownerId) ?? [];
    const out = colonyOutput(state, c);
    list.push({ colony: c, out });
    byPlayer.set(c.ownerId, list);
    const t = totals.get(c.ownerId) ?? { population: 0, research: 0 };
    t.population += out.population;
    t.research += out.research;
    totals.set(c.ownerId, t);
  }

  for (const player of state.players) {
    if (player.kind !== "empire" || !player.alive) continue;
    const list = (byPlayer.get(player.id) ?? []).filter((x) => !x.colony.outpost);
    const traders = tradeGoodsMult(getRace(player.raceId));

    // Freighters carry food from fed colonies to hungry ones; the rest is sold.
    const food = foodPlan(state, player.id, list);

    let research = 0;
    let bc = food.saleBC - food.upkeep - list.filter((x) => x.colony.portal).length * PROJECT_UPKEEP.dimensionalPortal;
    for (const { colony, out } of list) {
      scrapStrandedBases(ctx, colony);
      // A plague or a threatened supernova claims the colony's research.
      research += absorbResearch(state, colony, out.research);
      bc += out.bc - out.maintenance;
      // A time-space anomaly stops all building in the system.
      if (!systemFrozen(state, state.planets[colony.planetId]!.starId)) {
        bc += produce(ctx, colony, out.industry, traders);
      }
      grow(ctx, colony, out, food.shortfall[colony.id] ?? 0);
    }
    const treaties = treatyIncome(state, player.id, totals);
    research += treaties.research + extraResearch(state, player.id);
    bc += treaties.bc;
    bc -= salaries(state, player.id);
    const over = commandPointsUsed(state, player.id) - commandPointsAvailable(state, player.id);
    if (over > 0) bc -= over * COMMAND_OVERAGE_COST;
    player.bc = Math.round((player.bc + bc) * 10) / 10;
    if (player.bc < 0) bankrupt(ctx, player.id);
    advanceResearch(ctx, player.id, research);
    upgradeGovernment(player);
  }

  for (const c of Object.values(state.colonies)) {
    if (c.outpost) continue;
    trainTroops(state, c);
    assimilate(ctx, c);
  }
  for (const player of state.players) if (player.kind === "empire" && player.alive) checkCapitol(ctx, player.id);
}

/** Colonists whose freighters reach their new home this turn; on a full planet they die. */
function arriveColonists(ctx: TurnContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = state.players[playerId]!;
  if (!player.transfers?.length) return;
  const keep = [];
  for (const t of player.transfers) {
    if (t.arrives > state.turn) {
      keep.push(t);
      continue;
    }
    const to = state.colonies[t.toColonyId];
    if (!to || to.ownerId !== playerId || to.raceId !== t.raceId) {
      ctx.emit({ kind: "random", playerId, what: `${t.count} colonist${t.count === 1 ? "" : "s"} in transit had nowhere to land and were lost.` });
      continue;
    }
    const room = Math.max(0, colonyRoom(state, to));
    const landed = Math.min(room, t.count);
    to.workers += landed;
    if (landed < t.count) ctx.emit({ kind: "random", playerId, what: `${to.name} was full: ${t.count - landed} arriving colonist${t.count - landed === 1 ? "" : "s"} died.` });
  }
  player.transfers = keep;
}

/** Barracks train new marines and tanks over time, up to a share of the planet's maximum population. */
function trainTroops(state: GameState, c: Colony): void {
  const planet = state.planets[c.planetId]!;
  const owner = state.players[c.ownerId];
  const max = maxPopulation(planet, getRace(c.raceId), c.buildings, owner);
  // Warlike races train twice as fast and keep twice as many.
  const mult = owner && hasTrait(getRace(owner.raceId), "warlord") ? TRAIT_EFFECTS.warlordTroopMult : 1;
  for (const id of c.buildings) {
    const e = BUILDINGS_BY_ID[id]?.effects;
    const tr = e?.training;
    if (!tr || state.turn % Math.max(1, Math.round(tr.every / mult)) !== 0) continue;
    const key = tr.kind === "marines" ? "marinesTrained" : "tanksTrained";
    const have = (e.troops ?? 0) + (c[key] ?? 0);
    if (have < Math.floor(max * tr.capOfMaxPop * mult)) c[key] = (c[key] ?? 0) + 1;
  }
}

/** Conquered people slowly join the empire; until then they may revolt and hand the colony back. */
function assimilate(ctx: TurnContext, c: Colony): void {
  const { state, rng } = ctx;
  if (!c.aliens || c.aliens <= 0) return;
  const owner = state.players[c.ownerId]!;
  const former = c.formerOwnerId !== undefined ? state.players[c.formerOwnerId] : undefined;
  if (former && former.alive && former.kind === "empire" && former.id !== owner.id && rng.chance(revoltChance(c, state))) {
    revolt(ctx, c, former.id);
    return;
  }
  c.assimilation = (c.assimilation ?? 0) + 1;
  if (c.assimilation >= assimilationTurns(owner, c)) {
    c.assimilation = 0;
    c.aliens -= 1;
  }
}

/** The aliens rise against the garrison; if they win, the colony returns to its former owner. */
function revolt(ctx: TurnContext, c: Colony, formerId: PlayerId): void {
  const { state, rng } = ctx;
  // Some of the aliens take up arms.
  const { won, killed } = revoltFight(ctx, c, rng.int(1, Math.max(1, c.aliens ?? 0)));
  const owner = c.ownerId;
  if (won) {
    ctx.emit({ kind: "colonyLost", playerId: owner, colonyId: c.id, to: formerId, how: "revolted" });
    captureColony(ctx, c, formerId, { revolt: true });
    return;
  }
  // Fallen rebels are dead; the survivors give up for now.
  const aliensLeft = Math.max(0, (c.aliens ?? 0) - killed);
  removeAliens(c, killed);
  c.aliens = aliensLeft;
  ctx.emit({ kind: "random", playerId: owner, what: `Aliens at ${c.name} revolted and were put down; ${killed} died.` });
  if (population(c) === 0) {
    ctx.emit({ kind: "colonyLost", playerId: owner, colonyId: c.id, to: null, how: "destroyed" });
    destroyColony(state, c);
  }
}

function removeAliens(c: Colony, n: number): void {
  for (let i = 0; i < n && population(c) > 0; i++) {
    if (c.workers > 0) c.workers--;
    else if (c.farmers > 0) c.farmers--;
    else c.scientists--;
  }
}

/** Notices when an empire loses its Capitol, and when it has rebuilt it. */
function checkCapitol(ctx: TurnContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = state.players[playerId]!;
  if (player.capitol === undefined) return;
  const held = Object.values(state.colonies).some(
    (c) => c.ownerId === playerId && c.buildings.some((b) => BUILDINGS_BY_ID[b]?.effects.capitol),
  );
  if (held && player.capitol === "lost") {
    player.capitol = "held";
    ctx.emit({ kind: "random", playerId, what: "The new Capitol restores order across the empire." });
  } else if (!held && player.capitol === "held") {
    player.capitol = "lost";
    const gov = GOVERNMENTS[player.government];
    ctx.emit({
      kind: "random", playerId,
      what: gov.capitalLossMorale > 0
        ? `Our Capitol has fallen: morale drops ${gov.capitalLossMorale}% everywhere until it is rebuilt.`
        : "Our Capitol has fallen, but our unified people carry on undisturbed.",
    });
  }
}

/** Debt sells buildings, most expensive upkeep first, until the books balance. The Capitol is never sold. */
function bankrupt(ctx: TurnContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = state.players[playerId]!;
  const all = Object.values(state.colonies)
    .filter((c) => c.ownerId === playerId)
    .flatMap((c) => c.buildings.map((b) => ({ c, b, upkeep: BUILDINGS_BY_ID[b]?.maintenance ?? 0 })))
    .filter((x) => !BUILDINGS_BY_ID[x.b]?.effects.capitol)
    .sort((x, y) => y.upkeep - x.upkeep);
  for (const { c, b } of all) {
    if (player.bc >= 0) break;
    c.buildings = c.buildings.filter((x) => x !== b);
    player.bc += Math.floor((BUILDINGS_BY_ID[b]?.cost ?? 0) / 4);
    ctx.emit({ kind: "random", playerId, what: `Debt forced the sale of ${BUILDINGS_BY_ID[b]?.name ?? b} at ${c.name}.` });
  }
  if (player.bc < 0) player.bc = 0;
}

/** Researching the advanced form of your government (Advanced Governments) switches to it. */
function upgradeGovernment(player: GameState["players"][number]): void {
  const next = GOVERNMENTS[player.government].advanced;
  if (next && player.techs.some((t) => TECHS[t]?.government === next)) player.government = next;
}

/** Spends industry on the build queue. Returns BC earned from trade goods. */
function produce(ctx: TurnContext, colony: Colony, industry: number, tradeMult: number): number {
  const { state } = ctx;
  if (colony.outpost) return 0;
  const head = colony.queue[0];
  if (!head || head.kind === "tradeGoods") {
    // An empty queue converts output to BC rather than wasting it.
    const total = industry + colony.progress;
    colony.progress = 0;
    return tradeGoods(total, tradeMult);
  }
  // Housing turns the production into growth (economy.ts), nothing is built.
  if (head.kind === "project" && head.id === "housing") return 0;
  const cost = itemCost(state, colony.ownerId, head, colony);
  colony.progress += industry;
  if (!Number.isFinite(cost)) {
    colony.queue.shift();
    return 0;
  }
  if (colony.progress < cost) return 0;
  // MoO2 builds at most one item per turn; overflow carries into the next.
  colony.progress -= cost;
  colony.queue.shift();
  completeItem(ctx, colony, head);
  if (colony.queue.length === 0 || isContinuous(colony.queue[0]!)) {
    const left = colony.progress;
    colony.progress = 0;
    if (colony.queue[0]?.kind !== "project") return tradeGoods(left, tradeMult);
  }
  return 0;
}

/** BC from production sold as Trade Goods: half, rounded up, or all of it for fantastic traders. No other bonus applies. */
function tradeGoods(industry: number, traderMult: number): number {
  return traderMult > 1 ? industry : Math.ceil(industry * TRADE_GOODS_RATE);
}

function completeItem(ctx: TurnContext, colony: Colony, item: BuildItem): void {
  const { state, rng } = ctx;
  const player = state.players[colony.ownerId]!;
  const star = starOf(state, colony.planetId);
  if (item.kind === "building") {
    const def = BUILDINGS_BY_ID[item.id];
    if (def && !colony.buildings.includes(item.id)) {
      colony.buildings = colony.buildings.filter((b) => !def.replaces?.includes(b));
      colony.buildings.push(item.id);
      const planet = state.planets[colony.planetId]!;
      if (def.effects.radiatedToBarren && planet.type === "radiated") planet.type = "barren";
    }
  } else if (item.kind === "ship") {
    const design = findDesign(player, item.designId);
    if (!design) return;
    const role = designStats(player, design).role;
    // Join an idle fleet of the same role so scouts and colony ships stay separate from warships.
    const docked = Object.values(state.fleets).find(
      (f) => f.ownerId === colony.ownerId && f.starId === star.id && !f.destStarId && f.stance === "defend" &&
        f.ships.every((s) => {
          const d = findDesign(player, s.designId);
          return d && designStats(player, d).role === role;
        }),
    );
    // A Space Academy here sends the ship out with a trained crew.
    const xp = builtCrewXp(colony);
    if (docked) addShips(docked, item.designId, 1, xp);
    else {
      const f: Fleet = {
        id: newId(state, "f"), ownerId: colony.ownerId, x: star.x, y: star.y, starId: star.id, destStarId: null,
        ships: [xp > 0 ? { designId: item.designId, count: 1, xp } : { designId: item.designId, count: 1 }], stance: "defend", name: `${design.name} Group`,
      };
      state.fleets[f.id] = f;
    }
  } else if (item.kind === "project") {
    completeProject(ctx, colony, item.id, item.planetId, rng);
  }
  ctx.emit({ kind: "built", playerId: colony.ownerId, colonyId: colony.id, item });
}

function completeProject(ctx: TurnContext, colony: Colony, id: string, planetId: Id | undefined, rng: Rng): void {
  const { state } = ctx;
  const player = state.players[colony.ownerId]!;
  const planet = state.planets[colony.planetId]!;
  const job = ANDROID_PROJECTS[id];
  if (job) {
    if (colonyRoom(state, colony) > 0) {
      colony.androids = { ...androids(colony) };
      colony.androids[job] += 1;
    }
    return;
  }
  switch (id) {
    case "colonyBase":
    case "outpostBase":
    case "artificialPlanet": {
      // MoO2 asks where a finished base goes; with one choice there is nothing to ask.
      const free = baseTargets(state, colony, id);
      const target = free.find((p) => p.id === planetId) ?? (free.length === 1 ? free[0] : undefined);
      if (target) placeBase(ctx, colony, id, target);
      else if (free.length > 1) {
        (colony.readyBases ??= []).push(id);
        ctx.emit({ kind: "baseReady", playerId: colony.ownerId, colonyId: colony.id, projectId: id });
      } else scrapBase(ctx, colony, id);
      return;
    }
    case "dimensionalPortal":
      colony.portal = true;
      player.hasPortal = true;
      return;
    case "spy":
      player.spies.home += 1;
      return;
  }
}

/** Settles or converts the chosen planet with a finished Colony Base, Outpost Base or Artificial Planet. */
function placeBase(ctx: TurnContext, colony: Colony, id: string, target: Planet): void {
  if (id === "artificialPlanet") {
    if (target.type === "asteroids" || target.type === "gasGiant") {
      target.size = ARTIFICIAL_PLANET[target.type];
      target.type = ARTIFICIAL_PLANET.type;
      target.minerals = ARTIFICIAL_PLANET.minerals;
      target.gravity = ARTIFICIAL_PLANET.gravity;
    }
    return;
  }
  const player = ctx.state.players[colony.ownerId]!;
  foundColony(ctx, colony.ownerId, target.id, id === "colonyBase" ? 1 : 0, player.raceId);
}

/** A finished base with no planet left to use is scrapped for part of its cost, never lost silently. */
function scrapBase(ctx: TurnContext, colony: Colony, id: string): void {
  const refund = Math.floor(itemCost(ctx.state, colony.ownerId, { kind: "project", id }, colony) * BASE_SCRAP_REFUND);
  ctx.state.players[colony.ownerId]!.bc += refund;
  ctx.emit({ kind: "baseScrapped", playerId: colony.ownerId, colonyId: colony.id, projectId: id, refund });
}

/** Bases waiting for a target are scrapped once every planet they could use is gone. */
function scrapStrandedBases(ctx: TurnContext, colony: Colony): void {
  if (!colony.readyBases) return;
  const keep: string[] = [];
  for (const id of colony.readyBases) {
    if (baseTargets(ctx.state, colony, id).length > keep.filter((k) => PLACED_PROJECTS[k] === PLACED_PROJECTS[id]).length) keep.push(id);
    else scrapBase(ctx, colony, id);
  }
  if (keep.length) colony.readyBases = keep;
  else delete colony.readyBases;
}

/**
 * Adds the turn's growth. Each food the colony is short costs 50k; a full
 * thousand gained adds a colonist, a thousand lost kills one (workers and
 * scientists before farmers, never the last colonist). A full colony keeps
 * its growth just short of a new colonist.
 */
function grow(ctx: TurnContext, colony: Colony, out: ColonyOutput, foodShort: number): void {
  if (colony.outpost) return;
  const room = out.maxPopulation - out.androids;
  if (out.population > room && population(colony) > 1) {
    // Terraforming can shrink a planet's capacity; extra people leave.
    removePopulation(colony, Math.min(population(colony) - 1, population(colony) - room));
    colony.growthK = 0;
    return;
  }
  // Each half unit of food or industry upkeep the colonists lack costs 25k; androids without industry shut down.
  const starving = (Math.ceil(foodShort * 2 - 1e-9) + out.cyberShortHalf) * (GROWTH.starvationK / 2);
  if (out.androidsUnfed > 0) removeAndroids(colony, out.androidsUnfed);
  if (starving > 0 || out.androidsUnfed > 0) ctx.emit({ kind: "starvation", playerId: colony.ownerId, colonyId: colony.id });
  colony.growthK += out.growthK - starving;
  while (colony.growthK < 0) {
    if (population(colony) <= 1) {
      colony.growthK = 0;
      break;
    }
    removePopulation(colony, 1);
    colony.growthK += 1000;
  }
  while (colony.growthK >= 1000) {
    if (population(colony) + out.androids >= out.maxPopulation) {
      colony.growthK = 999;
      break;
    }
    colony.growthK -= 1000;
    // New colonists farm if the colony is short of food, otherwise they keep industry and research even.
    if (out.foodNet < 0) colony.farmers++;
    else colony[newUnitJob(colony)]++;
  }
}

/**
 * Adds research points to the current field. Once they pass the field's cost,
 * every turn has a chance of a breakthrough, certain at twice the cost. As in
 * MoO2, points made while no field is chosen are lost.
 */
function advanceResearch(ctx: TurnContext, playerId: PlayerId, points: number): void {
  const player = ctx.state.players[playerId]!;
  const r = player.research;
  if (!r.tierId) return;
  r.progress += points;
  const tier = TIERS_BY_ID[r.tierId]!;
  if (!ctx.rng.chance(breakthroughChance(r.progress, researchCost(player, tier)))) return;
  // Points past the cost are lost with the breakthrough.
  r.progress = 0;
  r.tierId = null;
  const choice = r.techChoice;
  r.techChoice = null;
  if (tier.hyper) {
    player.hyperLevels ??= emptyHyperLevels();
    player.hyperLevels[tier.field] = (player.hyperLevels[tier.field] ?? 0) + 1;
    ctx.emit({ kind: "hyperAdvance", playerId, field: tier.field, level: player.hyperLevels[tier.field] });
    return;
  }
  const options = researchOptions(player, tier);
  let learned: string[];
  if (learnsWholeField(player, tier)) learned = options;
  else if (options.length === 0) learned = [];
  else if (hasTrait(getRace(player.raceId), "uncreative")) learned = [ctx.rng.pick(options)];
  else learned = [choice && options.includes(choice) ? choice : (options.find((t) => !player.techs.includes(t)) ?? options[0]!)];
  player.tiers.push(tier.id);
  for (const t of learned) learnTech(ctx, playerId, t, tier.id, "research");
}

/**
 * Chance that research at `progress` points breaks through a field costing
 * `cost`: the overshoot as a whole percent of the cost, from 1% just past it
 * to certain at twice the cost.
 */
export function breakthroughChance(progress: number, cost: number): number {
  if (progress <= cost) return 0;
  const pct = Math.floor((100 * (progress - cost)) / ((RESEARCH.maxCostMult - 1) * cost));
  return Math.min(100, Math.max(1, pct)) / 100;
}

/**
 * Chance of a breakthrough at the end of this turn, with `points` research
 * added first, as the turn does. 0 while nothing is being researched.
 */
export function nextBreakthroughChance(player: Player, points: number): number {
  const tier = player.research.tierId ? TIERS_BY_ID[player.research.tierId] : undefined;
  return tier ? breakthroughChance(player.research.progress + points, researchCost(player, tier)) : 0;
}

/** Research an empire adds each turn beyond its colonies and treaties: researcher leaders and scout labs. */
export function extraResearch(state: GameState, playerId: PlayerId): number {
  return leaderResearch(state, playerId) + scoutLabResearch(state, playerId);
}


/** Gives a player an application, with the side effects some applications have. */
export function learnTech(ctx: TurnContext, playerId: PlayerId, tech: string, tierId: string, source: "research" | "stolen" | "salvage" | "event"): void {
  if (!grantTech(ctx.state.players[playerId]!, tech)) return;
  ctx.emit({ kind: "techLearned", playerId, techId: tech, tierId, source });
}

// ---------------------------------------------------------------- end of turn

/** Surrenders ordered this turn: the whole empire passes to the chosen ruler. */
function surrenders(ctx: TurnContext): void {
  const { state } = ctx;
  const orders = state.surrenders ?? {};
  for (const [from, to] of Object.entries(orders).sort(([a], [b]) => Number(a) - Number(b))) {
    const giver = state.players[Number(from)];
    const taker = state.players[to];
    if (!giver?.alive || !taker?.alive) continue;
    surrenderEmpire(state, giver.id, taker.id, ctx.emit);
  }
  delete state.surrenders;
}


function checkElimination(ctx: TurnContext): void {
  const { state } = ctx;
  for (const p of state.players) {
    if (!p.alive || p.kind !== "empire") continue;
    const hasColony = Object.values(state.colonies).some((c) => c.ownerId === p.id && !c.outpost);
    const hasColonyShip = Object.values(state.fleets).some(
      (f) => f.ownerId === p.id && f.ships.some((s) => findDesign(p, s.designId)?.module === "colony"),
    );
    if (hasColony || hasColonyShip) continue;
    p.alive = false;
    p.eliminatedTurn = state.turn;
    for (const f of Object.values(state.fleets)) if (f.ownerId === p.id) deleteFleet(state, f.id);
    for (const c of Object.values(state.colonies)) if (c.ownerId === p.id) destroyColony(state, c);
    // Their leaders go back to the pool of free heroes.
    for (const l of Object.values(state.leaders)) if (l.ownerId === p.id || l.offeredTo === p.id) dismissLeader(state, l.id);
    ctx.emit({ kind: "eliminated", playerId: p.id });
  }
  const alive = state.players.filter((p) => p.alive && p.kind === "empire");
  if (alive.length === 1 && state.players.filter((p) => p.kind === "empire").length > 1) endGame(ctx, alive[0]!.id, "conquest");
}

/** Research from Scout Labs aboard an empire's ships, by hull size. */
function scoutLabResearch(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]!;
  let rp = 0;
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId !== playerId) continue;
    for (const s of f.ships) {
      const d = findDesign(player, s.designId);
      if (d && !d.fixed && designStats(player, d).effects.scoutLab) rp += (SCOUT_LAB_RESEARCH[hullIndex(d.hull)] ?? 0) * s.count;
    }
  }
  return rp;
}
