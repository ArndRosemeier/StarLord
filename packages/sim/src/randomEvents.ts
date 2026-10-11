import { EVENTS, EVENT_NUMBERS as N, EVENT_START, EVENT_TIMING, type EventId } from "./data/events.js";
import { DIFFICULTY_ORDER, MINERAL_STEPS } from "./data/galaxy.js";
import { DRAGON_BRIBE_PER_POP, DRAGON_PILLAGE, HYDRA_KILL_SHARE, ROAMING_MONSTERS } from "./data/monsters.js";
import { getRace, hasTrait } from "./data/races.js";
import { RESEARCH, TECHS, TECH_TIERS, TIERS_BY_ID, TIER_OF_TECH, researchCost } from "./data/techs.js";
import { newId, type TurnContext } from "./context.js";
import { designStats, findDesign } from "./designs.js";
import { attitude } from "./diplomacy.js";
import { setRelation } from "./relations.js";
import { destructibleBuildings, population } from "./economy.js";

import { grantTech } from "./empire.js";
import { blockedByBlackHole, distance } from "./galaxy.js";
import { removeShips } from "./fleetOps.js";
import { destroyColony, isArmedFleet } from "./ground.js";
import { removePopulation } from "./jobs.js";
import { monstersId, raidersId, spawn } from "./npc.js";
import { explore } from "./specials.js";
import type { ActiveEvent, Colony, Fleet, GameState, Id, Player, PlayerId } from "./types.js";

/**
 * Random events after the original's Galactic News: windfalls, disasters
 * with a counter (a fleet for comets and pirates, colony research for plague
 * and supernova), galaxy-wide hyperspace trouble and monsters invading from
 * beyond the rim. Timing, picking and victims follow the original program:
 * the chance grows with every quiet turn, every event is equally likely,
 * disasters hit the biggest empires and windfalls the smallest, and lucky
 * empires are spared disasters and get extra windfalls. The whole system can
 * be switched off in the game settings.
 */
export function randomEventTick(ctx: TurnContext): void {
  const { state, rng } = ctx;
  state.activeEvents ??= [];
  const clock = (state.eventClock ??= { last: 0, luck: {} });
  tickActive(ctx);
  const on = state.settings.randomEvents !== false;
  luckyWindfalls(ctx, on);
  if (!on || state.turn < EVENT_START || state.turn - clock.last <= EVENT_TIMING.cooldown) return;
  const d = difficulty(state);
  const quiet = Math.floor(((state.turn - clock.last) * (d + 1)) / (d + 2));
  if (rng.int(1, EVENT_TIMING.dieSides) > quiet) return;
  const ids = Object.keys(EVENTS) as EventId[];
  for (let i = 0; i < EVENT_TIMING.tries; i++) {
    if (strike(ctx, ids[rng.int(0, ids.length - 1)]!, d === 0)) {
      clock.last = state.turn;
      return;
    }
  }
}

/** Fires one event at a chosen empire (or the galaxy), skipping the dice; false if it can't happen now. */
export function fireEvent(ctx: TurnContext, kind: EventId, victim?: Player): boolean {
  ctx.state.activeEvents ??= [];
  return EVENTS[kind].global ? HANDLERS[kind](ctx, null) : HANDLERS[kind](ctx, victim ?? null);
}

/** Tries one event; false if it can't happen now. */
function strike(ctx: TurnContext, kind: EventId, tutor: boolean, forced?: Player): boolean {
  const { state } = ctx;
  const def = EVENTS[kind];
  const flux = (state.activeEvents ?? []).some((e) => e.kind === "hyperspaceFlux");
  if (def.disabled || (tutor && def.mood === "bad")) return false;
  if (def.monster && !(state.settings.monsters && monstersId(state) !== null)) return false;
  if (def.fromTurn !== undefined && state.turn < def.fromTurn) return false;
  if (def.needsFlux && !flux) return false;
  if (def.fluxBefore !== undefined && state.turn < def.fluxBefore && !flux) return false;
  if (def.global) {
    if ((state.activeEvents ?? []).some((e) => e.kind === kind)) return false;
    return HANDLERS[kind](ctx, null);
  }
  const victim = forced ?? eventTarget(ctx, def.mood === "good");
  if (!victim || (def.mood === "bad" && lucky(victim))) return false;
  return HANDLERS[kind](ctx, victim);
}

/**
 * Whom an event strikes: disasters skip the smallest empire (and anyone
 * already suffering one) and favour the others by (population − smallest)²;
 * windfalls skip the biggest and favour by (biggest − population)².
 */
function eventTarget(ctx: TurnContext, good: boolean): Player | null {
  const { state, rng } = ctx;
  const suffering = new Set((state.activeEvents ?? []).filter((e) => EVENTS[e.kind as EventId]?.mood === "bad").map((e) => e.playerId));
  const pop = (p: Player) => coloniesOf(state, p.id).reduce((n, c) => n + population(c), 0);
  const list = state.players
    .filter((p) => p.kind === "empire" && p.alive && (good || !suffering.has(p.id)))
    .map((p) => ({ p, pop: pop(p) }));
  if (list.length === 0) return null;
  if (list.length > 1) {
    const extreme = good ? Math.max(...list.map((x) => x.pop)) : Math.min(...list.map((x) => x.pop));
    list.splice(list.findIndex((x) => x.pop === extreme), 1);
    const weights = list.map((x) => (good ? extreme - x.pop : x.pop - extreme) ** 2);
    const total = weights.reduce((a, b) => a + b, 0);
    if (total > 0) {
      let roll = rng.next() * total;
      for (let i = 0; i < list.length; i++) {
        roll -= weights[i]!;
        if (roll < 0) return list[i]!.p;
      }
    }
  }
  return list[0]!.p;
}

/** Lucky empires build up to a windfall of their own: the longer they wait, the likelier. */
function luckyWindfalls(ctx: TurnContext, eventsOn: boolean): void {
  const { state, rng } = ctx;
  const clock = state.eventClock!;
  const k = EVENT_TIMING.luckDivisor;
  const div = eventsOn ? (state.settings.raiders ? k.eventsAndRaiders : k.events) : state.settings.raiders ? k.noEventsWithRaiders : k.noEvents;
  const good = (Object.keys(EVENTS) as EventId[]).filter((id) => EVENTS[id].mood === "good");
  for (const p of state.players) {
    if (p.kind !== "empire" || !p.alive || !lucky(p)) continue;
    const waited = (clock.luck[p.id] = (clock.luck[p.id] ?? 0) + 1);
    if (state.turn < EVENT_START || rng.int(1, EVENT_TIMING.luckDie) > waited / div) continue;
    for (let i = 0; i < EVENT_TIMING.tries; i++) {
      if (strike(ctx, good[rng.int(0, good.length - 1)]!, false, p)) {
        clock.luck[p.id] = 0;
        break;
      }
    }
  }
}

function difficulty(state: GameState): number {
  return DIFFICULTY_ORDER.indexOf(state.settings.difficulty ?? "average");
}

/** Last turn of a lasting event started now; it may end sooner (see tickActive). */
function lastingUntil(state: GameState): number {
  return state.turn + N.lasting.maxTurns;
}

const LASTING = new Set(["hyperspaceFlux", "timeSpaceAnomaly", "pirates", "warpBeast"]);

function lucky(p: Player): boolean {
  return hasTrait(getRace(p.raceId), "lucky");
}

function range(ctx: TurnContext, [lo, hi]: [number, number]): number {
  return Number.isInteger(lo) && Number.isInteger(hi) ? ctx.rng.int(lo, hi) : lo + ctx.rng.next() * (hi - lo);
}

function coloniesOf(state: GameState, playerId: PlayerId, filter: (c: Colony) => boolean = () => true): Colony[] {
  return Object.values(state.colonies)
    .filter((c) => c.ownerId === playerId && !c.outpost && filter(c))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function starOfColony(state: GameState, c: Colony): Id {
  return state.planets[c.planetId]!.starId;
}

function news(ctx: TurnContext, playerId: PlayerId, what: string, starId?: Id): void {
  ctx.emit({ kind: "random", playerId, what, ...(starId ? { starId } : {}) });
}

function newsAll(ctx: TurnContext, what: string, starId?: Id): void {
  for (const p of ctx.state.players) if (p.kind === "empire" && p.alive) news(ctx, p.id, what, starId);
}

function addEvent(state: GameState, e: Omit<ActiveEvent, "id">): ActiveEvent {
  const ev = { id: newId(state, "ev"), ...e };
  state.activeEvents!.push(ev);
  return ev;
}

function endEvent(state: GameState, ev: ActiveEvent): void {
  state.activeEvents = (state.activeEvents ?? []).filter((e) => e.id !== ev.id);
}

function techName(t: string): string {
  return TECHS[t]?.name ?? t;
}

function shipsInTransit(state: GameState, filter: (f: Fleet) => boolean): Fleet[] {
  return Object.values(state.fleets)
    .filter((f) => f.starId === null && state.players[f.ownerId]?.kind === "empire" && filter(f))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Total size class of a player's armed ships at a star. */
function armedSizeAt(state: GameState, playerId: PlayerId, starId: Id): number {
  const owner = state.players[playerId]!;
  let total = 0;
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId !== playerId || f.starId !== starId || !isArmedFleet(state, f)) continue;
    for (const s of f.ships) {
      const d = findDesign(owner, s.designId);
      if (d && (d.fixed || d.weapons.length > 0)) total += designStats(owner, d).sizeClass * s.count;
    }
  }
  return total;
}

/** Kills one ship of a fleet; an officer aboard the fleet's last ship dies with it. */
function loseShip(state: GameState, f: Fleet, designId: string): void {
  const total = f.ships.reduce((n, s) => n + s.count, 0);
  if (total <= 1) {
    for (const l of Object.values(state.leaders)) if (l.assignedTo === f.id) delete state.leaders[l.id];
  }
  removeShips(state, f, designId, 1);
}

type Handler = (ctx: TurnContext, p: Player | null) => boolean;

const HANDLERS: Record<EventId, Handler> = {
  derelict(ctx, p) {
    const open = TECH_TIERS.filter((t) => !t.hyper && t.cost <= N.derelictMaxCost && !p!.tiers.includes(t.id))
      .flatMap((t) => t.techs)
      .filter((t) => !p!.techs.includes(t));
    if (open.length === 0) return false;
    const tech = ctx.rng.pick(open);
    grantTech(p!, tech);
    ctx.emit({ kind: "techLearned", playerId: p!.id, techId: tech, tierId: TIER_OF_TECH[tech]?.id ?? "", source: "event" });
    news(ctx, p!.id, `Scientists studied an ancient derelict ship and learned ${techName(tech)}.`);
    return true;
  },
  axisShift(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id, (c) => {
      const t = ctx.state.planets[c.planetId]!.type;
      return t !== "terran" && t !== "gaia" && t !== "gasGiant" && t !== "asteroids";
    });
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    ctx.state.planets[c.planetId]!.type = "terran";
    news(ctx, p!.id, `A shift in the planetary axis of ${c.name} brought it a mild terran climate.`, starOfColony(ctx.state, c));
    return true;
  },
  donation(ctx, p) {
    const bc = N.donation.base + N.donation.step * Math.floor(ctx.state.turn / N.donation.perTurns);
    p!.bc += bc;
    news(ctx, p!.id, `Wealthy patrons donated ${bc} BC to the treasury.`);
    return true;
  },
  mineralDeposit(ctx, p) {
    return shiftMinerals(ctx, p!, N.depositSteps);
  },
  mineralDepletion(ctx, p) {
    return shiftMinerals(ctx, p!, -1);
  },
  populationBoom(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id);
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    addEvent(ctx.state, { kind: "populationBoom", playerId: p!.id, colonyId: c.id, until: ctx.state.turn + range(ctx, N.boomTurns) });
    news(ctx, p!.id, `A population boom is under way at ${c.name}: growth is much faster for a while.`, starOfColony(ctx.state, c));
    return true;
  },
  breakthrough(ctx, p) {
    const tier = p!.research.tierId ? TIERS_BY_ID[p!.research.tierId] : undefined;
    if (!tier) return false;
    p!.research.progress = Math.max(p!.research.progress, researchCost(p!, tier) * RESEARCH.maxCostMult);
    news(ctx, p!.id, `Your scientists report a breakthrough in ${tier.name}; results are expected next turn.`);
    return true;
  },
  diplomaticMarriage(ctx, p) {
    return shiftRelations(ctx, p!, +N.attitudeShift, (q) => `A marriage between the ruling houses of your empire and the ${q.name} warmed relations.`);
  },
  assassination(ctx, p) {
    return shiftRelations(ctx, p!, -N.attitudeShift, (q) => `An envoy of the ${q.name} was assassinated in your capital; relations soured.`);
  },
  comet(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id);
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    const d = difficulty(ctx.state);
    const turns = ctx.rng.int(1, N.cometTurns.die) + N.cometTurns.base - d;
    const hp = (ctx.rng.int(1, N.cometHp.die) + N.cometHp.base + d) * N.cometHp.mult;
    addEvent(ctx.state, {
      kind: "comet", playerId: p!.id, colonyId: c.id, starId: starOfColony(ctx.state, c),
      until: ctx.state.turn + turns, strength: hp,
    });
    news(ctx, p!.id, `A comet will strike ${c.name} in ${turns} turns. Warships in orbit can break it up.`, starOfColony(ctx.state, c));
    return true;
  },
  computerVirus(ctx, p) {
    if (p!.research.progress < N.virus.minStored) return false;
    const lost = Math.min(N.virus.base + ctx.rng.int(1, N.virus.die), Math.floor(p!.research.progress));
    p!.research.progress -= lost;
    news(ctx, p!.id, `A computer virus wiped ${lost} research points from your laboratories.`);
    return true;
  },
  earthquake(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id);
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    const kills = Math.min(range(ctx, N.earthquakeKills), Math.max(0, population(c) - 1));
    removePopulation(c, kills);
    let wrecked = 0;
    for (let i = range(ctx, N.earthquakeBuildings); i > 0 && destructibleBuildings(c).length > 0; i--) {
      const b = ctx.rng.pick(destructibleBuildings(c));
      c.buildings = c.buildings.filter((x) => x !== b);
      wrecked++;
    }
    news(ctx, p!.id, `An earthquake at ${c.name} killed ${kills} population and destroyed ${wrecked} building${wrecked === 1 ? "" : "s"}.`, starOfColony(ctx.state, c));
    return kills + wrecked > 0;
  },
  shipExplosion(ctx, p) {
    const fleets = Object.values(ctx.state.fleets)
      .filter((f) => f.ownerId === p!.id && f.ships.length > 0)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (fleets.length === 0) return false;
    const f = ctx.rng.pick(fleets);
    const s = ctx.rng.pick(f.ships);
    const name = findDesign(p!, s.designId)?.name ?? "ship";
    loseShip(ctx.state, f, s.designId);
    news(ctx, p!.id, `A drive core failure destroyed a ${name} of ${f.name}.`, f.starId ?? undefined);
    return true;
  },
  hyperspaceFlux(ctx) {
    addEvent(ctx.state, { kind: "hyperspaceFlux", until: lastingUntil(ctx.state) });
    newsAll(ctx, `Hyperspace flux: no ship can move until it subsides.`);
    return true;
  },
  industrialAccident(ctx, p) {
    if (hasTrait(getRace(p!.raceId), "tolerant")) return false;
    const list = coloniesOf(ctx.state, p!.id, (c) => {
      const t = ctx.state.planets[c.planetId]!.type;
      return t !== "radiated" && t !== "gasGiant" && t !== "asteroids";
    });
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    ctx.state.planets[c.planetId]!.type = "radiated";
    news(ctx, p!.id, `An industrial accident left ${c.name} radiated.`, starOfColony(ctx.state, c));
    return true;
  },
  mutiny(ctx, p) {
    const fleets = Object.values(ctx.state.fleets)
      .filter((f) => f.ownerId === p!.id && isArmedFleet(ctx.state, f))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (fleets.length === 0) return false;
    const f = ctx.rng.pick(fleets);
    const armed = f.ships.filter((s) => (findDesign(p!, s.designId)?.weapons.length ?? 0) > 0);
    if (armed.length === 0) return false;
    const s = ctx.rng.pick(armed);
    const design = findDesign(p!, s.designId)!;
    const rebelsId = raidersId(ctx.state) ?? monstersId(ctx.state);
    const star = f.starId ? ctx.state.galaxy.stars.find((x) => x.id === f.starId) : undefined;
    loseShip(ctx.state, f, s.designId);
    if (rebelsId !== null && star) {
      const rebels = ctx.state.players[rebelsId]!;
      const id = `mut-${p!.id}-${design.id}`;
      if (!rebels.designs.some((d) => d.id === id)) rebels.designs.push({ ...structuredClone(design), id, name: `Mutineer ${design.name}` });
      spawn(ctx.state, rebelsId, star, [{ designId: id, count: 1 }], "Mutineers");
    }
    news(ctx, p!.id, `The crew of a ${design.name} mutinied and fled with their ship.`, star?.id);
    return true;
  },
  pirates(ctx, p) {
    if (p!.bc < N.pirateMinBc) return false;
    const list = coloniesOf(ctx.state, p!.id);
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    const star = starOfColony(ctx.state, c);
    const loot = Math.floor((p!.bc * (N.pirateLootPercent.base + ctx.rng.int(1, N.pirateLootPercent.die))) / 100);
    p!.bc -= loot;
    addEvent(ctx.state, { kind: "pirates", playerId: p!.id, starId: star, until: lastingUntil(ctx.state) });
    news(ctx, p!.id, `Pirates raided your treasury for ${loot} BC and now operate from the ${c.name} system, choking your trade. Send warships there to root them out.`, star);
    return true;
  },
  plague(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id, (c) => population(c) >= 2 && !activeAt(ctx.state, "plague", c.id));
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    addEvent(ctx.state, {
      kind: "plague", playerId: p!.id, colonyId: c.id, until: ctx.state.turn + N.plagueTimeout,
      strength: range(ctx, N.plagueStrength), progress: 0,
    });
    news(ctx, p!.id, `Plague broke out on ${c.name}. The colony's research is devoted to finding a cure.`, starOfColony(ctx.state, c));
    return true;
  },
  supernova(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id, (c) => starOfColony(ctx.state, c) !== p!.homeStarId);
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    const starId = starOfColony(ctx.state, c);
    if (ctx.state.activeEvents!.some((e) => e.kind === "supernova" && e.starId === starId)) return false;
    const turns = ctx.rng.int(1, N.supernovaTurns.die) + N.supernovaTurns.base - difficulty(ctx.state);
    addEvent(ctx.state, { kind: "supernova", playerId: p!.id, starId, until: ctx.state.turn + turns, strength: range(ctx, N.supernovaStrength), progress: 0 });
    news(ctx, p!.id, `The star of ${c.name} is going nova in ${turns} turns. Its colonies' research is devoted to stopping it.`, starId);
    return true;
  },
  timeSpaceAnomaly(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id);
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    const starId = starOfColony(ctx.state, c);
    addEvent(ctx.state, { kind: "timeSpaceAnomaly", playerId: p!.id, starId, until: lastingUntil(ctx.state) });
    news(ctx, p!.id, `A time-space anomaly engulfed the ${c.name} system: nothing can be built or fought there until it passes.`, starId);
    return true;
  },
  warpBeast(ctx) {
    addEvent(ctx.state, { kind: "warpBeast", until: lastingUntil(ctx.state) });
    newsAll(ctx, `A warp beast hunts in hyperspace; ships in flight are at risk until it leaves.`);
    return true;
  },
  warpFunnel(ctx, p) {
    const list = shipsInTransit(ctx.state, (f) => f.ownerId === p!.id);
    if (list.length === 0) return false;
    const f = ctx.rng.pick(list);
    const turns = range(ctx, N.funnelTurns);
    addEvent(ctx.state, { kind: "warpFunnel", playerId: p!.id, fleetId: f.id, until: ctx.state.turn + turns });
    news(ctx, p!.id, `${f.name} is trapped in a warp funnel for ${turns} turns.`);
    return true;
  },
  unstableWormhole(ctx, p) {
    const list = shipsInTransit(ctx.state, (f) => f.ownerId === p!.id);
    if (list.length === 0) return false;
    const f = ctx.rng.pick(list);
    const stars = ctx.state.galaxy.stars.filter((s) => s.special !== "raiderHome" && s.color !== "blackHole");
    const dest = ctx.rng.pick(stars);
    f.x = dest.x;
    f.y = dest.y;
    f.starId = dest.id;
    f.destStarId = null;
    delete f.invadeTarget;
    explore(ctx, p!.id, dest.id);
    news(ctx, p!.id, `An unstable wormhole flung ${f.name} to ${dest.name}.`, dest.id);
    return true;
  },
  amoeba: (ctx, p) => invasion(ctx, p!, "amoeba"),
  crystal: (ctx, p) => invasion(ctx, p!, "crystal"),
  dragon: (ctx, p) => invasion(ctx, p!, "dragon"),
  eel: (ctx, p) => invasion(ctx, p!, "eel"),
  hydra: (ctx, p) => invasion(ctx, p!, "hydra"),
};

/** Moves a colony's mineral richness by `step`, stopping at the ends of the scale. */
function shiftMinerals(ctx: TurnContext, p: Player, step: number): boolean {
  const last = MINERAL_STEPS.length - 1;
  const list = coloniesOf(ctx.state, p.id, (c) => {
    const i = MINERAL_STEPS.indexOf(ctx.state.planets[c.planetId]!.minerals);
    return step > 0 ? i < last : i > 0;
  });
  if (list.length === 0) return false;
  const c = ctx.rng.pick(list);
  const planet = ctx.state.planets[c.planetId]!;
  const i = MINERAL_STEPS.indexOf(planet.minerals) + step;
  planet.minerals = MINERAL_STEPS[Math.max(0, Math.min(last, i))]!;
  news(ctx, p.id, step > 0 ? `Surveyors found new mineral deposits on ${c.name}.` : `The richest mineral veins of ${c.name} have run out.`, planet.starId);
  return true;
}

function shiftRelations(ctx: TurnContext, p: Player, delta: number, text: (q: Player) => string): boolean {
  const others = p.contacts.map((id) => ctx.state.players[id]!).filter((q) => q.alive && q.kind === "empire");
  if (others.length === 0) return false;
  const q = ctx.rng.pick(others);
  // A random event writes the relation directly (no scaling).
  setRelation(ctx.state, p.id, q.id, attitude(ctx.state, p.id, q.id) + delta);
  news(ctx, p.id, text(q));
  news(ctx, q.id, text(p));
  return true;
}

/** A monster from beyond the rim heads for one of the empire's systems. */
function invasion(ctx: TurnContext, p: Player, kind: keyof typeof ROAMING_MONSTERS): boolean {
  const { state, rng } = ctx;
  const owner = monstersId(state);
  if (owner === null) return false;
  const list = coloniesOf(state, p.id, (c) => starOfColony(state, c) !== p.homeStarId);
  if (list.length === 0) return false;
  const targetId = starOfColony(state, rng.pick(list));
  const target = state.galaxy.stars.find((s) => s.id === targetId)!;
  const m = ROAMING_MONSTERS[kind]!;
  // It enters the galaxy at the rim nearest its target.
  const edges = [
    { x: 0, y: target.y }, { x: state.galaxy.width, y: target.y },
    { x: target.x, y: 0 }, { x: target.x, y: state.galaxy.height },
  ].filter((e) => !blockedByBlackHole(state.galaxy.stars, e, target));
  const entry = (edges.length ? edges : [{ x: 0, y: target.y }]).sort((a, b) => distance(a, target) - distance(b, target))[0]!;
  const f = spawn(state, owner, target, [{ designId: m.designId, count: 1 }], m.name);
  f.x = entry.x;
  f.y = entry.y;
  f.starId = null;
  f.destStarId = target.id;
  f.speed = m.speed;
  const eta = Math.ceil(distance(entry, target) / m.speed);
  addEvent(state, { kind, playerId: p.id, fleetId: f.id, starId: target.id, until: state.turn + eta + m.stay, progress: 0 });
  news(ctx, p.id, `A ${m.name} has entered the galaxy and is heading for ${target.name}.`, target.id);
  return true;
}

function activeAt(state: GameState, kind: string, colonyId: Id): boolean {
  return (state.activeEvents ?? []).some((e) => e.kind === kind && e.colonyId === colonyId);
}

// ---------------------------------------------------------------- lasting events

function tickActive(ctx: TurnContext): void {
  const { state } = ctx;
  for (const ev of [...(state.activeEvents ?? [])]) {
    const done = TICKS[ev.kind]?.(ctx, ev) ?? false;
    const age = state.turn - (ev.until - N.lasting.maxTurns);
    const fades = LASTING.has(ev.kind) && age >= N.lasting.minTurns && ctx.rng.int(1, N.lasting.endDie) === 1;
    if (done || fades || state.turn >= ev.until) {
      if (!done) EXPIRE[ev.kind]?.(ctx, ev);
      endEvent(state, ev);
    }
  }
}

/** Per-turn effects; returning true ends the event early. */
const TICKS: Record<string, (ctx: TurnContext, ev: ActiveEvent) => boolean> = {
  comet(ctx, ev) {
    const c = ctx.state.colonies[ev.colonyId!];
    if (!c || c.ownerId !== ev.playerId) return true;
    ev.strength! -= armedSizeAt(ctx.state, ev.playerId!, ev.starId!) * N.cometDamagePerSize;
    if (ev.strength! > 0) return false;
    news(ctx, ev.playerId!, `Your warships broke up the comet bound for ${c.name}.`, ev.starId);
    return true;
  },
  pirates(ctx, ev) {
    const p = ctx.state.players[ev.playerId!]!;
    if (!p.alive) return true;
    if (armedSizeAt(ctx.state, p.id, ev.starId!) >= N.pirateHunterSize) {
      news(ctx, p.id, `Your warships destroyed the pirate base.`, ev.starId);
      return true;
    }
    return false;
  },
  plague(ctx, ev) {
    const c = ctx.state.colonies[ev.colonyId!];
    if (!c) return true;
    if (ev.progress! >= ev.strength!) {
      news(ctx, c.ownerId, `A cure for the plague on ${c.name} was found.`, starOfColony(ctx.state, c));
      return true;
    }
    // The plague itself works through growth: -200% while it lasts (economy.ts eventGrowthPercent).
    return false;
  },
  supernova(ctx, ev) {
    if (ev.progress! < ev.strength!) return false;
    news(ctx, ev.playerId!, `Your scientists stabilised the star; the supernova was averted.`, ev.starId);
    return true;
  },
  warpBeast(ctx) {
    if (!ctx.rng.chance(N.warpBeastStrike)) return false;
    const list = shipsInTransit(ctx.state, (f) => !lucky(ctx.state.players[f.ownerId]!));
    if (list.length === 0) return false;
    const f = ctx.rng.pick(list);
    const s = ctx.rng.pick(f.ships);
    const owner = ctx.state.players[f.ownerId]!;
    news(ctx, owner.id, `The warp beast devoured a ${findDesign(owner, s.designId)?.name ?? "ship"} of ${f.name}.`);
    loseShip(ctx.state, f, s.designId);
    return false;
  },
  warpFunnel(ctx, ev) {
    return !ctx.state.fleets[ev.fleetId!];
  },
  amoeba: (ctx, ev) => monsterTick(ctx, ev),
  crystal: (ctx, ev) => monsterTick(ctx, ev),
  dragon: (ctx, ev) => monsterTick(ctx, ev),
  eel: (ctx, ev) => monsterTick(ctx, ev),
  hydra: (ctx, ev) => monsterTick(ctx, ev),
};

/** What happens when an event runs its course without being countered. */
const EXPIRE: Record<string, (ctx: TurnContext, ev: ActiveEvent) => void> = {
  comet(ctx, ev) {
    const c = ctx.state.colonies[ev.colonyId!];
    if (!c) return;
    ctx.emit({ kind: "colonyLost", playerId: c.ownerId, colonyId: c.id, to: null, how: "destroyed" });
    news(ctx, c.ownerId, `A comet struck ${c.name} and wiped out the colony.`, ev.starId);
    destroyColony(ctx.state, c);
  },
  supernova(ctx, ev) {
    for (const c of Object.values(ctx.state.colonies)) {
      if (starOfColony(ctx.state, c) !== ev.starId) continue;
      ctx.emit({ kind: "colonyLost", playerId: c.ownerId, colonyId: c.id, to: null, how: "destroyed" });
      destroyColony(ctx.state, c);
    }
    newsAll(ctx, `A supernova scoured the ${ctx.state.galaxy.stars.find((s) => s.id === ev.starId)?.name ?? ""} system of all life.`, ev.starId);
  },
  pirates(ctx, ev) {
    news(ctx, ev.playerId!, `The pirates have moved on.`, ev.starId);
  },
  hyperspaceFlux(ctx) {
    newsAll(ctx, `The hyperspace flux has subsided.`);
  },
  warpBeast(ctx) {
    newsAll(ctx, `The warp beast has left hyperspace.`);
  },
  amoeba: (ctx, ev) => monsterLeaves(ctx, ev),
  crystal: (ctx, ev) => monsterLeaves(ctx, ev),
  dragon: (ctx, ev) => monsterLeaves(ctx, ev),
  eel: (ctx, ev) => monsterLeaves(ctx, ev),
  hydra: (ctx, ev) => monsterLeaves(ctx, ev),
};

function monsterTick(ctx: TurnContext, ev: ActiveEvent): boolean {
  const { state } = ctx;
  const f = state.fleets[ev.fleetId!];
  const m = ROAMING_MONSTERS[ev.kind]!;
  if (!f) {
    newsAll(ctx, `The ${m.name} has been destroyed.`, ev.starId);
    return true;
  }
  if (f.starId !== ev.starId) return false;
  const colonies = Object.values(state.colonies)
    .filter((c) => starOfColony(state, c) === ev.starId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const star = state.galaxy.stars.find((s) => s.id === ev.starId)!;
  const victims = [...new Set(colonies.map((c) => c.ownerId))];
  const tell = (what: string) => {
    for (const v of victims) news(ctx, v, what, star.id);
    if (ev.playerId !== undefined && !victims.includes(ev.playerId)) news(ctx, ev.playerId, what, star.id);
  };
  switch (m.effect) {
    case "engulf":
      if (ev.progress) return false;
      ev.progress = 1;
      for (const c of colonies) {
        const planet = state.planets[c.planetId]!;
        if (planet.type !== "gasGiant" && planet.type !== "asteroids") planet.type = "toxic";
      }
      tell(`The ${m.name} engulfed the ${star.name} system, leaving its worlds toxic.`);
      return false;
    case "killAll":
      if (ev.progress) return false;
      ev.progress = 1;
      for (const c of colonies) {
        if (c.outpost) continue;
        ctx.emit({ kind: "colonyLost", playerId: c.ownerId, colonyId: c.id, to: null, how: "destroyed" });
        destroyColony(state, c);
      }
      tell(`The ${m.name} drained every living thing in the ${star.name} system.`);
      return false;
    case "kill":
      if (ev.progress) return false;
      ev.progress = 1;
      for (const c of colonies) removePopulation(c, Math.floor(population(c) * HYDRA_KILL_SHARE));
      tell(`The ${m.name} ravaged the colonies of ${star.name}.`);
      return false;
    case "blockade":
      if (!ev.progress) {
        ev.progress = 1;
        tell(`The ${m.name} is blockading the ${star.name} system.`);
      }
      return false;
    case "pillage": {
      if (ev.progress === 0) {
        const pop = colonies.reduce((n, c) => n + population(c), 0);
        ev.strength = Math.max(DRAGON_BRIBE_PER_POP, pop * DRAGON_BRIBE_PER_POP);
        ev.progress = 1;
        tell(`The ${m.name} demands ${ev.strength} BC to spare ${star.name}. Pay it this turn or it will pillage the system.`);
        return false;
      }
      if (ev.progress === 1) {
        ev.progress = 2;
        for (const c of colonies) {
          for (let i = 0; i < DRAGON_PILLAGE.buildings && destructibleBuildings(c).length > 0; i++) {
            const b = ctx.rng.pick(destructibleBuildings(c));
            c.buildings = c.buildings.filter((x) => x !== b);
          }
          removePopulation(c, Math.floor(population(c) * DRAGON_PILLAGE.popShare));
        }
        tell(`The ${m.name} pillaged the ${star.name} system.`);
      }
      return false;
    }
  }
  return false;
}

function monsterLeaves(ctx: TurnContext, ev: ActiveEvent): void {
  const f = ctx.state.fleets[ev.fleetId!];
  if (!f) return;
  delete ctx.state.fleets[f.id];
  newsAll(ctx, `The ${ROAMING_MONSTERS[ev.kind]!.name} has left the galaxy.`, f.starId ?? undefined);
}

// ---------------------------------------------------------------- hooks for the turn

/** Why a player cannot pay off a monster event, or null. */
export function bribeProblem(state: GameState, playerId: PlayerId, eventId: Id): string | null {
  const ev = (state.activeEvents ?? []).find((e) => e.id === eventId);
  if (!ev || ROAMING_MONSTERS[ev.kind]?.effect !== "pillage") return "no such monster demand";
  if (ev.progress !== 1) return "the monster is not asking for tribute";
  const owns = Object.values(state.colonies).some((c) => c.ownerId === playerId && starOfColony(state, c) === ev.starId);
  if (!owns) return "you have no colony in that system";
  if (state.players[playerId]!.bc < (ev.strength ?? 0)) return "not enough BC";
  return null;
}

/** Pays the monster to leave. */
export function payBribe(ctx: TurnContext, playerId: PlayerId, eventId: Id): void {
  const { state } = ctx;
  const ev = state.activeEvents!.find((e) => e.id === eventId)!;
  state.players[playerId]!.bc -= ev.strength ?? 0;
  monsterLeaves(ctx, ev);
  endEvent(state, ev);
}

/** Monster demands open to a player this turn. */
export function monsterDemands(state: GameState, playerId: PlayerId): ActiveEvent[] {
  return (state.activeEvents ?? []).filter(
    (e) =>
      ROAMING_MONSTERS[e.kind]?.effect === "pillage" && e.progress === 1 &&
      Object.values(state.colonies).some((c) => c.ownerId === playerId && starOfColony(state, c) === e.starId),
  );
}

/** A time-space anomaly stops building and fighting in a system. */
export function systemFrozen(state: GameState, starId: Id | null | undefined): boolean {
  return !!starId && (state.activeEvents ?? []).some((e) => e.kind === "timeSpaceAnomaly" && e.starId === starId);
}

/** Pirates are choking an empire's trade. */
export function piratesActive(state: GameState, playerId: PlayerId): boolean {
  return (state.activeEvents ?? []).some((e) => e.kind === "pirates" && e.playerId === playerId);
}

/**
 * A plague or a threatened supernova claims a colony's research. Returns the
 * points left over for the empire.
 */
export function absorbResearch(state: GameState, colony: Colony, points: number): number {
  const star = starOfColony(state, colony);
  const ev = (state.activeEvents ?? []).find(
    (e) => (e.kind === "plague" && e.colonyId === colony.id) || (e.kind === "supernova" && e.starId === star && e.playerId === colony.ownerId),
  );
  if (!ev) return points;
  ev.progress = (ev.progress ?? 0) + points;
  return 0;
}
