import { BUILDINGS_BY_ID } from "./data/buildings.js";
import { DESIGNS_BY_ID } from "./data/ships.js";
import { TIERS_BY_ID } from "./data/techs.js";
import { getRace, hasTrait } from "./data/races.js";
import { buyCost, itemCost, starOfPlanet, validateCommand, type Command } from "./commands.js";
import { TRADE_GOODS_RATE, colonyOutput, population, type ColonyOutput } from "./economy.js";
import { assignJobsForFood } from "./jobs.js";
import { Rng } from "./rng.js";
import { fleetSpeed } from "./rules.js";
import { distance } from "./galaxy.js";
import type { Colony, Fleet, GameEvent, GameState, Id, PlayerId } from "./types.js";
import { score } from "./score.js";

export type TurnOrders = Partial<Record<PlayerId, Command[]>>;

/**
 * Advances the game by one turn. Pure with respect to its input: the given
 * state is cloned, so callers can keep history for replays and undo.
 */
export function processTurn(prev: GameState, orders: TurnOrders): GameState {
  const state = structuredClone(prev);
  if (state.over) return state;
  state.events = [];
  const rng = new Rng(state.rng);
  const ctx: TurnContext = { state, rng, emit: (e) => state.events.push({ turn: state.turn, ...e } as GameEvent) };

  // Rotate who acts first each turn so no seat always wins same-turn contests.
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    const player = state.players[(state.turn + i) % n]!;
    for (const cmd of orders[player.id] ?? []) applyCommand(ctx, player.id, cmd);
  }
  moveFleets(ctx);
  runEconomy(ctx);
  checkElimination(ctx);

  state.turn += 1;
  if (!state.over && state.turn > state.settings.maxTurns) {
    state.over = true;
    const alive = state.players.filter((p) => p.alive);
    state.winner = alive.reduce((best, p) => (score(state, p.id) > score(state, best.id) ? p : best), alive[0]!).id;
  }
  return state;
}

interface TurnContext {
  state: GameState;
  rng: Rng;
  emit: (e: DistributiveOmit<GameEvent, "turn">) => void;
}

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

function newId(state: GameState, prefix: string): Id {
  return `${prefix}${state.nextId++}`;
}

/** Validates and applies a single command. Invalid commands are reported, not thrown. */
export function applyCommand(ctx: TurnContext, playerId: PlayerId, cmd: Command): void {
  const { state } = ctx;
  const check = validateCommand(state, playerId, cmd);
  if (!check.ok) {
    ctx.emit({ kind: "commandRejected", playerId, reason: `${cmd.type}: ${check.reason}` });
    return;
  }
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
      const headChanged = JSON.stringify(c.queue[0]) !== JSON.stringify(cmd.queue[0]);
      c.queue = cmd.queue.filter((i) => i.kind !== "building" || !c.buildings.includes(i.id));
      // Like MoO2, progress carries over when the head of the queue changes.
      if (headChanged && c.queue.length === 0) c.progress = 0;
      break;
    }
    case "buy": {
      const c = state.colonies[cmd.colonyId]!;
      const cost = buyCost(state, c);
      state.players[playerId]!.bc -= cost;
      c.progress = itemCost(state, playerId, c.queue[0]!);
      break;
    }
    case "setResearch": {
      const r = state.players[playerId]!.research;
      r.tierId = cmd.tierId;
      r.techChoice = cmd.techId;
      break;
    }
    case "moveFleet": {
      const f = state.fleets[cmd.fleetId]!;
      f.destStarId = cmd.destStarId === f.starId ? null : cmd.destStarId;
      break;
    }
    case "colonize": {
      const f = state.fleets[cmd.fleetId]!;
      const stack = f.ships.find((s) => DESIGNS_BY_ID[s.designId]?.role === "colony" && s.count > 0)!;
      stack.count -= 1;
      f.ships = f.ships.filter((s) => s.count > 0);
      if (f.ships.length === 0) delete state.fleets[f.id];
      foundColony(ctx, playerId, cmd.planetId, 1);
      break;
    }
    case "splitFleet": {
      const f = state.fleets[cmd.fleetId]!;
      for (const s of cmd.ships) f.ships.find((x) => x.designId === s.designId)!.count -= s.count;
      f.ships = f.ships.filter((s) => s.count > 0);
      const nf: Fleet = { ...f, id: newId(state, "f"), ships: cmd.ships.map((s) => ({ ...s })) };
      state.fleets[nf.id] = nf;
      break;
    }
  }
}

function foundColony(ctx: TurnContext, playerId: PlayerId, planetId: Id, pop: number): Colony {
  const { state } = ctx;
  const planet = state.planets[planetId]!;
  const star = starOfPlanet(state, planetId);
  const sameStar = Object.values(state.colonies).filter((c) => state.planets[c.planetId]!.starId === star.id).length;
  const roman = ["", " II", " III", " IV", " V", " VI"][sameStar] ?? "";
  const colony: Colony = {
    id: newId(state, "c"), planetId, ownerId: playerId, name: `${star.name}${roman}`,
    farmers: 0, workers: pop, scientists: 0, growthK: 0,
    buildings: [], queue: [], progress: 0, founded: state.turn,
  };
  planet.colonyId = colony.id;
  state.colonies[colony.id] = colony;
  assignJobsForFood(state, colony);
  ctx.emit({ kind: "colonyFounded", playerId, colonyId: colony.id, planetId });
  return colony;
}

function moveFleets(ctx: TurnContext): void {
  const { state } = ctx;
  const starsById = new Map(state.galaxy.stars.map((s) => [s.id, s]));
  for (const f of Object.values(state.fleets)) {
    if (f.destStarId) {
      const dest = starsById.get(f.destStarId)!;
      const speed = fleetSpeed(state, f.ownerId);
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
    }
    if (f.starId) explore(ctx, f.ownerId, f.starId);
  }
}

function explore(ctx: TurnContext, playerId: PlayerId, starId: Id): void {
  const p = ctx.state.players[playerId]!;
  if (p.explored.includes(starId)) return;
  p.explored.push(starId);
  ctx.emit({ kind: "explored", playerId, starId });
}

function runEconomy(ctx: TurnContext): void {
  const { state } = ctx;
  const byPlayer = new Map<PlayerId, { colony: Colony; out: ColonyOutput }[]>();
  for (const c of Object.values(state.colonies)) {
    const list = byPlayer.get(c.ownerId) ?? [];
    list.push({ colony: c, out: colonyOutput(state, c) });
    byPlayer.set(c.ownerId, list);
  }

  for (const player of state.players) {
    const list = byPlayer.get(player.id) ?? [];
    const race = getRace(player.raceId);

    // Food is pooled across the empire (MoO2 freighters, simplified).
    const foodBalance = list.reduce((sum, x) => sum + x.out.foodNet, 0);
    if (foodBalance < 0) starve(ctx, player.id, list, Math.ceil(-foodBalance));

    let research = 0;
    let bc = 0;
    for (const { colony, out } of list) {
      research += out.research;
      bc += out.bc - out.maintenance;
      bc += produce(ctx, colony, out.industry, hasTrait(race, "fantasticTraders") ? 2 : 1);
      grow(ctx, colony, out);
    }
    player.bc = Math.max(0, Math.round((player.bc + bc) * 10) / 10);
    advanceResearch(ctx, player.id, research);
  }
}

function starve(ctx: TurnContext, playerId: PlayerId, list: { colony: Colony; out: ColonyOutput }[], deficit: number): void {
  const hungry = list.filter((x) => x.out.foodNet < 0).sort((a, b) => a.out.foodNet - b.out.foodNet);
  for (const { colony } of hungry) {
    if (deficit <= 0) break;
    if (population(colony) <= 1) continue;
    removePop(colony);
    colony.growthK = 0;
    deficit -= 1;
    ctx.emit({ kind: "starvation", playerId, colonyId: colony.id });
  }
}

function removePop(c: Colony): void {
  if (c.workers > 0) c.workers--;
  else if (c.scientists > 0) c.scientists--;
  else c.farmers--;
}

/** Spends industry on the build queue. Returns BC earned from trade goods. */
function produce(ctx: TurnContext, colony: Colony, industry: number, tradeMult: number): number {
  const { state } = ctx;
  let available = industry + colony.progress;
  colony.progress = 0;
  while (colony.queue.length > 0) {
    const head = colony.queue[0]!;
    if (head.kind === "tradeGoods") return available * TRADE_GOODS_RATE * tradeMult;
    const cost = itemCost(state, colony.ownerId, head);
    if (available < cost) {
      colony.progress = available;
      return 0;
    }
    available -= cost;
    colony.queue.shift();
    completeItem(ctx, colony, head);
    // MoO2 builds at most one item per turn; overflow carries into the next.
    colony.progress = available;
    return 0;
  }
  // An empty queue converts output to BC rather than wasting it.
  return available * TRADE_GOODS_RATE * tradeMult;
}

function completeItem(ctx: TurnContext, colony: Colony, item: Colony["queue"][number]): void {
  const { state } = ctx;
  if (item.kind === "building") {
    if (BUILDINGS_BY_ID[item.id] && !colony.buildings.includes(item.id)) colony.buildings.push(item.id);
  } else if (item.kind === "ship") {
    const star = starOfPlanet(state, colony.planetId);
    // Join an idle fleet of the same role so scouts and colony ships stay separate from warships.
    const role = DESIGNS_BY_ID[item.designId]!.role;
    const docked = Object.values(state.fleets).find(
      (f) => f.ownerId === colony.ownerId && f.starId === star.id && !f.destStarId &&
        f.ships.every((s) => DESIGNS_BY_ID[s.designId]!.role === role),
    );
    if (docked) {
      const stack = docked.ships.find((s) => s.designId === item.designId);
      if (stack) stack.count++;
      else docked.ships.push({ designId: item.designId, count: 1 });
    } else {
      const f: Fleet = {
        id: newId(state, "f"), ownerId: colony.ownerId, x: star.x, y: star.y,
        starId: star.id, destStarId: null, ships: [{ designId: item.designId, count: 1 }],
      };
      state.fleets[f.id] = f;
    }
  }
  ctx.emit({ kind: "built", playerId: colony.ownerId, colonyId: colony.id, item });
}

function grow(ctx: TurnContext, colony: Colony, out: ColonyOutput): void {
  if (out.population >= out.maxPopulation) {
    colony.growthK = 0;
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

function advanceResearch(ctx: TurnContext, playerId: PlayerId, points: number): void {
  const player = ctx.state.players[playerId]!;
  const r = player.research;
  r.progress += points;
  if (!r.tierId) return;
  const tier = TIERS_BY_ID[r.tierId]!;
  if (r.progress < tier.cost) return;
  r.progress -= tier.cost;
  const race = getRace(player.raceId);
  let learned: string[];
  if (hasTrait(race, "creative")) learned = tier.techs;
  else if (hasTrait(race, "uncreative")) learned = [ctx.rng.pick(tier.techs)];
  else learned = [r.techChoice && tier.techs.includes(r.techChoice) ? r.techChoice : tier.techs[0]!];
  player.tiers.push(tier.id);
  for (const t of learned) {
    if (!player.techs.includes(t)) player.techs.push(t);
    ctx.emit({ kind: "techLearned", playerId, techId: t, tierId: tier.id });
  }
  r.tierId = null;
  r.techChoice = null;
}

function checkElimination(ctx: TurnContext): void {
  const { state } = ctx;
  for (const p of state.players) {
    if (!p.alive) continue;
    const hasColony = Object.values(state.colonies).some((c) => c.ownerId === p.id);
    const hasColonyShip = Object.values(state.fleets).some(
      (f) => f.ownerId === p.id && f.ships.some((s) => DESIGNS_BY_ID[s.designId]?.role === "colony"),
    );
    if (!hasColony && !hasColonyShip) p.alive = false;
  }
  const alive = state.players.filter((p) => p.alive);
  if (alive.length === 1 && state.players.length > 1) {
    state.over = true;
    state.winner = alive[0]!.id;
  }
}
