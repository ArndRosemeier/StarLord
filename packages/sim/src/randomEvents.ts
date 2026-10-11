import { EVENTS, EVENT_NUMBERS as N, EVENT_START, EVENT_TIMING, type EventId } from "./data/events.js";
import { DIFFICULTY_ORDER, MINERAL_STEPS } from "./data/galaxy.js";
import { DRAGON_BRIBE_PER_POP, DRAGON_PILLAGE, HYDRA_KILL_SHARE, ROAMING_MONSTERS } from "./data/monsters.js";
import { getRace, hasTrait } from "./data/races.js";
import { ARMORS, WEAPONS, hullIndex } from "./data/components.js";
import { TECHS, TIERS_BY_ID, TIER_OF_TECH, XENON_TECHS } from "./data/techs.js";
import { newId, type TurnContext } from "./context.js";
import { findDesign } from "./designs.js";
import { relation } from "./diplomacy.js";
import { REASON, relationEvent } from "./relations.js";
import { colonyOutput, destructibleBuildings, population, systemFrozen } from "./economy.js";

import { grantTech } from "./empire.js";
import { blockedByBlackHole, distance } from "./galaxy.js";
import { removeShips } from "./fleetOps.js";
import { destroyColony, isArmedFleet } from "./ground.js";
import { removePopulation } from "./jobs.js";
import { monstersId, raidersId, spawn } from "./npc.js";
import { explore } from "./specials.js";
import { completeResearch } from "./turn.js";
import type { ActiveEvent, Colony, Fleet, GameState, Id, Player, PlayerId } from "./types.js";

/**
 * Random events after the original's Galactic News: windfalls, disasters
 * with a counter (a comet's hit points, the pirates' strength, the research a
 * plague or supernova needs), galaxy-wide hyperspace trouble and monsters
 * invading from beyond the rim. Timing, picking, victims and sizes follow the
 * original program: the chance grows with every quiet turn, every kind of
 * event is equally likely and happens at most once a game, disasters hit the
 * biggest empires and windfalls the smallest, and lucky empires are spared
 * disasters and get extra windfalls. The whole system can be switched off in
 * the game settings.
 */
export function randomEventTick(ctx: TurnContext): void {
  const { state, rng } = ctx;
  state.activeEvents ??= [];
  const clock = (state.eventClock ??= { last: 0, luck: {} });
  tickActive(ctx);
  const on = state.settings.randomEvents !== false;
  // A lucky empire's windfall takes the place of this turn's ordinary roll.
  const forced = luckyRoll(ctx, on);
  const d = difficulty(state);
  if (!forced) {
    if (!on || state.turn < EVENT_START || state.turn - clock.last <= EVENT_TIMING.cooldown) return;
    const quiet = Math.floor(((state.turn - clock.last) * (d + 1)) / (d + 2));
    if (rng.int(1, EVENT_TIMING.dieSides) > quiet) return;
  }
  const ids = Object.keys(EVENTS) as EventId[];
  for (let i = 0; i < EVENT_TIMING.tries; i++) {
    const kind = ids[rng.int(0, ids.length - 1)]!;
    // On Tutor, drawing a disaster ends the search for this turn.
    if (d === 0 && EVENTS[kind].mood === "bad") return;
    if (strike(ctx, kind, forced ?? undefined)) {
      clock.last = state.turn;
      (clock.used ??= []).push(kind);
      return;
    }
  }
}

/** Fires one event at a chosen empire (or the galaxy), skipping the dice; false if it can't happen now. */
export function fireEvent(ctx: TurnContext, kind: EventId, victim?: Player): boolean {
  ctx.state.activeEvents ??= [];
  return EVENTS[kind].global ? HANDLERS[kind](ctx, null) : HANDLERS[kind](ctx, victim ?? null);
}

/** Tries one event; false if it can't happen now. A forced (lucky) empire only takes windfalls. */
function strike(ctx: TurnContext, kind: EventId, forced?: Player): boolean {
  const { state } = ctx;
  const def = EVENTS[kind];
  const flux = (state.activeEvents ?? []).some((e) => e.kind === "hyperspaceFlux");
  if (def.disabled || (state.eventClock?.used ?? []).includes(kind)) return false;
  if (forced && def.mood !== "good") return false;
  if (def.monster && !(state.settings.monsters && monstersId(state) !== null)) return false;
  if (def.fromTurn !== undefined && state.turn < def.fromTurn) return false;
  if (def.needsFlux && !flux) return false;
  if (def.fluxBefore !== undefined && state.turn < def.fluxBefore && !flux) return false;
  if (def.global) return HANDLERS[kind](ctx, null);
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

/**
 * Lucky empires build up to a windfall of their own: each turn every lucky
 * empire's count grows by one, and the first whose rnd(luckDie) comes in at or
 * under count / k gets a windfall this turn (from turn EVENT_START on; the
 * count starts over either way).
 */
function luckyRoll(ctx: TurnContext, eventsOn: boolean): Player | null {
  const { state, rng } = ctx;
  const clock = state.eventClock!;
  const k = EVENT_TIMING.luckDivisor;
  const div = eventsOn ? (state.settings.raiders ? k.eventsAndRaiders : k.events) : state.settings.raiders ? k.noEventsWithRaiders : k.noEvents;
  const luckies = state.players.filter((p) => p.kind === "empire" && p.alive && lucky(p));
  for (const p of luckies) clock.luck[p.id] = (clock.luck[p.id] ?? 0) + 1;
  for (const p of luckies) {
    if (rng.int(1, EVENT_TIMING.luckDie) > Math.floor(clock.luck[p.id]! / div)) continue;
    clock.luck[p.id] = 0;
    return state.turn >= EVENT_START ? p : null;
  }
  return null;
}

function difficulty(state: GameState): number {
  return DIFFICULTY_ORDER.indexOf(state.settings.difficulty ?? "average");
}

/** Last turn of a lasting event started now; it may end sooner (see tickActive). */
function lastingUntil(state: GameState): number {
  return state.turn + N.lasting.maxTurns;
}

const LASTING = new Set(["hyperspaceFlux", "timeSpaceAnomaly", "warpBeast", "populationBoom"]);

/** An event that never ends by itself (plague, pirates): it lasts until it is beaten. */
const UNTIL_BEATEN = Number.MAX_SAFE_INTEGER;

function lucky(p: Player): boolean {
  return hasTrait(getRace(p.raceId), "lucky");
}

/** rnd(a) + rnd(b) + …, each die from 1 up. */
function dice(ctx: TurnContext, sides: number[]): number {
  return sides.reduce((n, d) => n + ctx.rng.int(1, d), 0);
}

function coloniesOf(state: GameState, playerId: PlayerId, filter: (c: Colony) => boolean = () => true): Colony[] {
  return Object.values(state.colonies)
    .filter((c) => c.ownerId === playerId && !c.outpost && filter(c))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function coloniesAtStar(state: GameState, starId: Id, filter: (c: Colony) => boolean = () => true): Colony[] {
  return Object.values(state.colonies)
    .filter((c) => starOfColony(state, c) === starId && filter(c))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function starOfColony(state: GameState, c: Colony): Id {
  return state.planets[c.planetId]!.starId;
}

function starName(state: GameState, starId: Id): string {
  return state.galaxy.stars.find((s) => s.id === starId)?.name ?? "";
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

/** A ship's hull size as the original counts it: frigate 1 … doom star 6. */
function hullPoints(state: GameState, f: Fleet, designId: string): number {
  const d = findDesign(state.players[f.ownerId]!, designId);
  return d ? hullIndex(d.hull) + 1 : 1;
}

/** Hull sizes of every ship in orbit at a star, whoever owns it: what wears down a comet or a pirate base. */
function hullPointsAt(state: GameState, starId: Id): number {
  let total = 0;
  for (const f of Object.values(state.fleets)) {
    if (f.starId !== starId) continue;
    for (const s of f.ships) total += hullPoints(state, f, s.designId) * s.count;
  }
  return total;
}

/** Hull sizes of all of an empire's ships. */
function fleetHullPoints(state: GameState, playerId: PlayerId): number {
  let total = 0;
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId !== playerId) continue;
    for (const s of f.ships) total += hullPoints(state, f, s.designId) * s.count;
  }
  return total;
}

/** Picks one ship of the given fleets, each ship equally likely. */
function pickShip(ctx: TurnContext, fleets: Fleet[]): { f: Fleet; designId: string } | null {
  const total = fleets.reduce((n, f) => n + f.ships.reduce((m, s) => m + s.count, 0), 0);
  if (total === 0) return null;
  let roll = ctx.rng.int(1, total);
  for (const f of fleets) {
    for (const s of f.ships) {
      roll -= s.count;
      if (roll <= 0) return { f, designId: s.designId };
    }
  }
  return null;
}

/** Kills one ship of a fleet; an officer aboard the fleet's last ship dies with it. */
function loseShip(state: GameState, f: Fleet, designId: string): void {
  const total = f.ships.reduce((n, s) => n + s.count, 0);
  if (total <= 1) {
    for (const l of Object.values(state.leaders)) if (l.assignedTo === f.id) delete state.leaders[l.id];
  }
  removeShips(state, f, designId, 1);
}

/** Whether a colony is already caught in an event (comet, plague, boom, or one on its star). */
function colonyBusy(state: GameState, c: Colony): boolean {
  const star = starOfColony(state, c);
  return (state.activeEvents ?? []).some((e) => e.colonyId === c.id || (!e.colonyId && e.starId === star && STAR_EVENTS.has(e.kind)));
}

/** Whether a star already has an event on it or on one of its colonies. */
function starBusy(state: GameState, starId: Id): boolean {
  return (state.activeEvents ?? []).some((e) => {
    if (e.colonyId) {
      const c = state.colonies[e.colonyId];
      return !!c && starOfColony(state, c) === starId && COLONY_EVENTS.has(e.kind);
    }
    return e.starId === starId && STAR_EVENTS.has(e.kind);
  });
}

const COLONY_EVENTS = new Set(["comet", "plague", "populationBoom"]);
const STAR_EVENTS = new Set(["pirates", "supernova", "timeSpaceAnomaly"]);

/** A random system where the empire has a colony (not an outpost), or null. */
function randomColonySystem(ctx: TurnContext, p: Player): Id | null {
  const list = coloniesOf(ctx.state, p.id);
  return list.length ? starOfColony(ctx.state, ctx.rng.pick(list)) : null;
}

/**
 * Lands `hits` on a colony, each on a random building that can be destroyed
 * or a random colonist, and kills `deaths` colonists outright. The last
 * colonist is only struck once nothing else is left, and then survives (the
 * original first knocks back a part-grown colonist; we spare it).
 */
function strikeColony(ctx: TurnContext, c: Colony, hits: number, deaths = 0): { killed: number; wrecked: number } {
  let killed = 0;
  let wrecked = 0;
  for (let i = 0; i < deaths && population(c) > 1; i++) killed += removePopulation(c, 1);
  for (let i = 0; i < hits; i++) {
    const buildings = destructibleBuildings(c);
    const pop = population(c) > 1 ? population(c) : 0;
    if (buildings.length + pop === 0) break;
    const roll = ctx.rng.int(1, buildings.length + pop);
    if (roll <= buildings.length) {
      const b = buildings[roll - 1]!;
      c.buildings = c.buildings.filter((x) => x !== b);
      wrecked++;
    } else killed += removePopulation(c, 1);
  }
  return { killed, wrecked };
}

/** (dice) × (buildings + population) / 10 hits, at least one. */
function impactHits(ctx: TurnContext, c: Colony, sides: number[]): number {
  return Math.max(1, Math.floor((dice(ctx, sides) * (c.buildings.length + population(c))) / 10));
}

type Handler = (ctx: TurnContext, p: Player | null) => boolean;

const HANDLERS: Record<EventId, Handler> = {
  derelict(ctx, p) {
    const found = derelictFinds(ctx.state, p!);
    if (found.length === 0) return false;
    for (const tech of found) {
      grantTech(p!, tech);
      ctx.emit({ kind: "techLearned", playerId: p!.id, techId: tech, tierId: TIER_OF_TECH[tech]?.id ?? "", source: "event" });
    }
    news(ctx, p!.id, `Scientists studied an ancient derelict ship and learned ${found.map(techName).join(" and ")}.`);
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
    if (population(c) >= colonyOutput(ctx.state, c).maxPopulation || colonyBusy(ctx.state, c)) return false;
    addEvent(ctx.state, { kind: "populationBoom", playerId: p!.id, colonyId: c.id, until: lastingUntil(ctx.state) });
    news(ctx, p!.id, `A population boom is under way at ${c.name}: growth is much faster for a while.`, starOfColony(ctx.state, c));
    return true;
  },
  breakthrough(ctx, p) {
    const tier = p!.research.tierId ? TIERS_BY_ID[p!.research.tierId] : undefined;
    if (!tier) return false;
    news(ctx, p!.id, `Your scientists made a breakthrough in ${tier.name}.`);
    completeResearch(ctx, p!.id);
    return true;
  },
  diplomaticMarriage(ctx, p) {
    return shiftRelations(ctx, p!, +N.relationShift, (q) => `A marriage between the ruling houses of your empire and the ${q.name} warmed relations.`);
  },
  assassination(ctx, p) {
    return shiftRelations(ctx, p!, -N.relationShift, (q) => `A diplomat of one empire was caught plotting to assassinate an official of the other (you and the ${q.name}); relations soured.`);
  },
  comet(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id);
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    if (colonyBusy(ctx.state, c)) return false;
    const d = difficulty(ctx.state);
    const hp = (ctx.rng.int(1, N.cometHp.die) + N.cometHp.base + d) * N.cometHp.mult;
    const turns = ctx.rng.int(1, N.cometTurns.die) + N.cometTurns.base - d;
    addEvent(ctx.state, {
      kind: "comet", playerId: p!.id, colonyId: c.id, starId: starOfColony(ctx.state, c),
      until: ctx.state.turn + turns, strength: hp,
    });
    news(ctx, p!.id, `A comet with ${hp} hit points will strike ${c.name} in ${turns} turns. Every ship in orbit there wears it down by its hull size each turn.`, starOfColony(ctx.state, c));
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
    const { killed, wrecked } = strikeColony(ctx, c, impactHits(ctx, c, N.earthquake.dice));
    if (killed + wrecked === 0) return false;
    news(ctx, p!.id, `An earthquake at ${c.name} killed ${killed} population and destroyed ${wrecked} building${wrecked === 1 ? "" : "s"}.`, starOfColony(ctx.state, c));
    return true;
  },
  shipExplosion(ctx, p) {
    const fleets = Object.values(ctx.state.fleets)
      .filter((f) => f.ownerId === p!.id && f.ships.length > 0)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const hit = pickShip(ctx, fleets);
    if (!hit) return false;
    const name = findDesign(p!, hit.designId)?.name ?? "ship";
    loseShip(ctx.state, hit.f, hit.designId);
    news(ctx, p!.id, `A ${name} of ${hit.f.name} mysteriously exploded.`, hit.f.starId ?? undefined);
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
      return t !== "radiated" && t !== "toxic";
    });
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    const deaths = Math.floor((dice(ctx, N.industrialAccident.dice) * population(c)) / 10);
    const { killed, wrecked } = strikeColony(ctx, c, N.industrialAccident.hits, deaths);
    const lost = wrecked ? ` and ${wrecked} building${wrecked === 1 ? "" : "s"}` : "";
    news(ctx, p!.id, `An industrial accident on ${c.name} killed ${killed} population${lost}.`, starOfColony(ctx.state, c));
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
    const { state } = ctx;
    if ((p!.freighters ?? 0) < N.pirates.minFreighters) return false;
    const star = randomColonySystem(ctx, p!);
    if (!star || starBusy(state, star)) return false;
    const strength = pirateStrength(state, star);
    if (strength <= 0) return false;
    addEvent(state, { kind: "pirates", playerId: p!.id, starId: star, until: UNTIL_BEATEN, strength, progress: strength });
    news(ctx, p!.id, `Pirates operating in the ${starName(state, star)} system have begun to prey on freighters and choke trade. Every ship in orbit there wears their base down by its hull size each turn.`, star);
    return true;
  },
  pirateRaid(ctx, p) {
    if (p!.bc < N.pirateMinBc) return false;
    const star = randomColonySystem(ctx, p!);
    if (!star) return false;
    const loot = Math.floor((p!.bc * (N.pirateLootPercent.base + ctx.rng.int(1, N.pirateLootPercent.die))) / 100);
    p!.bc = Math.max(0, p!.bc - loot);
    news(ctx, p!.id, `A pirate raid in the ${starName(ctx.state, star)} system stole ${loot} BC from your treasury.`, star);
    return true;
  },
  plague(ctx, p) {
    const list = coloniesOf(ctx.state, p!.id);
    if (list.length === 0) return false;
    const c = ctx.rng.pick(list);
    if (colonyBusy(ctx.state, c)) return false;
    const research = Math.floor(colonyOutput(ctx.state, c).research);
    const strength = research * (ctx.rng.int(1, N.plague.die) + N.plague.perDifficulty * difficulty(ctx.state));
    if (strength < 1) return false;
    addEvent(ctx.state, { kind: "plague", playerId: p!.id, colonyId: c.id, until: UNTIL_BEATEN, strength, progress: 0 });
    news(ctx, p!.id, `Plague broke out on ${c.name}. The colony's research (${strength} points) is devoted to finding a cure.`, starOfColony(ctx.state, c));
    return true;
  },
  supernova(ctx) {
    const { state } = ctx;
    const stars = state.galaxy.stars.filter((s) => coloniesAtStar(state, s.id, (c) => !c.outpost).length > 0);
    if (stars.length === 0) return false;
    const star = ctx.rng.pick(stars);
    if (starBusy(state, star.id)) return false;
    const turns = ctx.rng.int(1, N.supernovaTurns.die) + N.supernovaTurns.base - difficulty(state);
    const research = coloniesAtStar(state, star.id).reduce((n, c) => n + Math.floor(colonyOutput(state, c).research), 0);
    addEvent(state, { kind: "supernova", starId: star.id, until: state.turn + turns, strength: research * turns, progress: 0 });
    newsAll(ctx, `The star of the ${star.name} system will go supernova in ${turns} turns unless its colonies' research (${research * turns} points) finds a solution.`, star.id);
    return true;
  },
  timeSpaceAnomaly(ctx, p) {
    const star = randomColonySystem(ctx, p!);
    if (!star || starBusy(ctx.state, star)) return false;
    addEvent(ctx.state, { kind: "timeSpaceAnomaly", playerId: p!.id, starId: star, until: lastingUntil(ctx.state) });
    news(ctx, p!.id, `A time-space anomaly engulfed the ${starName(ctx.state, star)} system: its colonies stand still (no food, industry, research, income, upkeep or growth) and nobody can fight there until it passes.`, star);
    return true;
  },
  warpBeast(ctx, p) {
    const has = Object.values(ctx.state.fleets).some((f) => f.ownerId === p!.id && f.ships.length > 0);
    if (!has) return false;
    addEvent(ctx.state, { kind: "warpBeast", playerId: p!.id, until: lastingUntil(ctx.state) });
    newsAll(ctx, `A beast that lives partly in hyperspace has appeared; it will destroy ships in flight until it leaves.`);
    return true;
  },
  warpFunnel(ctx, p) {
    // The original picks a ship, uses up the event and does nothing more.
    return Object.values(ctx.state.fleets).some((f) => f.ownerId === p!.id && f.ships.length > 0);
  },
  unstableWormhole(ctx, p) {
    const list = shipsInTransit(ctx.state, (f) => f.ownerId === p!.id && !!f.destStarId);
    if (list.length === 0) return false;
    const f = ctx.rng.pick(list);
    const dest = ctx.state.galaxy.stars.find((s) => s.id === f.destStarId)!;
    f.x = dest.x;
    f.y = dest.y;
    f.starId = dest.id;
    f.destStarId = null;
    explore(ctx, p!.id, dest.id);
    news(ctx, p!.id, `An unstable wormhole appeared in the path of ${f.name} and carried it to ${dest.name} at once.`, dest.id);
    return true;
  },
  amoeba: (ctx, p) => invasion(ctx, p!, "amoeba"),
  crystal: (ctx, p) => invasion(ctx, p!, "crystal"),
  dragon: (ctx, p) => invasion(ctx, p!, "dragon"),
  eel: (ctx, p) => invasion(ctx, p!, "eel"),
  hydra: (ctx, p) => invasion(ctx, p!, "hydra"),
};

/**
 * What a derelict ship teaches: the beam weapon closest at or above the
 * strongest beam (by top damage) any empire has, if the empire lacks it, and
 * the best armor any empire has, if it lacks that. Xenon weapons aren't found.
 */
export function derelictFinds(state: GameState, p: Player): string[] {
  const all = state.players.filter((q) => q.kind === "empire");
  const known = (tech: string) => all.some((q) => q.techs.includes(tech));
  const beams = WEAPONS.filter((w) => w.kind === "beam");
  let best = beams.find((w) => w.id === N.derelict.defaultBeam)!;
  for (const w of beams) if (known(w.requires) && w.damageMax > best.damageMax) best = w;
  const found: string[] = [];
  let reach = Infinity;
  let pick: string | null = null;
  for (const w of beams) {
    const step = w.damageMax - best.damageMax;
    if (step < 0 || step > reach || step > N.derelict.beamReach || XENON_TECHS.includes(w.requires) || p.techs.includes(w.requires)) continue;
    pick = w.requires;
    reach = w === best ? 1 : step;
  }
  if (pick) found.push(pick);
  const armors = ARMORS.filter((a) => !XENON_TECHS.includes(a.requires));
  const armor = [...armors].reverse().find((a) => known(a.requires));
  if (armor && !p.techs.includes(armor.requires)) found.push(armor.requires);
  return found;
}

/** Moves a colony's mineral richness: deposits raise any but the richest; depletion strikes only ultra rich worlds. */
function shiftMinerals(ctx: TurnContext, p: Player, step: number): boolean {
  const last = MINERAL_STEPS.length - 1;
  const list = coloniesOf(ctx.state, p.id, (c) => {
    const i = MINERAL_STEPS.indexOf(ctx.state.planets[c.planetId]!.minerals);
    return step > 0 ? i < last : i === last;
  });
  if (list.length === 0) return false;
  const c = ctx.rng.pick(list);
  const planet = ctx.state.planets[c.planetId]!;
  const i = MINERAL_STEPS.indexOf(planet.minerals) + step;
  planet.minerals = MINERAL_STEPS[Math.max(0, Math.min(last, i))]!;
  news(ctx, p.id, step > 0 ? `Surveyors found new mineral deposits on ${c.name}.` : `The richest mineral veins of ${c.name} have run out.`, planet.starId);
  return true;
}

/**
 * Assassination and diplomatic marriage: a relation event with one random
 * empire in contact. If that one is at war with us, nothing happens. The
 * other empire's view of us moves (a human's own feelings never do).
 */
function shiftRelations(ctx: TurnContext, p: Player, delta: number, text: (q: Player) => string): boolean {
  const others = p.contacts.map((id) => ctx.state.players[id]!).filter((q) => q.alive && q.kind === "empire" && q.id !== p.id);
  if (others.length === 0) return false;
  const q = ctx.rng.pick(others);
  if (relation(ctx.state, p.id, q.id).status === "war") return false;
  relationEvent(ctx.state, delta, p.id, q.id, REASON.general);
  news(ctx, p.id, text(q));
  news(ctx, q.id, text(p));
  return true;
}

/** Strength of a pirate base at a star: the fleets of every empire with a colony there, scaled by difficulty. */
function pirateStrength(state: GameState, starId: Id): number {
  const owners = new Set(coloniesAtStar(state, starId).map((c) => c.ownerId));
  let sum = 0;
  for (const id of owners) if (state.players[id]?.kind === "empire") sum += fleetHullPoints(state, id);
  const s = Math.floor(sum * N.pirates.difficultyShare[difficulty(state)]!);
  return s < N.pirates.minStrength ? 0 : s;
}

/** A monster from beyond the rim heads for one of the empire's systems. */
function invasion(ctx: TurnContext, p: Player, kind: keyof typeof ROAMING_MONSTERS): boolean {
  const { state, rng } = ctx;
  const owner = monstersId(state);
  if (owner === null) return false;
  // Any of the empire's colonies (not outposts), the homeworld included, as in the original.
  const list = coloniesOf(state, p.id);
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

// ---------------------------------------------------------------- lasting events

/**
 * Runs the events in play. A lasting event first rolls whether it ends (1 in
 * 20 once it is old enough, always at its last turn); one that goes on, and
 * every other event, then has its turn.
 */
function tickActive(ctx: TurnContext): void {
  const { state } = ctx;
  for (const ev of [...(state.activeEvents ?? [])]) {
    if (LASTING.has(ev.kind)) {
      const age = state.turn - (ev.until - N.lasting.maxTurns);
      const fades = age >= N.lasting.minTurns && ctx.rng.int(1, N.lasting.endDie) === 1;
      if (fades || state.turn >= ev.until) {
        EXPIRE[ev.kind]?.(ctx, ev);
        endEvent(state, ev);
        continue;
      }
    }
    const done = TICKS[ev.kind]?.(ctx, ev) ?? false;
    if (done || state.turn >= ev.until) {
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
    ev.strength! -= hullPointsAt(ctx.state, ev.starId!);
    if (ev.strength! > 0) return false;
    news(ctx, ev.playerId!, `The ships in orbit at ${c.name} broke up the comet bound for it.`, ev.starId);
    return true;
  },
  pirates(ctx, ev) {
    const { state } = ctx;
    const owners = [...new Set(coloniesAtStar(state, ev.starId!).map((c) => c.ownerId))];
    if (owners.length === 0) return true;
    // The stronger the base still is, the likelier it takes a freighter from every empire in the system.
    if (ctx.rng.int(1, 100) <= Math.floor((ev.strength! * 100) / ev.progress!)) {
      for (const id of owners) {
        const p = state.players[id];
        if (p && (p.freighters ?? 0) > 0) p.freighters = p.freighters! - 1;
      }
    }
    ev.strength! -= hullPointsAt(state, ev.starId!);
    if (ev.strength! >= 1) return false;
    for (const id of owners) news(ctx, id, `The pirates preying on freighters in the ${starName(state, ev.starId!)} system have been wiped out.`, ev.starId);
    return true;
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
    newsAll(ctx, `Scientists in the ${starName(ctx.state, ev.starId!)} system stabilised their star; the supernova was averted.`, ev.starId);
    return true;
  },
  warpBeast(ctx, ev) {
    // It destroys one ship in flight of its current victim, then turns on another empire.
    const victim = ev.playerId !== undefined ? ctx.state.players[ev.playerId] : undefined;
    if (victim) {
      const hit = pickShip(ctx, shipsInTransit(ctx.state, (f) => f.ownerId === victim.id));
      if (hit) {
        news(ctx, victim.id, `The hyperspace beast destroyed a ${findDesign(victim, hit.designId)?.name ?? "ship"} of ${hit.f.name}.`);
        loseShip(ctx.state, hit.f, hit.designId);
      }
    }
    // Chosen like any disaster's victim, so never the empire it just struck (that one counts as suffering).
    const next = eventTarget(ctx, false);
    if (next && !lucky(next)) ev.playerId = next.id;
    else delete ev.playerId;
    return false;
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
    const { killed, wrecked } = strikeColony(ctx, c, impactHits(ctx, c, N.cometImpact.dice));
    news(ctx, c.ownerId, `A comet struck ${c.name}, killing ${killed} population and destroying ${wrecked} building${wrecked === 1 ? "" : "s"}.`, ev.starId);
  },
  supernova(ctx, ev) {
    const { state } = ctx;
    for (const c of coloniesAtStar(state, ev.starId!)) {
      ctx.emit({ kind: "colonyLost", playerId: c.ownerId, colonyId: c.id, to: null, how: "destroyed" });
      destroyColony(state, c);
    }
    for (const planet of Object.values(state.planets)) {
      if (planet.starId === ev.starId && planet.type !== "gasGiant" && planet.type !== "asteroids") planet.type = "radiated";
    }
    newsAll(ctx, `The star of the ${starName(state, ev.starId!)} system went supernova, destroying its colonies and leaving its worlds radiated.`, ev.starId);
  },
  timeSpaceAnomaly(ctx, ev) {
    news(ctx, ev.playerId!, `The time-space anomaly over the ${starName(ctx.state, ev.starId!)} system has ended.`, ev.starId);
  },
  populationBoom(ctx, ev) {
    const c = ctx.state.colonies[ev.colonyId!];
    if (c) news(ctx, c.ownerId, `The population boom on ${c.name} has ended.`, starOfColony(ctx.state, c));
  },
  hyperspaceFlux(ctx) {
    newsAll(ctx, `The hyperspace flux has subsided.`);
  },
  warpBeast(ctx) {
    newsAll(ctx, `The hyperspace beast has gone; fleets may travel without fear again.`);
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

export { systemFrozen };

/** Pirates prey on an empire: it has a colony in their system. */
export function piratesActive(state: GameState, playerId: PlayerId): boolean {
  return (state.activeEvents ?? []).some(
    (e) => e.kind === "pirates" && Object.values(state.colonies).some((c) => c.ownerId === playerId && starOfColony(state, c) === e.starId),
  );
}

/**
 * A plague or a threatened supernova claims a colony's research. Returns the
 * points left over for the empire.
 */
export function absorbResearch(state: GameState, colony: Colony, points: number): number {
  const star = starOfColony(state, colony);
  const ev = (state.activeEvents ?? []).find(
    (e) => (e.kind === "plague" && e.colonyId === colony.id) || (e.kind === "supernova" && e.starId === star),
  );
  if (!ev) return points;
  ev.progress = (ev.progress ?? 0) + points;
  return 0;
}
