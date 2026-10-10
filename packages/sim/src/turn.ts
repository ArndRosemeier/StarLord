import { BUILDINGS_BY_ID, TERRAFORM_STEP } from "./data/buildings.js";
import { GOVERNMENTS } from "./data/governments.js";
import { CLIMATES, gravityOf, type PlanetType } from "./data/planets.js";
import { getRace, hasTrait, registerRaces } from "./data/races.js";
import { RESEARCH, TECHS, TIERS_BY_ID, TIER_OF_TECH } from "./data/techs.js";
import { bombardment, planetDefense, resolveCombat, type CombatSide } from "./combat.js";
import { buyCost, validateCommand, type Command } from "./commands.js";
import { newId, type TurnContext } from "./context.js";
import { councilTick } from "./council.js";
import { designStats, findDesign } from "./designs.js";
import { acceptProposal, adjustAttitude, declareWar, diplomacyTick, isHostile, treatyIncome } from "./diplomacy.js";
import { COMMAND_OVERAGE_COST, commandPointsAvailable, commandPointsUsed, empireBonus, fleetSpeed, grantTech } from "./empire.js";
import { TRADE_GOODS_RATE, colonyOutput, population, type ColonyOutput } from "./economy.js";
import { espionageTick } from "./espionage.js";
import { distance } from "./galaxy.js";
import { assignJobsForFood } from "./jobs.js";
import { leaderTick, salaries } from "./leaders.js";
import { guardianSlain, raidTick } from "./npc.js";
import { randomEventTick } from "./randomEvents.js";
import { Rng } from "./rng.js";
import { freePlanetsInSystem, isContinuous, itemCost, learnsWholeField, researchOptions, starOf } from "./rules.js";
import { applyMutation } from "./mutation.js";
import { score } from "./score.js";
import type { BuildItem, Colony, Fleet, GameState, Id, PlayerId } from "./types.js";

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
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    const player = state.players[(state.turn + i) % n]!;
    for (const cmd of orders[player.id] ?? []) applyCommand(ctx, player.id, cmd);
  }

  raidTick(ctx);
  moveFleets(ctx);
  const silenced = combatPhase(ctx);
  groundPhase(ctx, silenced);
  runEconomy(ctx);
  espionageTick(state, rng, ctx.emit);
  diplomacyTick(state);
  leaderTick(state, rng);
  councilTick(state, ctx.emit);
  randomEventTick(ctx);
  checkElimination(ctx);

  state.turn += 1;
  if (!state.over && state.turn > state.settings.maxTurns) {
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
  for (const cmd of cmds) applyCommand(ctx, playerId, cmd);
  return { state, rejected };
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
    case "moveFleet": {
      const f = state.fleets[cmd.fleetId]!;
      f.destStarId = cmd.destStarId === f.starId ? null : cmd.destStarId;
      break;
    }
    case "colonize": {
      const f = state.fleets[cmd.fleetId]!;
      const planet = state.planets[cmd.planetId]!;
      const habitable = CLIMATES[planet.type].habitable;
      const pickModule = (m: "colony" | "outpost") =>
        f.ships.find((s) => findDesign(player, s.designId)?.module === m && s.count > 0);
      const stack = (habitable ? pickModule("colony") : undefined) ?? pickModule("outpost")!;
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
      for (const s of cmd.ships) f.ships.find((x) => x.designId === s.designId)!.count -= s.count;
      f.ships = f.ships.filter((s) => s.count > 0);
      const nf: Fleet = { ...f, id: splitFleetId(state, f.id), ships: cmd.ships.map((s) => ({ ...s })), name: `${f.name} II` };
      delete nf.invadeTarget;
      state.fleets[nf.id] = nf;
      break;
    }
    case "mergeFleets": {
      const [first, ...rest] = cmd.fleetIds.map((id) => state.fleets[id]!);
      for (const f of rest) {
        for (const s of f.ships) addShips(first!, s.designId, s.count);
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
    case "propose":
      state.proposals.push({ id: newId(state, "d"), from: playerId, to: cmd.to, kind: cmd.kind, turn: state.turn });
      break;
    case "respond": {
      const p = state.proposals.find((x) => x.id === cmd.proposalId)!;
      state.proposals = state.proposals.filter((x) => x.id !== p.id);
      if (cmd.accept) {
        acceptProposal(state, p);
        ctx.emit({ kind: "diplomacy", playerId: p.from, other: p.to, what: `accepted ${p.kind}` });
      } else {
        adjustAttitude(state, p.from, p.to, -2);
        ctx.emit({ kind: "diplomacy", playerId: p.from, other: p.to, what: `rejected ${p.kind}` });
      }
      break;
    }
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
      const l = player.leaderOffers.find((x) => x.id === cmd.leaderId)!;
      player.bc -= l.hireCost;
      player.leaderOffers = player.leaderOffers.filter((x) => x.id !== l.id);
      state.leaders[l.id] = { ...l, ownerId: playerId };
      ctx.emit({ kind: "leader", playerId, leaderId: l.id, what: `${l.name} joined your empire` });
      break;
    }
    case "assignLeader": {
      // One leader per system or fleet: whoever held the post is relieved.
      for (const other of Object.values(state.leaders)) {
        if (other.ownerId === playerId && other.assignedTo === cmd.targetId && cmd.targetId !== null) other.assignedTo = null;
      }
      state.leaders[cmd.leaderId]!.assignedTo = cmd.targetId;
      break;
    }
    case "dismissLeader":
      delete state.leaders[cmd.leaderId];
      break;
    case "setCouncilVote":
      player.councilVote = cmd.vote;
      break;
    case "setAutomation":
      player.automation = [...cmd.domains];
      break;
  }
}

function addShips(f: Fleet, designId: string, count: number): void {
  const s = f.ships.find((x) => x.designId === designId);
  if (s) s.count += count;
  else f.ships.push({ designId, count });
}

function removeShips(state: GameState, f: Fleet, designId: string, count: number): void {
  const s = f.ships.find((x) => x.designId === designId);
  if (s) s.count -= count;
  f.ships = f.ships.filter((x) => x.count > 0);
  if (f.ships.length === 0) deleteFleet(state, f.id);
}

function deleteFleet(state: GameState, id: Id): void {
  delete state.fleets[id];
  for (const l of Object.values(state.leaders)) if (l.assignedTo === id) l.assignedTo = null;
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
  if (pop > 0) assignJobsForFood(state, colony);
  ctx.emit({ kind: "colonyFounded", playerId, colonyId: colony.id, planetId });
  return colony;
}

function destroyColony(state: GameState, colony: Colony): void {
  state.planets[colony.planetId]!.colonyId = null;
  delete state.colonies[colony.id];
}

// ---------------------------------------------------------------- movement

function moveFleets(ctx: TurnContext): void {
  const { state } = ctx;
  const starsById = new Map(state.galaxy.stars.map((s) => [s.id, s]));
  for (const f of Object.values(state.fleets)) {
    const owner = state.players[f.ownerId]!;
    if (f.destStarId) {
      const dest = starsById.get(f.destStarId)!;
      const here = f.starId ? starsById.get(f.starId) : undefined;
      // The dimensional portal is instant in both directions.
      const portal = dest.special === "raiderHome" || here?.special === "raiderHome";
      const speed = portal ? Infinity : fleetSpeed(owner);
      const d = distance(f, dest);
      if (d <= speed) {
        f.x = dest.x;
        f.y = dest.y;
        f.starId = dest.id;
        f.destStarId = null;
      } else {
        f.x += ((dest.x - f.x) / d) * speed;
        f.y += ((dest.y - f.y) / d) * speed;
        f.starId = null;
      }
      if (f.invadeTarget && f.starId !== state.planets[state.colonies[f.invadeTarget]?.planetId ?? ""]?.starId) delete f.invadeTarget;
    }
    if (f.starId && owner.kind === "empire") explore(ctx, f.ownerId, f.starId);
  }
}

function explore(ctx: TurnContext, playerId: PlayerId, starId: Id): void {
  const p = ctx.state.players[playerId]!;
  if (p.explored.includes(starId)) return;
  p.explored.push(starId);
  ctx.emit({ kind: "explored", playerId, starId });
}

// ---------------------------------------------------------------- combat

function isArmed(state: GameState, f: Fleet): boolean {
  const owner = state.players[f.ownerId]!;
  return f.ships.some((s) => {
    const d = findDesign(owner, s.designId);
    return !!d && (!!d.fixed || d.weapons.length > 0);
  });
}

/** Colonies whose orbital defenses are down this turn, so they can be bombed or invaded. */
type Silenced = Set<Id>;

function combatPhase(ctx: TurnContext): Silenced {
  const { state, rng } = ctx;
  const silenced: Silenced = new Set();
  const stars = new Set<Id>();
  for (const f of Object.values(state.fleets)) if (f.starId) stars.add(f.starId);

  for (const starId of [...stars].sort()) {
    for (let guard = 0; guard < 6; guard++) {
      const pair = nextBattle(state, starId);
      if (!pair) break;
      const [a, b] = pair;
      const outcome = resolveCombat(state, rng, starId, a, b, newId(state, "cb"));
      state.combats.push(outcome.report);
      applyCombat(ctx, starId, [a, b], outcome);
      for (const [owner, down] of outcome.planetSilenced) {
        const side = owner === a.ownerId ? a : b;
        if (down && side.colony) silenced.add(side.colony.id);
      }
    }
  }
  // Colonies without any orbital defense are open to attack-stance fleets.
  for (const c of Object.values(state.colonies)) {
    if (planetDefense(c).hits <= 0 && planetDefense(c).beams <= 0 && planetDefense(c).missiles <= 0) silenced.add(c.id);
  }
  return silenced;
}

function sideAt(state: GameState, starId: Id, ownerId: PlayerId): CombatSide {
  const fleets = Object.values(state.fleets).filter((f) => f.starId === starId && f.ownerId === ownerId);
  const colonies = Object.values(state.colonies).filter(
    (c) => c.ownerId === ownerId && state.planets[c.planetId]!.starId === starId,
  );
  const colony = colonies.sort((x, y) => planetDefense(y).hits - planetDefense(x).hits)[0];
  const owner = state.players[ownerId]!;
  return {
    ownerId,
    fleets,
    colony,
    attacksPlanet: owner.kind === "raiders" || fleets.some((f) => f.stance === "attack"),
  };
}

/** Finds the next pair of hostile parties at a star that will fight, if any. */
function nextBattle(state: GameState, starId: Id): [CombatSide, CombatSide] | null {
  const owners = new Set<PlayerId>();
  for (const f of Object.values(state.fleets)) if (f.starId === starId) owners.add(f.ownerId);
  for (const c of Object.values(state.colonies)) if (state.planets[c.planetId]!.starId === starId) owners.add(c.ownerId);
  const list = [...owners].sort((x, y) => x - y);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (!isHostile(state, list[i]!, list[j]!)) continue;
      const a = sideAt(state, starId, list[i]!);
      const b = sideAt(state, starId, list[j]!);
      if (wantsFight(state, a, b) || wantsFight(state, b, a)) return [a, b];
    }
  }
  return null;
}

function hasDefenses(c: Colony | undefined): boolean {
  if (!c) return false;
  const d = planetDefense(c);
  return d.beams > 0 || d.missiles > 0;
}

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
  for (const [fleetId, ships] of outcome.survivors) {
    const f = state.fleets[fleetId];
    if (!f) continue;
    const before = f.ships.reduce((n, s) => n + s.count, 0);
    f.ships = ships;
    if (ships.length === 0) {
      deleteFleet(state, fleetId);
      const owner = state.players[f.ownerId]!;
      const killer = sides.find((s) => s.ownerId !== f.ownerId)!.ownerId;
      if (owner.kind === "monsters" && before > 0) guardianSlain(ctx, killer, starId);
      if (owner.kind === "raiders" && state.galaxy.stars.find((s) => s.id === starId)?.special === "raiderHome") {
        const homeLeft = Object.values(state.fleets).some((x) => x.ownerId === f.ownerId && x.starId === starId);
        if (!homeLeft && state.players[killer]!.kind === "empire") {
          state.raiders.defeated = true;
          endGame(ctx, killer, "raiders");
        }
      }
    }
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

// ---------------------------------------------------------------- bombing and invasion

export const POP_PER_BOMB_DAMAGE = 1 / 15;
export const GROUND_BASE = 10;
export const GROUND_PER_LEVEL = 5;

function enemyArmedAt(state: GameState, starId: Id, playerId: PlayerId): boolean {
  return Object.values(state.fleets).some(
    (f) => f.starId === starId && isHostile(state, playerId, f.ownerId) && isArmed(state, f),
  );
}

function groundPhase(ctx: TurnContext, silenced: Silenced): void {
  const { state, rng } = ctx;
  for (const f of Object.values(state.fleets)) {
    if (!f.starId || !state.fleets[f.id]) continue;
    const owner = state.players[f.ownerId]!;
    if (owner.kind === "monsters") continue;
    const targets = Object.values(state.colonies).filter(
      (c) => state.planets[c.planetId]!.starId === f.starId && isHostile(state, f.ownerId, c.ownerId) && silenced.has(c.id),
    );
    if (targets.length === 0 || enemyArmedAt(state, f.starId, f.ownerId)) continue;

    if (f.invadeTarget && targets.some((c) => c.id === f.invadeTarget)) {
      invade(ctx, f, state.colonies[f.invadeTarget]!);
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
      const kills = Math.floor(bombs * POP_PER_BOMB_DAMAGE + rng.next()) + spores;
      raze(ctx, c, kills);
      if (bombs > 0 && c.buildings.length > 0 && rng.chance(Math.min(0.5, bombs / 200))) {
        c.buildings.splice(rng.int(0, c.buildings.length - 1), 1);
      }
    }
  }
}

function raze(ctx: TurnContext, c: Colony, kills: number): void {
  const { state } = ctx;
  if (!state.colonies[c.id]) return;
  let lost = 0;
  for (let i = 0; i < kills && population(c) > 0; i++) {
    if (c.workers > 0) c.workers--;
    else if (c.farmers > 0) c.farmers--;
    else c.scientists--;
    lost++;
  }
  if (lost > 0) ctx.emit({ kind: "bombarded", playerId: c.ownerId, colonyId: c.id, popLost: lost });
  if (!c.outpost && population(c) === 0) {
    ctx.emit({ kind: "colonyLost", playerId: c.ownerId, colonyId: c.id, to: null, how: "destroyed" });
    destroyColony(state, c);
  }
}

function groundStrength(state: GameState, playerId: PlayerId, raceId: string): number {
  const p = state.players[playerId]!;
  const levels = getRace(raceId).picks.groundCombat + empireBonus(p).groundCombat;
  return GROUND_BASE + GROUND_PER_LEVEL * levels;
}

function invade(ctx: TurnContext, f: Fleet, colony: Colony): void {
  const { state, rng } = ctx;
  const attacker = state.players[f.ownerId]!;
  let troops = 0;
  for (const s of [...f.ships]) {
    const d = findDesign(attacker, s.designId);
    const t = d ? designStats(attacker, d).troops : 0;
    if (t > 0) {
      troops += t * s.count;
      removeShips(state, f, s.designId, s.count);
    }
  }
  delete f.invadeTarget;
  const out = colonyOutput(state, colony);
  let defenders = colony.outpost ? 0 : out.troops;
  const atk = groundStrength(state, attacker.id, attacker.raceId);
  // Defenders fight from prepared positions.
  const def = groundStrength(state, colony.ownerId, colony.raceId) + 5;
  while (troops > 0 && defenders > 0) {
    if (rng.int(1, 100) + atk > rng.int(1, 100) + def) defenders--;
    else troops--;
  }
  if (troops <= 0) {
    ctx.emit({ kind: "invasionFailed", playerId: attacker.id, colonyId: colony.id });
    return;
  }
  const loser = colony.ownerId;
  ctx.emit({ kind: "colonyLost", playerId: loser, colonyId: colony.id, to: attacker.id, how: "invaded" });
  colony.ownerId = attacker.id;
  colony.queue = [];
  colony.progress = 0;
  colony.unrestUntil = state.turn + 20;
  if (colony.outpost) colony.raceId = attacker.raceId;
  ctx.emit({ kind: "colonyCaptured", playerId: attacker.id, colonyId: colony.id, from: loser });
  // Captured scientists sometimes yield a technology.
  const loserTechs = state.players[loser]!.techs.filter((t) => !attacker.techs.includes(t) && TIER_OF_TECH[t]);
  if (loserTechs.length > 0 && rng.chance(0.5)) {
    const tech = rng.pick(loserTechs);
    learnTech(ctx, attacker.id, tech, TIER_OF_TECH[tech]!.id, "salvage");
  }
  for (const l of Object.values(state.leaders)) {
    if (l.ownerId === loser && l.assignedTo === state.planets[colony.planetId]!.starId) l.assignedTo = null;
  }
}

// ---------------------------------------------------------------- economy

function runEconomy(ctx: TurnContext): void {
  const { state } = ctx;
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
    const list = byPlayer.get(player.id) ?? [];
    const traders = hasTrait(getRace(player.raceId), "fantasticTraders") ? 2 : 1;

    // Food is pooled across the empire (MoO2 freighters, simplified).
    const foodBalance = list.reduce((sum, x) => sum + x.out.foodNet, 0);
    if (foodBalance < 0) starve(ctx, player.id, list, Math.ceil(-foodBalance));

    let research = 0;
    let bc = 0;
    for (const { colony, out } of list) {
      research += out.research;
      bc += out.bc - out.maintenance + specialIncome(state, colony);
      bc += produce(ctx, colony, out.industry, traders);
      grow(colony, out);
    }
    const treaties = treatyIncome(state, player.id, totals);
    research += treaties.research;
    bc += treaties.bc;
    bc -= salaries(state, player.id);
    const over = commandPointsUsed(state, player.id) - commandPointsAvailable(state, player.id);
    if (over > 0) bc -= over * COMMAND_OVERAGE_COST;
    player.bc = Math.round((player.bc + bc) * 10) / 10;
    if (player.bc < 0) bankrupt(ctx, player.id);
    advanceResearch(ctx, player.id, research);
    upgradeGovernment(player);
  }
}

/** Gold and gem deposits pay out; artifacts boost research elsewhere. */
function specialIncome(state: GameState, colony: Colony): number {
  if (colony.outpost) return 0;
  const special = state.planets[colony.planetId]!.special;
  return special === "gold" ? 5 : special === "gems" ? 8 : 0;
}

/** Debt sells buildings, most expensive upkeep first, until the books balance. */
function bankrupt(ctx: TurnContext, playerId: PlayerId): void {
  const { state } = ctx;
  const player = state.players[playerId]!;
  const all = Object.values(state.colonies)
    .filter((c) => c.ownerId === playerId)
    .flatMap((c) => c.buildings.map((b) => ({ c, b, upkeep: BUILDINGS_BY_ID[b]?.maintenance ?? 0 })))
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

function starve(ctx: TurnContext, playerId: PlayerId, list: { colony: Colony; out: ColonyOutput }[], deficit: number): void {
  const hungry = list.filter((x) => x.out.foodNet < 0).sort((a, b) => a.out.foodNet - b.out.foodNet);
  for (const { colony } of hungry) {
    if (deficit <= 0) break;
    if (population(colony) <= 1) continue;
    if (colony.workers > 0) colony.workers--;
    else if (colony.scientists > 0) colony.scientists--;
    else colony.farmers--;
    colony.growthK = 0;
    deficit -= 1;
    ctx.emit({ kind: "starvation", playerId, colonyId: colony.id });
  }
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
    return total * TRADE_GOODS_RATE * tradeMult;
  }
  if (head.kind === "project" && head.id === "housing") {
    colony.growthK += industry * 3;
    return 0;
  }
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
    if (colony.queue[0]?.kind === "project") colony.growthK += left * 3;
    else return left * TRADE_GOODS_RATE * tradeMult;
  }
  return 0;
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
    if (docked) addShips(docked, item.designId, 1);
    else {
      const f: Fleet = {
        id: newId(state, "f"), ownerId: colony.ownerId, x: star.x, y: star.y, starId: star.id, destStarId: null,
        ships: [{ designId: item.designId, count: 1 }], stance: "defend", name: `${design.name} Group`,
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
  switch (id) {
    case "colonyBase":
    case "outpostBase": {
      const kind = id === "colonyBase" ? "habitable" : "barrenRock";
      const free = freePlanetsInSystem(state, colony, kind);
      const target = free.find((p) => p.id === planetId) ?? free[0];
      if (target) foundColony(ctx, colony.ownerId, target.id, id === "colonyBase" ? 1 : 0, player.raceId);
      return;
    }
    case "terraform": {
      const next = TERRAFORM_STEP[planet.type];
      if (next) {
        planet.type = next as PlanetType;
        colony.terraformed += 1;
      }
      return;
    }
    case "gaiaTransform":
      if (planet.type === "terran") planet.type = "gaia";
      return;
    case "artificialPlanet": {
      const free = freePlanetsInSystem(state, colony, "barrenRock");
      const target = free.find((p) => p.id === planetId) ?? free[0];
      if (target) {
        target.size = target.type === "gasGiant" ? "large" : "small";
        target.type = "barren";
        target.gravity = gravityOf(target.size, target.minerals);
      }
      return;
    }
    case "dimensionalPortal":
      player.hasPortal = true;
      return;
    case "spy":
      player.spies.home += 1;
      return;
  }
  void rng;
}

function grow(colony: Colony, out: ColonyOutput): void {
  if (colony.outpost) return;
  if (out.population >= out.maxPopulation) {
    colony.growthK = 0;
    // Terraforming can shrink a planet's capacity; extra people leave.
    while (population(colony) > out.maxPopulation && population(colony) > 1) {
      if (colony.workers > 0) colony.workers--;
      else if (colony.scientists > 0) colony.scientists--;
      else colony.farmers--;
    }
    return;
  }
  colony.growthK += out.growthK;
  if (colony.growthK >= 1000) {
    colony.growthK -= 1000;
    // New colonists farm if the colony is short of food, otherwise they work.
    if (out.foodNet < 0) colony.farmers++;
    else colony.workers++;
  }
}

/**
 * Adds research points. Once they reach the field's cost, every turn has a
 * chance of a breakthrough, certain at twice the cost. Points past the cost
 * carry over to the next field.
 */
function advanceResearch(ctx: TurnContext, playerId: PlayerId, points: number): void {
  const player = ctx.state.players[playerId]!;
  const r = player.research;
  r.progress += points;
  if (!r.tierId) return;
  const tier = TIERS_BY_ID[r.tierId]!;
  if (r.progress < tier.cost) return;
  if (!ctx.rng.chance(breakthroughChance(r.progress, tier.cost))) return;
  r.progress -= tier.cost;
  r.tierId = null;
  const choice = r.techChoice;
  r.techChoice = null;
  if (tier.hyper) {
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

/** Chance that research at `progress` points breaks through a field costing `cost`. */
export function breakthroughChance(progress: number, cost: number): number {
  if (progress < cost) return 0;
  const span = (RESEARCH.maxCostMult - 1) * cost;
  const t = span > 0 ? Math.min(1, (progress - cost) / span) : 1;
  return RESEARCH.breakthroughStartChance + (1 - RESEARCH.breakthroughStartChance) * t;
}

/** Gives a player an application, with the side effects some applications have. */
export function learnTech(ctx: TurnContext, playerId: PlayerId, tech: string, tierId: string, source: "research" | "stolen" | "salvage" | "event"): void {
  if (!grantTech(ctx.state.players[playerId]!, tech)) return;
  ctx.emit({ kind: "techLearned", playerId, techId: tech, tierId, source });
}

// ---------------------------------------------------------------- end of turn

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
    for (const l of Object.values(state.leaders)) if (l.ownerId === p.id) delete state.leaders[l.id];
    ctx.emit({ kind: "eliminated", playerId: p.id });
  }
  const alive = state.players.filter((p) => p.alive && p.kind === "empire");
  if (alive.length === 1 && state.players.filter((p) => p.kind === "empire").length > 1) endGame(ctx, alive[0]!.id, "conquest");
}
