import {
  DISHONORED, JEALOUSY, NO_WAR_MULT, PEACE_ANSWER, RACE_RELATIONS, RELATION, RELATION_EVENTS, STRIKES, TEMPERAMENTS, TREATY_WARMTH, type Temperament,
} from "./data/diplomacy.js";
import { DIFFICULTY_ORDER } from "./data/galaxy.js";
import { RACES, getRace, hasTrait } from "./data/races.js";
import { hullIndex, type HullId } from "./data/components.js";
import type { Emit } from "./context.js";
import { designStats, findDesign } from "./designs.js";
import { empires } from "./empire.js";
import { population } from "./economy.js";
import type { GameState, PlayerId } from "./types.js";
import type { Rng } from "./rng.js";
import { attitude, breakAllTreaties, declareWar, demandCovetedSystem, fixedRoll, offerCompensation, relation, temperament } from "./diplomacy.js";

/**
 * The relation model, after the original: one value per pair of empires
 * (-100..100, the same on both sides), a baseline it drifts back to, events
 * that move it through one scaling function, what treaties add every turn,
 * jealousy, and the strikes a computer ruler counts against a human before it
 * breaks treaties or goes to war. Numbers live in data/diplomacy.ts.
 */

/** A die: a number from 1 to n. */
export type Roll = (n: number) => number;

export const rngRoll = (rng: Rng): Roll => (n) => rng.int(1, Math.max(1, Math.floor(n)));

/** A die fixed by the game seed and a key, for rules that run inside commands (answers must not depend on order). */
export function keyedRoll(state: GameState, key: string): Roll {
  let i = 0;
  return (n) => fixedRoll(state, `${key}|${i++}`, Math.max(1, Math.floor(n)));
}

/** Why a relation changed, after the original's reason ids (they decide strikes and thanks). */
export const REASON = {
  general: 0,
  stole: 1,
  framedSteal: 2,
  sabotage: 3,
  framedSabotage: 4,
  threat: 5,
  destruction: 6,
  envy: 8,
  councilAgainst: 9,
  trade: 12,
  research: 13,
  tribute: 14,
  joinedWar: 15,
  councilFor: 16,
} as const;

/** Difficulty as the original's index: Tutor 0 .. Impossible 4. */
export function difficultyLevel(state: GameState): number {
  return DIFFICULTY_ORDER.indexOf(state.settings.difficulty ?? "average");
}

/** Galaxy size as the original's index: small 0 .. huge 3. */
export function galaxySizeLevel(state: GameState): number {
  return Math.max(0, ["small", "medium", "large", "huge"].indexOf(state.settings.galaxySize));
}

/** Row of the race table: a premade race's place in RACES, a custom race's by its appearance; -1 for none. */
export function raceRow(raceId: string): number {
  const i = RACES.findIndex((r) => r.id === raceId);
  if (i >= 0) return i;
  try {
    const key = getRace(raceId).assetKey;
    return RACES.findIndex((r) => r.assetKey === key);
  } catch {
    return -1;
  }
}

/** How a's race regards b's at the start (the race table). */
export function raceRelation(state: GameState, a: PlayerId, b: PlayerId): number {
  const ra = raceRow(state.players[a]!.raceId);
  const rb = raceRow(state.players[b]!.raceId);
  return ra < 0 || rb < 0 ? 0 : RACE_RELATIONS[ra]?.[rb] ?? 0;
}

const pairGet = (m: Record<string, Record<string, number>> | undefined, a: PlayerId, b: PlayerId) => m?.[a]?.[b];
function pairSet(state: GameState, field: "baseline" | "noWar" | "strikes" | "shipLosses", a: PlayerId, b: PlayerId, v: number): void {
  const m = (state[field] ??= {});
  (m[a] ??= {})[b] = v;
}

/** The relation a's view drifts back toward. */
export function baselineOf(state: GameState, a: PlayerId, b: PlayerId): number {
  return pairGet(state.baseline, a, b) ?? raceRelation(state, a, b);
}

export function setBaseline(state: GameState, a: PlayerId, b: PlayerId, v: number): void {
  pairSet(state, "baseline", a, b, clampRel(v));
}

/** Turns computer empire a will not declare war on b. */
export function noWarTurns(state: GameState, a: PlayerId, b: PlayerId): number {
  return pairGet(state.noWar, a, b) ?? 0;
}

export function addNoWar(state: GameState, a: PlayerId, b: PlayerId, turns: number): void {
  pairSet(state, "noWar", a, b, Math.max(0, noWarTurns(state, a, b) + Math.floor(turns)));
}

export function setNoWar(state: GameState, a: PlayerId, b: PlayerId, turns: number): void {
  pairSet(state, "noWar", a, b, Math.max(0, Math.floor(turns)));
}

/** Warnings computer empire a holds against b. */
export function strikesOf(state: GameState, a: PlayerId, b: PlayerId): number {
  return pairGet(state.strikes, a, b) ?? 0;
}

export function setStrikes(state: GameState, a: PlayerId, b: PlayerId, n: number): void {
  pairSet(state, "strikes", a, b, Math.max(0, n));
}

/** What a lost to b's ships in the current war. */
export function shipLossesOf(state: GameState, a: PlayerId, b: PlayerId): number {
  return pairGet(state.shipLosses, a, b) ?? 0;
}

/** Records ships a lost to b in battle: 2 to the power of (hull size + 1) each, frigate 0 .. doom star 5. */
export function recordShipLosses(state: GameState, a: PlayerId, b: PlayerId, lost: { hull: HullId; count: number }[]): void {
  let n = 0;
  for (const x of lost) n += 2 ** (Math.max(0, hullIndex(x.hull)) + 1) * x.count;
  if (n > 0) pairSet(state, "shipLosses", a, b, shipLossesOf(state, a, b) + n);
}

export function clearShipLosses(state: GameState, a: PlayerId, b: PlayerId): void {
  pairSet(state, "shipLosses", a, b, 0);
  pairSet(state, "shipLosses", b, a, 0);
}

const clampRel = (v: number) => Math.max(RELATION.min, Math.min(RELATION.max, Math.trunc(v)));

/** Sets the relation on both sides (a direct write, no scaling). */
export function setRelation(state: GameState, a: PlayerId, b: PlayerId, v: number): void {
  const x = clampRel(v);
  (state.attitude[a] ??= {})[b] = x;
  (state.attitude[b] ??= {})[a] = x;
}

/** A computer ruler's temperament as it acts toward `other`: an Honorable one you broke faith with acts Dishonored. */
export function effectiveTemperament(state: GameState, ruler: PlayerId, other: PlayerId): { name: string; treaty: number; noWar: number; vsHumans: number; breakChance: number } | null {
  const t = temperament(state, ruler);
  if (!t) return null;
  if (t === "honorable" && (state.dishonored?.[ruler] ?? []).includes(other)) return DISHONORED;
  return TEMPERAMENTS[t];
}

/** The temperament's treaty points, 0 for a human. */
export function persOf(state: GameState, ruler: PlayerId, other: PlayerId): number {
  return effectiveTemperament(state, ruler, other)?.treaty ?? 0;
}

const isComputer = (state: GameState, id: PlayerId) => {
  const p = state.players[id];
  return !!p && p.kind === "empire" && !p.isHuman;
};

/** Whether the two have met (both ways). */
function inContact(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return !!state.players[a]?.contacts.includes(b) && !!state.players[b]?.contacts.includes(a);
}

/**
 * How much an event of `delta` actually moves the relation between actor and
 * observer (the original's scaling function), or null when it cannot change
 * it: a human observer, no contact, or the two at war.
 */
export function scaleRelationEvent(state: GameState, delta: number, actor: PlayerId, observer: PlayerId): number | null {
  const pa = state.players[actor];
  const po = state.players[observer];
  if (!pa || !po || pa.kind !== "empire" || po.kind !== "empire" || !pa.alive || !po.alive) return null;
  if (actor === observer || delta === 0 || po.isHuman || !inContact(state, actor, observer)) return null;
  if (relation(state, actor, observer).status === "war") return null;
  const rel = attitude(state, observer, actor);
  let s: number;
  if (delta > 0) s = rel < 0 ? Math.min(2 * delta, RELATION.doubledGainCap - rel) : Math.trunc(delta / (Math.trunc(rel / RELATION.step) + 1));
  else s = rel > 0 ? 2 * delta : Math.trunc(delta / (Math.trunc(-rel / RELATION.step) + 1));
  const t = temperament(state, observer);
  if (t === "honorable" && s < 0) s *= RELATION.honorableLossMult;
  if (t === "xenophobic") s = Math.trunc(s * (s < 0 ? RELATION.xenophobicLossMult : RELATION.xenophobicGainMult));
  if (hasTrait(getRace(pa.raceId), "charismatic")) s = Math.trunc(s * (s > 0 ? RELATION.charismaticGainMult : RELATION.charismaticLossMult));
  if (!pa.isHuman && state.turn > RELATION.aiPairTurn) {
    s = s > 0 ? s * RELATION.aiPairGainMult : Math.trunc(s / (Math.trunc(difficultyLevel(state) / 2) + 1));
  }
  return s;
}

/**
 * An event: the observer's feelings about the actor change by `delta`,
 * scaled (see scaleRelationEvent), and the new value holds for both sides.
 * Without an alliance the relation stops at 65. The change also counts in the
 * observer's patience this turn, and the biggest event of the turn is kept
 * (it holds drift back and decides strikes and thanks). Returns the change.
 */
export function relationEvent(state: GameState, delta: number, actor: PlayerId, observer: PlayerId, reason: number = REASON.general): number {
  const s = scaleRelationEvent(state, delta, actor, observer);
  if (s === null || s === 0) return 0;
  const before = attitude(state, observer, actor);
  let next = clampRel(before + s);
  if (relation(state, actor, observer).status !== "alliance" && next > RELATION.capWithoutAlliance) next = Math.max(before, RELATION.capWithoutAlliance);
  setRelation(state, observer, actor, next);
  const pat = (state.patience ??= {});
  const row = (pat[observer] ??= {});
  row[actor] = (row[actor] ?? 0) + s;
  const ev = ((state.relationEvents ??= {})[observer] ??= {});
  const prev = ev[actor];
  if (!prev || Math.abs(s) >= Math.abs(prev.size)) ev[actor] = { reason, size: s };
  return next - before;
}

/** Every computer empire in contact with `actor` takes an event of `delta()` (rolled for each). */
export function everyComputerFeels(state: GameState, actor: PlayerId, delta: () => number, reason: number): void {
  for (const p of empires(state)) {
    if (p.id === actor || !p.alive || p.isHuman) continue;
    relationEvent(state, delta(), actor, p.id, reason);
  }
}

/** Biological weapons or extermination: every computer empire in contact loses d10 toward the user. */
export function destructionOutrage(state: GameState, user: PlayerId, roll: Roll): void {
  everyComputerFeels(state, user, () => -roll(RELATION_EVENTS.destruction), REASON.destruction);
}

/** Strength of the fleets `state` shows for an empire (in a player's view, only those in sight). */
export function fleetPower(state: GameState, playerId: PlayerId, starId?: string): number {
  const owner = state.players[playerId]!;
  let sum = 0;
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId !== playerId || (starId !== undefined && f.starId !== starId)) continue;
    for (const sh of f.ships) {
      const d = findDesign(owner, sh.designId);
      if (d) sum += designStats(owner, d).strength * sh.count;
    }
  }
  return sum;
}

/**
 * The original's strength ratio of a's fleets to b's in percent, capped at
 * 800 and halved for every other war a fights.
 */
export function strengthRatio(state: GameState, a: PlayerId, b: PlayerId, powers?: Map<PlayerId, number>): number {
  const pa = powers?.get(a) ?? fleetPower(state, a);
  const pb = powers?.get(b) ?? fleetPower(state, b);
  let r = Math.min(PEACE_ANSWER.strengthCap, Math.trunc(((pa + 1) * 100) / (pb + 1)));
  for (const p of empires(state)) {
    if (p.id === a || p.id === b || !p.alive) continue;
    if (relation(state, a, p.id).status === "war") r = Math.trunc(r / 2);
  }
  return r;
}

/** Signs up treaty no-war time on both sides: each computer ruler adds its own NOWAR x the treaty's multiplier. */
export function addTreatyNoWar(state: GameState, a: PlayerId, b: PlayerId, mult: number): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const t = effectiveTemperament(state, x, y);
    if (t) addNoWar(state, x, y, t.noWar * mult);
  }
}

/** First contact: each computer side won't declare war for 2 x its NOWAR turns. */
export function firstContact(state: GameState, a: PlayerId, b: PlayerId): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const t = effectiveTemperament(state, x, y);
    if (t) addNoWar(state, x, y, t.noWar * NO_WAR_MULT.contact);
  }
}

/** How many of an empire's colonies hold at least `minPop` population. */
function bigColonies(state: GameState, playerId: PlayerId, minPop: number): number {
  let n = 0;
  for (const c of Object.values(state.colonies)) if (c.ownerId === playerId && !c.outpost && population(c) >= minPop) n++;
  return n;
}

/**
 * Once a turn, the relation rules (the original's FUN_0004dd66 and its
 * neighbours): no-war counters run down and peace treaties lapse, treaties
 * warm relations, armed ships near computer colonies sour them, rivals with
 * many big colonies are envied, relations drift back toward their baseline
 * when nothing happened, wars hold them at -90 or lower, jealousy on Hard and
 * Impossible, then strikes or thanks for the biggest event since last turn.
 */
export function relationsTick(state: GameState, rng: Rng, emit?: Emit): void {
  const roll = rngRoll(rng);
  const last = state.relationEvents ?? {};
  state.relationEvents = {};
  const list = empires(state).filter((p) => p.alive);
  countDown(state, list.map((p) => p.id), emit);

  // Treaties warm relations: the human (if any) is the actor, the computer ruler the observer.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      if (a.isHuman && b.isHuman) continue;
      const [actor, observer] = b.isHuman ? [b.id, a.id] : [a.id, b.id];
      treatyWarmth(state, actor, observer, roll);
    }
  }
  threats(state);
  if (state.turn % 2 === 0) envy(state, roll);
  drift(state, list.map((p) => p.id), last, roll);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!.id;
      const b = list[j]!.id;
      if (relation(state, a, b).status === "war" && attitude(state, b, a) > RELATION.warCeiling) setRelation(state, a, b, RELATION.warCeiling);
      // The higher-numbered side's view wins, as in the original.
      if (state.attitude[b]?.[a] !== undefined) (state.attitude[a] ??= {})[b] = state.attitude[b]![a]!;
    }
  }
  jealousy(state, list.map((p) => p.id), roll);
  grievances(state, last, roll, emit);
  for (const a of list) {
    for (const b of list) {
      if (a.id === b.id || !a.contacts.includes(b.id)) continue;
      const row = ((state.audienceClock ??= {})[a.id] ??= {});
      row[b.id] = Math.min(250, (row[b.id] ?? 0) + 1);
    }
  }
}

/** No-war counters run down; a peace treaty lapses to no treaty when the lower-numbered side's count reaches 0. */
function countDown(state: GameState, ids: PlayerId[], emit?: Emit): void {
  for (const a of ids) for (const b of ids) if (a !== b && noWarTurns(state, a, b) > 0) setNoWar(state, a, b, noWarTurns(state, a, b) - 1);
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue;
      const r = relation(state, a, b);
      if (r.status !== "peace") continue;
      // Games saved before peace lapsed carry their old end turn over.
      if (state.noWar?.[a]?.[b] === undefined && r.peaceUntil !== undefined) {
        setNoWar(state, a, b, r.peaceUntil - state.turn);
        setNoWar(state, b, a, r.peaceUntil - state.turn);
      }
      if (noWarTurns(state, a, b) > 0) continue;
      const next = { ...r, status: "none" as const, since: state.turn };
      delete next.peaceUntil;
      state.relations[a < b ? `${a}-${b}` : `${b}-${a}`] = next;
      emit?.({ kind: "diplomacy", playerId: a, other: b, what: "saw your peace treaty run out; you have no treaty now" });
      emit?.({ kind: "diplomacy", playerId: b, other: a, what: "saw your peace treaty run out; you have no treaty now" });
    }
  }
}

/** What a pair's treaties and tributes add to the relation this turn. */
function treatyWarmth(state: GameState, actor: PlayerId, observer: PlayerId, roll: Roll): void {
  if (!inContact(state, actor, observer)) return;
  const r = relation(state, actor, observer);
  const rel = () => attitude(state, observer, actor);
  const chance = () => roll(100) <= 100 - rel();
  if (rel() < RELATION.hatredBelow && noWarTurns(state, actor, observer) > 0 && roll(2) === 1) relationEvent(state, 1, actor, observer);
  if (r.status === "nonAggression" && chance()) relationEvent(state, roll(TREATY_WARMTH.nonAggression), actor, observer);
  if (r.trade && chance()) relationEvent(state, roll(TREATY_WARMTH.trade), actor, observer, REASON.trade);
  if (r.research && chance()) relationEvent(state, roll(TREATY_WARMTH.research), actor, observer, REASON.research);
  if (r.status === "alliance") relationEvent(state, roll(TREATY_WARMTH.alliance), actor, observer);
  for (const t of state.tributes ?? []) {
    const pays = (t.from === actor && t.to === observer) || (t.from === observer && t.to === actor);
    const die = TREATY_WARMTH.tribute[t.percent];
    if (!pays || !die || !chance()) continue;
    relationEvent(state, roll(die), t.from, t.to, REASON.tribute);
  }
}

/**
 * Armed human ships at a computer empire's colony of 5 or more population
 * (strength over 100) sour it every turn by (pop - 4) + strength / 50,
 * unless the two are allied.
 */
function threats(state: GameState): void {
  const T = RELATION_EVENTS.threat;
  const humans = empires(state).filter((p) => p.alive && p.isHuman);
  if (humans.length === 0) return;
  for (const c of Object.values(state.colonies).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const owner = state.players[c.ownerId]!;
    const pop = population(c);
    if (owner.kind !== "empire" || owner.isHuman || c.outpost || pop < T.minPop) continue;
    const starId = state.planets[c.planetId]!.starId;
    for (const h of humans) {
      if (relation(state, h.id, owner.id).status === "alliance") continue;
      const strength = fleetPower(state, h.id, starId);
      if (strength <= T.minStrength) continue;
      relationEvent(state, -((pop - T.popOffset) + Math.trunc(strength / T.strengthPer)), h.id, owner.id, REASON.threat);
    }
  }
}

/**
 * Computer empires envy one with too many big colonies (the original's
 * "too big" check, on even turns): q = -(N - 3(g+1)) / (g + 6 - difficulty),
 * change = (d4 x q / 3) x 4, halved.
 */
function envy(state: GameState, roll: Roll): void {
  const E = RELATION_EVENTS.envy;
  const ais = empires(state).filter((p) => p.alive && !p.isHuman);
  const g = galaxySizeLevel(state);
  const d = difficultyLevel(state);
  const limit = E.perSize * (g + 1);
  const big = new Map(ais.map((p) => [p.id, bigColonies(state, p.id, E.minPop)]));
  for (const a of ais) {
    const n = big.get(a.id)!;
    if (n <= limit) continue;
    for (const b of ais) {
      if (a.id === b.id || big.get(b.id)! < 1) continue;
      const st = relation(state, a.id, b.id).status;
      if (st === "alliance" || st === "peace" || roll(E.oneIn) !== 1) continue;
      const q = -Math.trunc((n - limit) / (g + 6 - d));
      const delta = Math.trunc((Math.trunc(Math.trunc(roll(4) * q) / 3) * 4) / 2);
      if (delta) relationEvent(state, delta, a.id, b.id, REASON.envy);
    }
  }
}

/**
 * Drift: for each side, with chance (105 - |relation|) / 105 x 1/4 a coin is
 * tossed, and on heads the relation moves one step toward that side's
 * baseline, unless something happened between the two since last turn.
 */
function drift(state: GameState, ids: PlayerId[], last: NonNullable<GameState["relationEvents"]>, roll: Roll): void {
  for (const i of ids) {
    for (const k of ids) {
      if (i === k || !state.players[i]!.contacts.includes(k)) continue;
      const quiet = !last[i]?.[k] && !last[k]?.[i];
      (state.attitude[i] ??= {})[k] = driftStep(attitude(state, i, k), baselineOf(state, i, k), quiet, roll);
    }
  }
}

/**
 * One side's drift for a turn: if d105 > |relation| and a d4 shows 1, a coin
 * decides whether it moves one step toward the baseline (never past it), and
 * only if nothing happened between the two (`quiet`). Chance of a step:
 * (105 - |relation|) / 105 x 1/4 x 1/2.
 */
export function driftStep(rel: number, base: number, quiet: boolean, roll: Roll): number {
  if (!(roll(RELATION.driftDie) > Math.abs(rel) && roll(RELATION.driftOneIn) === 1)) return rel;
  const step = roll(2) - 1;
  if (step === 0 || !quiet || rel === base) return rel;
  return rel < base ? Math.min(base, rel + step) : Math.max(base, rel - step);
}

/**
 * Jealousy, Hard and Impossible only: a computer empire a human has no treaty
 * with at all resents the human's treaties with others (see JEALOUSY).
 */
function jealousy(state: GameState, ids: PlayerId[], roll: Roll): void {
  const d = difficultyLevel(state);
  if (d < JEALOUSY.minDifficulty) return;
  for (const x of ids) {
    const px = state.players[x]!;
    if (!px.isHuman) continue;
    let j = 0;
    for (const y of px.contacts) {
      const r = relation(state, x, y);
      if (r.status === "nonAggression") j += JEALOUSY.nonAggression;
      if (r.status === "alliance") j += JEALOUSY.alliance;
      if (r.trade) j += JEALOUSY.trade;
      if (r.research) j += JEALOUSY.research;
    }
    if (px.techs.includes("xenoPsychology")) j = Math.trunc(j * JEALOUSY.xenoPsychology);
    if (d === JEALOUSY.minDifficulty) j = Math.trunc(j / JEALOUSY.hardDivisor);
    if (j <= 0) continue;
    for (const y of px.contacts) {
      if (!isComputer(state, y) || !state.players[y]!.alive || temperament(state, y) === "pacifistic") continue;
      const r = relation(state, x, y);
      const tribute = (state.tributes ?? []).some((t) => (t.from === x && t.to === y) || (t.from === y && t.to === x));
      if (r.status !== "none" || r.trade || r.research || tribute) continue;
      const loss = Math.trunc(j / 100) + (roll(100) <= j % 100 ? 1 : 0);
      if (loss) setRelation(state, x, y, attitude(state, y, x) - loss);
    }
  }
}

/** Reasons that count as a grievance (spying, threats, destruction, envy, a vote against). */
const isGrievance = (reason: number) => reason >= 1 && reason <= 9;

/**
 * What a computer ruler makes of the biggest thing a human did to it since
 * last turn: a grievance earns up to three strikes (d100 against s, s/2, s/4
 * where s = twice the hurt - temperament - trust - reputation, plus the hate
 * when relations are below 0); goodwill from trade, research, tribute, a war
 * fought for it or a council vote may wipe the slate clean (the original's
 * thank-you messages).
 */
function grievances(state: GameState, last: NonNullable<GameState["relationEvents"]>, roll: Roll, emit?: Emit): void {
  for (const [obsKey, row] of Object.entries(last)) {
    const ai = Number(obsKey);
    if (!isComputer(state, ai) || !state.players[ai]!.alive) continue;
    for (const [actKey, ev] of Object.entries(row)) {
      const p = Number(actKey);
      const human = state.players[p];
      if (!human?.alive || !human.isHuman || relation(state, ai, p).status === "war") continue;
      // The original skips grievances entirely when either side is repulsive (they can only make war or peace).
      if (isRepulsive(state, ai) || isRepulsive(state, p)) continue;
      if (isGrievance(ev.reason) && ev.size < 0) {
        strike(state, ai, p, ev, roll, emit);
      } else if (ev.size > 0 && thanks(ev.reason, roll)) {
        setStrikes(state, ai, p, 0);
      }
    }
  }
}

function thanks(reason: number, roll: Roll): boolean {
  if (reason === REASON.trade || reason === REASON.research) return true;
  if (reason === REASON.tribute) return roll(100) <= 3;
  if (reason === REASON.joinedWar) return roll(100) <= 10;
  if (reason === REASON.councilFor) return roll(100) <= 20;
  return false;
}

/** Whether the two have a treaty of any kind (pact, alliance, trade or research). */
export function anyTreaty(state: GameState, a: PlayerId, b: PlayerId): boolean {
  const r = relation(state, a, b);
  return r.status === "nonAggression" || r.status === "alliance" || r.trade || r.research;
}

function strike(state: GameState, ai: PlayerId, p: PlayerId, ev: { reason: number; size: number }, roll: Roll, emit?: Emit): void {
  const t = effectiveTemperament(state, ai, p);
  const pers = t?.treaty ?? 0;
  const trust = state.trust?.[ai]?.[p] ?? 0;
  const rep = state.reputation?.[ai]?.[p] ?? 0;
  // The original sets s = 100 for a vote against a candidate it backed; StarLord treats every vote against it so (an estimate).
  let s = ev.reason === REASON.councilAgainst ? STRIKES.councilVote : Math.abs(2 * ev.size) - pers - trust - rep;
  const rel = attitude(state, ai, p);
  if (rel < 0) s += -rel;
  const before = strikesOf(state, ai, p);
  const n = before + (roll(100) <= s ? 1 : 0) + (roll(100) <= Math.trunc(s / 2) ? 1 : 0) + (roll(100) <= Math.trunc(s / 4) ? 1 : 0);
  if (n === before) return;
  setStrikes(state, ai, p, n);
  const treaty = anyTreaty(state, ai, p);
  const honorable = temperament(state, ai) === "honorable" && t?.name !== "Dishonored";
  if (honorable && treaty) {
    // An Honorable ruler goes to war at once over a broken trust; both count as dishonored.
    const d = (state.dishonored ??= {});
    d[ai] = [...new Set([...(d[ai] ?? []), p])];
    d[p] = [...new Set([...(d[p] ?? []), ai])];
    strikeWar(state, ai, p, roll, emit);
    return;
  }
  if (n > 2 || (n > 1 && !treaty)) {
    // A ruler that is not Honorable demands a system it covets first (see COVET); otherwise war if its fleets measure up.
    if (t?.name !== TEMPERAMENTS.honorable.name && demandCovetedSystem(state, ai, p, emit)) return;
    if (strengthRatio(state, ai, p) > STRIKES.warStrength) strikeWar(state, ai, p, roll, emit);
    return;
  }
  if (n === 2 && treaty) {
    const asked = roll(100) <= (t?.breakChance ?? 0) && offerCompensation(state, ai, p);
    if (!asked) {
      breakAllTreaties(state, p, ai, roll);
      emit?.({ kind: "diplomacy", playerId: p, other: ai, what: "has had enough of your offences and ended its treaties with you" });
    }
    return;
  }
  emit?.({ kind: "diplomacy", playerId: p, other: ai, what: "warns you: one more offence and there will be consequences" });
}

/** A computer ruler declares war over its grievances; the human is blamed. */
function strikeWar(state: GameState, ai: PlayerId, p: PlayerId, roll: Roll, emit?: Emit): void {
  declareWar(state, ai, p, { blame: p, roll });
  emit?.({ kind: "diplomacy", playerId: p, other: ai, what: "has had enough of your offences and declared war on you" });
}

function isRepulsive(state: GameState, id: PlayerId): boolean {
  const p = state.players[id];
  return !!p && p.kind === "empire" && hasTrait(getRace(p.raceId), "repulsive");
}
