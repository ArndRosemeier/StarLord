import {
  AI_PEACE, COUNTER_PRICE, DEMAND_ANSWER, NO_WAR_MULT, PATIENCE, PEACE_ANSWER, PEACE_TREATY_TURNS, RELATION, RELATION_EVENTS,
  TEMPERAMENTS, TREATY_ANSWER, TREATY_YIELD, TRIBUTE_PERCENTS, TRUST, type Temperament, PROPOSAL_LIFETIME,
} from "./data/diplomacy.js";
import { GOVERNMENTS } from "./data/governments.js";
import { leaderTradeBonus } from "./leaders.js";
import { raceDiplomacyPoints } from "./raceEffects.js";
import { getRace, hasTrait } from "./data/races.js";
import { TIER_OF_TECH } from "./data/techs.js";
import type { Emit } from "./context.js";
import { androids, empireTotals, population } from "./economy.js";
import { empireBonus, empireIncome, empires, fleetRange, grantTech, scanRange } from "./empire.js";
import { distance } from "./galaxy.js";
import type { DiplomaticStatus, GameState, Id, PlayerId, Price, Proposal, ProposalKind, Relation } from "./types.js";
import type { Rng } from "./rng.js";
import {
  REASON, addTreatyNoWar, baselineOf, clearShipLosses, firstContact, fleetPower, keyedRoll, persOf,
  raceRelation, relationEvent, relationsTick, rngRoll, setBaseline, setNoWar, setRelation, setStrikes, shipLossesOf, strengthRatio,
  strikesOf, type Roll,
} from "./relations.js";
import { aiDiplomacyTick } from "./aiDiplomacy.js";

/**
 * Relations between empires, after the original: a status (no treaty, war,
 * peace treaty, non-aggression pact, alliance) plus independent trade and
 * research treaties and tribute. Every pair of empires shares a relation
 * value (-100..100, see relations.ts) that the computer rulers use to decide
 * what to accept. Proposals cover treaties, tech exchanges and demands; gifts
 * and surrender happen at once.
 */

export { PROPOSAL_LIFETIME };

export function relKey(a: PlayerId, b: PlayerId): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function relation(state: GameState, a: PlayerId, b: PlayerId): Relation {
  return state.relations[relKey(a, b)] ?? { status: "none", trade: false, research: false, since: 0 };
}

function writeRelation(state: GameState, a: PlayerId, b: PlayerId, r: Relation): void {
  state.relations[relKey(a, b)] = r;
}

function clearYields(state: GameState, a: PlayerId, b: PlayerId, kind?: "trade" | "research"): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const row = state.treatyYields?.[x]?.[y];
    if (!row) continue;
    if (kind) delete row[kind];
    else delete state.treatyYields![x]![y];
  }
}

export function setStatus(state: GameState, a: PlayerId, b: PlayerId, status: DiplomaticStatus): void {
  const r: Relation = { ...relation(state, a, b), status, since: state.turn };
  delete r.peaceUntil;
  if (status === "war") {
    // War cancels every treaty, tribute included.
    r.trade = false;
    r.research = false;
    clearYields(state, a, b);
    state.tributes = (state.tributes ?? []).filter((t) => !((t.from === a && t.to === b) || (t.from === b && t.to === a)));
  }
  writeRelation(state, a, b, r);
}

/** Whether ships of a and b fight on sight. */
export function isHostile(state: GameState, a: PlayerId, b: PlayerId): boolean {
  if (a === b) return false;
  const pa = state.players[a]!;
  const pb = state.players[b]!;
  if (pa.kind !== "empire" || pb.kind !== "empire") {
    // Monsters and raiders attack empires, never each other.
    return pa.kind === "empire" || pb.kind === "empire";
  }
  return relation(state, a, b).status === "war";
}

/** The relation between a and b as a sees it (-100..100); before anything happened, the race table. */
export function attitude(state: GameState, a: PlayerId, b: PlayerId): number {
  return state.attitude[a]?.[b] ?? raceRelation(state, a, b);
}

/**
 * Extra weight a proposer's deals carry with the other side: Xeno Psychology,
 * charismatic (+50% acceptance) and telepathic (+25% diplomacy) races.
 */
export function dealBonus(state: GameState, proposer: PlayerId): number {
  const p = state.players[proposer]!;
  return empireBonus(p).diplomacy + raceDiplomacyPoints(getRace(p.raceId));
}

function repulsivePair(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return hasTrait(getRace(state.players[a]!.raceId), "repulsive") || hasTrait(getRace(state.players[b]!.raceId), "repulsive");
}

export type ProposalTerms = Pick<Proposal, "techId" | "wantTechId" | "starId" | "third" | "percent" | "price">;

function coloniesAt(state: GameState, playerId: PlayerId, starId: Id) {
  return Object.values(state.colonies).filter((c) => c.ownerId === playerId && state.planets[c.planetId]?.starId === starId);
}

function intruders(state: GameState, demander: PlayerId, target: PlayerId) {
  return Object.values(state.fleets).filter(
    (f) => f.ownerId === target && f.starId && coloniesAt(state, demander, f.starId).length > 0,
  );
}

/** Why a proposal cannot be made (or accepted) now, or null. Treaties are independent: an alliance can end a war. */
export function canSign(state: GameState, from: PlayerId, to: PlayerId, kind: ProposalKind, terms: ProposalTerms = {}): string | null {
  const r = relation(state, from, to);
  const pf = state.players[from]!;
  const pt = state.players[to]!;
  if (!pf.contacts.includes(to)) return "no contact";
  if (kind !== "peace" && kind !== "ceasefire" && repulsivePair(state, from, to)) {
    return "repulsive races can only declare war or sue for peace";
  }
  if (terms.price) {
    const why = giftProblem(state, to, from, terms.price);
    if (why) return `can't pay the price: ${why}`;
  }
  const third = terms.third !== undefined ? state.players[terms.third] : undefined;
  const validThird = () => !!third && third.kind === "empire" && third.alive && third.id !== from && third.id !== to;
  switch (kind) {
    case "ceasefire":
    case "peace":
      return r.status === "war" ? null : "not at war";
    case "nonAggression":
      return r.status === "nonAggression" || r.status === "alliance" ? "already pledged" : r.status === "war" ? "make peace first" : null;
    case "alliance":
      return r.status === "alliance" ? "already allied" : r.status !== "nonAggression" ? "needs a non-aggression pact first" : null;
    case "trade":
      return r.status !== "war" && !r.trade ? null : r.trade ? "already trading" : "not while at war";
    case "research":
      return r.status !== "war" && !r.research ? null : r.research ? "already sharing research" : "not while at war";
    case "techExchange":
      if (!terms.techId || !terms.wantTechId) return "name a technology to give and one to get";
      if (!pf.techs.includes(terms.techId) || pt.techs.includes(terms.techId)) return "they already know what you offer";
      if (!pt.techs.includes(terms.wantTechId) || pf.techs.includes(terms.wantTechId)) return "they do not have what you ask for";
      if (!TIER_OF_TECH[terms.techId] || !TIER_OF_TECH[terms.wantTechId]) return "that technology cannot be traded";
      return null;
    case "demandTribute":
      return TRIBUTE_PERCENTS.includes(terms.percent as 5 | 10) ? null : "tribute is 5% or 10%";
    case "demandTech":
      if (!terms.wantTechId || !TIER_OF_TECH[terms.wantTechId]) return "name a technology";
      return pt.techs.includes(terms.wantTechId) && !pf.techs.includes(terms.wantTechId) ? null : "they do not have it";
    case "demandSystem":
      if (!terms.starId) return "name a system";
      return coloniesAt(state, to, terms.starId).length > 0 ? null : "they have no colony there";
    case "demandWar":
      if (!validThird() || !pt.contacts.includes(terms.third!)) return "name an empire they know";
      return relation(state, to, terms.third!).status === "war" ? "already at war with them" : null;
    case "demandPeace":
      if (!validThird()) return "name an empire";
      return relation(state, to, terms.third!).status === "war" ? null : "they are not at war with them";
    case "demandBreakAlliance":
      if (!validThird()) return "name an empire";
      return relation(state, to, terms.third!).status === "alliance" ? null : "they are not allied with them";
    case "demandStopSpying":
      return (pt.spies.abroad[from]?.count ?? 0) > 0 ? null : "they have no known spies with you";
    case "demandRemoveFleet":
      return intruders(state, from, to).length > 0 ? null : "none of their fleets orbit your systems";
    case "compensation":
      if (pf.isHuman || strikesOf(state, from, to) < 1) return "only a computer ruler with grievances asks compensation";
      return terms.price ? null : "name a price";
  }
}

/**
 * A proposal's id follows from who made it, to whom, what and when (an empire
 * can only have one proposal of a kind open with another), so the other side
 * can answer it in the same turn it is made.
 */
export function proposalId(turn: number, from: PlayerId, to: PlayerId, kind: ProposalKind): Id {
  return `d${turn}.${from}.${to}.${kind}`;
}

/** Proposals already put to the same emperor this turn; leaders tire after a few. */
export function audienceItems(state: GameState, from: PlayerId, to: PlayerId): number {
  return state.proposals.filter((p) => p.from === from && p.to === to && p.turn === state.turn).length;
}

/** How much more `listener` will hear from `asker`: 0 at rest, negative after asks. */
export function patience(state: GameState, listener: PlayerId, asker: PlayerId): number {
  return state.patience?.[listener]?.[asker] ?? 0;
}

/** The asker's own tally per proposal kind with that listener. */
export function askTally(state: GameState, asker: PlayerId, listener: PlayerId): Record<string, number> {
  return state.asks?.[asker]?.[listener] ?? {};
}

/** True once `to` will hear no more from `from` until patience recovers. */
export function audienceTired(state: GameState, from: PlayerId, to: PlayerId): boolean {
  return Object.values(askTally(state, from, to)).some((v) => v <= PATIENCE.refuse);
}

/** A d-n roll fixed by the game seed and a key, so answers are the same in previews and replays. */
export function fixedRoll(state: GameState, key: string, n: number): number {
  let h = 2166136261 >>> 0;
  const text = `${state.seed}|${key}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return 1 + (h % n);
}

/** A computer empire's temperament, after the original's six AI personalities; fixed for the game. */
export function temperament(state: GameState, playerId: PlayerId): Temperament | null {
  const p = state.players[playerId];
  if (!p || p.kind !== "empire" || p.isHuman) return null;
  const all = Object.keys(TEMPERAMENTS) as Temperament[];
  return all[fixedRoll(state, `temperament${playerId}`, all.length) - 1]!;
}

/** Records a proposal's cost to both sides' patience; returns the listener's patience before it and the listener's roll. */
export function chargePatience(state: GameState, from: PlayerId, to: PlayerId, kind: ProposalKind, id: string): { patience: number; roll: number } {
  const before = patience(state, to, from);
  const first = !state.proposals.some((p) => p.from === from && p.to === to && p.turn === state.turn);
  const cost = PATIENCE.perAsk + (first ? PATIENCE.firstAsk + fixedRoll(state, `${id}|first`, PATIENCE.firstAskRoll) : 0);
  state.patience = { ...(state.patience ?? {}), [to]: { ...(state.patience?.[to] ?? {}), [from]: before - cost } };
  const tally = { ...askTally(state, from, to) };
  const own = askGroup(kind);
  for (const k of ASK_GROUPS) {
    tally[k] = (tally[k] ?? 0) - (isDemand(kind) ? PATIENCE.demand : PATIENCE.perAsk + (k === own ? PATIENCE.sameKind : 0));
  }
  state.asks = { ...(state.asks ?? {}), [from]: { ...(state.asks?.[from] ?? {}), [to]: tally } };
  // Coming to someone resets the clock that times the next visit.
  ((state.audienceClock ??= {})[from] ??= {})[to] = 0;
  return { patience: before, roll: fixedRoll(state, id, 100) };
}

/** The asker's four tallies, as in the original: pacts, trade, research and everything else. */
const ASK_GROUPS = ["pact", "trade", "research", "other"] as const;
function askGroup(kind: ProposalKind): (typeof ASK_GROUPS)[number] {
  if (kind === "nonAggression" || kind === "alliance" || kind === "peace" || kind === "ceasefire") return "pact";
  return kind === "trade" || kind === "research" ? kind : "other";
}

/** Every turn patience recovers toward 0 (goodwill from events lasts only the turn). */
function recoverPatience(state: GameState): void {
  const up = (v: number) => Math.min(0, v + PATIENCE.recovery);
  for (const a of Object.values(state.patience ?? {})) for (const b of Object.keys(a)) a[b] = up(a[b]!);
  for (const a of Object.values(state.asks ?? {})) for (const t of Object.values(a)) for (const k of Object.keys(t)) t[k] = up(t[k]!);
}

/** Breaking a treaty or going to war exhausts both sides' patience. */
function exhaustPatience(state: GameState, a: PlayerId, b: PlayerId): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    state.patience = { ...(state.patience ?? {}), [x]: { ...(state.patience?.[x] ?? {}), [y]: PATIENCE.broken } };
    const tally = Object.fromEntries(ASK_GROUPS.map((k) => [k, PATIENCE.broken]));
    state.asks = { ...(state.asks ?? {}), [x]: { ...(state.asks?.[x] ?? {}), [y]: tally } };
  }
}

export interface TreatyScore {
  /** Accepted at 0 or more (before the roll is added when `roll` is null). */
  score: number;
  parts: { why: string; value: number }[];
  /** Hard conditions that refuse whatever the score. */
  blocked: string | null;
}

/** Kinds a computer ruler answers with the original's score. */
export function isScoredTreaty(kind: ProposalKind): boolean {
  return kind === "nonAggression" || kind === "alliance" || kind === "trade" || kind === "research" || kind === "peace" || kind === "ceasefire";
}

const pairValue = (m: Record<string, Record<string, number>> | undefined, a: PlayerId, b: PlayerId) => m?.[a]?.[b] ?? 0;
export const trustIn = (state: GameState, a: PlayerId, b: PlayerId) => pairValue(state.trust, a, b);
export const reputationOf = (state: GameState, a: PlayerId, b: PlayerId) => pairValue(state.reputation, a, b);
const isDishonored = (state: GameState, a: PlayerId, b: PlayerId) => (state.dishonored?.[a] ?? []).includes(b);

/** Systems where `a` has a colony and `b` has ships. */
export function occupiedBy(state: GameState, a: PlayerId, b: PlayerId): number {
  const stars = new Set(Object.values(state.colonies).filter((c) => c.ownerId === a).map((c) => state.planets[c.planetId]?.starId));
  return new Set(Object.values(state.fleets).filter((f) => f.ownerId === b && f.starId && stars.has(f.starId)).map((f) => f.starId)).size;
}

/** Wars `a` fights other than against `b`, a human enemy counting `humanWarWeight`. */
export function otherWars(state: GameState, a: PlayerId, b: PlayerId): number {
  let n = 0;
  for (const p of empires(state)) {
    if (p.id === a || p.id === b || !p.alive || relation(state, a, p.id).status !== "war") continue;
    n += p.isHuman ? PEACE_ANSWER.humanWarWeight : 1;
  }
  return n;
}

/**
 * The original's K term for peace: how the ship losses compare. With yours =
 * what `you` lost to all your computer enemies and theirs = what `ruler` lost
 * to you (each at least 10): 100 x yours / theirs - 100 when you lost more,
 * else 100 - 100 x theirs / yours, held to -300..300.
 */
export function peaceLossTerm(state: GameState, ruler: PlayerId, you: PlayerId): number {
  let s = 0;
  for (const p of empires(state)) {
    if (p.id === you || p.isHuman || relation(state, you, p.id).status !== "war") continue;
    s += shipLossesOf(state, you, p.id);
  }
  s = Math.max(s, PEACE_ANSWER.minLosses);
  const x = Math.max(shipLossesOf(state, ruler, you), PEACE_ANSWER.minLosses);
  const k = s < x ? 100 - Math.trunc((100 * x) / s) : Math.trunc((100 * s) / x) - 100;
  return Math.max(-PEACE_ANSWER.lossCap, Math.min(PEACE_ANSWER.lossCap, k));
}

/**
 * The original's answer to a treaty: for a non-aggression pact, alliance,
 * trade or research treaty the listener's relation with you, a d100, the
 * treaty's need, its trust in you and your reputation, its temperament and
 * patience, and the proposer's diplomatic bonuses. Peace leaves the relation
 * out and weighs the war instead. With `roll` null the result leaves the die
 * out (for showing odds).
 */
export function treatyScore(
  state: GameState, from: PlayerId, to: PlayerId, kind: ProposalKind, roll: number | null, patienceBefore = patience(state, to, from),
): TreatyScore {
  const proposer = state.players[from]!;
  const race = getRace(proposer.raceId);
  const temper = temperament(state, to);
  const honorable = temper === "honorable";
  const peace = kind === "peace" || kind === "ceasefire";
  const parts: { why: string; value: number }[] = [];
  const add = (why: string, value: number) => {
    if (value) parts.push({ why, value: Math.round(value) });
  };
  const trust = trustIn(state, to, from);
  const rep = reputationOf(state, to, from);
  if (peace) {
    const r = relation(state, from, to);
    const turns = state.turn - r.since;
    parts.push({ why: "what peace asks of them", value: -PEACE_ANSWER.need });
    add("turns of war so far", (turns - PEACE_ANSWER.warTurnsOffset) * PEACE_ANSWER.perWarTurn);
    add("their trust in you (counts twice)", 2 * trust);
    add("your reputation (counts twice)", (honorable ? 3 : 2) * rep);
    add("their other wars", PEACE_ANSWER.perTheirWar * otherWars(state, to, from));
    add("your other wars", -PEACE_ANSWER.perYourWar * otherWars(state, from, to));
    add("their fleets against yours", -(strengthRatio(state, to, from) - 100) / 2);
    add("your systems their ships hold", -PEACE_ANSWER.theirFleetInYourSystem * occupiedBy(state, from, to));
    add("their systems your ships hold", PEACE_ANSWER.yourFleetInTheirSystem * occupiedBy(state, to, from));
    add("ship losses so far", peaceLossTerm(state, to, from));
  } else {
    parts.push({ why: "their relation with you", value: attitude(state, to, from) });
    parts.push({ why: `what a ${words(kind)} asks of them`, value: -(TREATY_ANSWER.need[kind] ?? 0) });
    add("their trust in you", trust);
    add(honorable ? "your reputation (Honorable rulers count it twice)" : "your reputation", (honorable ? 2 : 1) * rep);
  }
  if (temper) {
    const dishonored = honorable && isDishonored(state, to, from);
    add(dishonored ? "Honorable, and you broke faith with them" : `${TEMPERAMENTS[temper].name} temperament`, dishonored ? TREATY_ANSWER.dishonored : TEMPERAMENTS[temper].treaty);
  }
  add("patience worn by earlier asks", patienceBefore);
  // Charismatic and telepathic proposers, Xeno Psychology and the best diplomat leader.
  const racial = raceDiplomacyPoints(race);
  if (racial) parts.push({ why: hasTrait(race, "charismatic") ? (hasTrait(race, "telepathic") ? "you are charismatic and telepathic" : "you are charismatic") : "you are telepathic", value: racial });
  add("Xeno Psychology", empireBonus(proposer).diplomacy);
  add("your diplomat leader", Math.max(0, (proposer.diplomacyBonus ?? 0) - racial));
  if (roll !== null) parts.push({ why: "their mood today (d100)", value: roll });
  let blocked: string | null = null;
  if (kind === "alliance" && attitude(state, to, from) < TREATY_ANSWER.allianceMinAttitude) {
    blocked = `they ally only at a relation of ${TREATY_ANSWER.allianceMinAttitude} or better`;
  }
  if (peace && state.turn - relation(state, from, to).since < TREATY_ANSWER.peaceMinWarTurns) {
    blocked = `they hear no peace before ${TREATY_ANSWER.peaceMinWarTurns} turns of war`;
  }
  return { score: parts.reduce((x, p) => x + p.value, 0), parts, blocked };
}

/** Chance (0..1) a computer empire accepts a treaty now, over its d100. */
export function treatyAcceptChance(state: GameState, from: PlayerId, to: PlayerId, kind: ProposalKind): number {
  const t = treatyScore(state, from, to, kind, null);
  if (t.blocked) return 0;
  // Accepts when score + d100 >= 0.
  return Math.max(0, Math.min(100, 101 + t.score)) / 100;
}

/** Chance (0..1) that they name a price instead of refusing outright. */
export function treatyPriceChance(state: GameState, from: PlayerId, to: PlayerId, kind: ProposalKind): number {
  const t = treatyScore(state, from, to, kind, null);
  const c = TREATY_ANSWER.counterChance[kind === "ceasefire" ? "peace" : kind] ?? 0;
  if (t.blocked || !c) return 0;
  // Score + d100 lands in [bigPrice, -1].
  const hits = Math.max(0, Math.min(100, -1 - t.score) - Math.max(1, TREATY_ANSWER.bigPrice - t.score) + 1);
  return (hits / 100) * c;
}

export type TreatyAnswer = { kind: "accept" } | { kind: "refuse" } | { kind: "price"; price: Price };

/**
 * A computer ruler's whole answer to a scored treaty proposal: accept, refuse,
 * or name a price, after the original. Fixed by the proposal's roll.
 */
export function treatyAnswer(state: GameState, p: Proposal, warmth = 0): TreatyAnswer {
  const t = treatyScore(state, p.from, p.to, p.kind, p.roll ?? 50, p.patience ?? 0);
  if (t.blocked) return { kind: "refuse" };
  const score = t.score + warmth;
  if (score >= 0) return { kind: "accept" };
  if (score < TREATY_ANSWER.bigPrice) return { kind: "refuse" };
  const chance = TREATY_ANSWER.counterChance[p.kind === "ceasefire" ? "peace" : p.kind] ?? 0;
  if (!chance || fixedRoll(state, `${p.id}|counter`, 100) > chance * 100) return { kind: "refuse" };
  const level = score >= TREATY_ANSWER.smallPrice ? COUNTER_PRICE.levels.small : COUNTER_PRICE.levels.big;
  const price = counterPrice(state, p.to, p.from, level, p.id, p.kind);
  return price ? { kind: "price", price } : { kind: "refuse" };
}

/** An empire's expenses a turn, as the original counts them: upkeep, freighters, command overage, salaries and tribute paid. */
export function empireExpenses(state: GameState, playerId: PlayerId): number {
  const i = empireIncome(state, playerId);
  const tribute = (state.tributes ?? []).filter((t) => t.from === playerId).reduce((s, t) => s + tributeAmount(state, playerId, t.percent), 0);
  return i.maintenance + i.freighters + i.projects + i.salaries + i.commandOverage + tribute;
}

/** Highest tech level (1..18) among the techs an empire knows. */
function bestTechLevel(state: GameState, playerId: PlayerId): number {
  let best = 1;
  for (const t of state.players[playerId]!.techs) best = Math.max(best, TIER_OF_TECH[t]?.level ?? 1);
  return best;
}

/**
 * The price `ruler` asks of `payer` at a level (4 small, 8 big), after the
 * original's FUN_0004f936; see COUNTER_PRICE. Peace may cost a tribute (level
 * 6 or lower) or a system (level 6 or higher); a pact or alliance only BC or
 * a technology. Null when there is nothing to ask.
 */
export function counterPrice(state: GameState, ruler: PlayerId, payer: PlayerId, level: number, key: string, kind: ProposalKind): Price | null {
  const roll = keyedRoll(state, `${key}|price`);
  const them = state.players[ruler]!;
  const you = state.players[payer]!;
  const peace = kind === "peace" || kind === "ceasefire";
  level = Math.max(1, Math.min(COUNTER_PRICE.maxLevel, Math.trunc(level)));

  const expenses = Math.max(COUNTER_PRICE.minExpenses, Math.trunc(empireExpenses(state, ruler)));
  const treasury = Math.max(0, Math.floor(you.bc));
  const m = Math.min(10, Math.trunc(Math.trunc(treasury / expenses) / 10));
  let bc = 0;
  if (level <= m) {
    let amount = Math.min(expenses * level * COUNTER_PRICE.bcPerLevel, treasury);
    amount = amount < 100 ? Math.floor(amount / 10) * 10 : Math.floor(amount / 100) * 100;
    bc = Math.min(COUNTER_PRICE.maxBc, amount);
  }

  // Technology: the further behind you are, the dearer the pick (r = your best level x 10 / theirs, 10 if you lead).
  const mine = bestTechLevel(state, payer);
  const theirs = bestTechLevel(state, ruler);
  const r = mine >= theirs ? 10 : Math.max(1, Math.trunc((mine * 10) / theirs));
  // The original also leaves out techs the ruler cannot learn and other governments' techs; StarLord lets every listed tech be traded.
  const techs = you.techs.filter((t) => TIER_OF_TECH[t] && !them.techs.includes(t))
    .sort((a, b) => (TIER_OF_TECH[b]!.cost - TIER_OF_TECH[a]!.cost) || a.localeCompare(b));
  let techId: string | null = null;
  if (level <= r && techs.length) {
    const n = techs.length;
    techId = techs[Math.max(0, Math.min(n - 1, n - 1 - (Math.trunc((n * level) / r) + roll(3) - 2)))]!;
  }

  const paying = (state.tributes ?? []).some((t) => t.from === payer && t.to === ruler);
  const tribute = peace && level <= COUNTER_PRICE.tributeMaxLevel && !paying;

  let starId: Id | null = null;
  if (peace && level >= COUNTER_PRICE.systemMinLevel) {
    const capital = new Set(Object.values(state.colonies).filter((c) => c.ownerId === payer && c.buildings.includes("capitol")).map((c) => state.planets[c.planetId]!.starId));
    capital.add(you.homeStarId);
    const pops = new Map<Id, number>();
    for (const c of Object.values(state.colonies)) {
      if (c.ownerId !== payer) continue;
      const s = state.planets[c.planetId]!.starId;
      pops.set(s, (pops.get(s) ?? 0) + population(c));
    }
    // The original also needs the system in the ruler's range; StarLord asks for any but the capital's.
    const stars = pops.size > 1 ? [...pops].filter(([s]) => !capital.has(s)).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)) : [];
    if (stars.length) {
      const n = stars.length;
      const h = Math.trunc((n + 1) / 2);
      const i = level > COUNTER_PRICE.systemMinLevel ? n - roll(h) : roll(h) - 1;
      starId = stars[Math.max(0, Math.min(n - 1, i))]![0];
    }
  }

  if (starId && (roll(3) === 1 || (!techId && !tribute && !bc))) return { starId };
  if (techId && (roll(3) === 1 || (!tribute && !bc))) return { techId };
  if (tribute && (roll(2) === 1 || !bc)) return { tribute: COUNTER_PRICE.tribute };
  if (bc) return { bc };
  return null;
}

/**
 * Records broken faith: the wronged empire's trust drops and it remembers the
 * breaker as dishonored, and everyone else in contact thinks less of the breaker.
 */
export function recordBrokenFaith(state: GameState, breaker: PlayerId, wronged: PlayerId, treaty: string): void {
  const hurt = TRUST.broken[treaty] ?? 0;
  if (!hurt) return;
  const honorable = temperament(state, wronged) === "honorable";
  state.trust = { ...(state.trust ?? {}), [wronged]: { ...(state.trust?.[wronged] ?? {}), [breaker]: trustIn(state, wronged, breaker) - hurt * (honorable ? TRUST.honorableMult : 1) } };
  state.dishonored = { ...(state.dishonored ?? {}), [wronged]: [...new Set([...(state.dishonored?.[wronged] ?? []), breaker])] };
  for (const other of empires(state)) {
    if (other.id === breaker || other.id === wronged || !other.alive || !other.contacts.includes(breaker)) continue;
    const loss = temperament(state, other.id) === "honorable" ? TRUST.honorableReputation : TRUST.reputation;
    state.reputation = { ...(state.reputation ?? {}), [other.id]: { ...(state.reputation?.[other.id] ?? {}), [breaker]: reputationOf(state, other.id, breaker) - loss } };
  }
}

const words = (kind: ProposalKind) => (kind === "nonAggression" ? "non-aggression pact" : kind === "alliance" ? "alliance" : kind === "peace" || kind === "ceasefire" ? "peace" : `${kind} treaty`);

export function isDemand(kind: ProposalKind): boolean {
  return kind.startsWith("demand");
}

const isComputer = (state: GameState, id: PlayerId) => state.players[id]?.kind === "empire" && !state.players[id]!.isHuman;

/** Carries out an accepted proposal. */
export function acceptProposal(state: GameState, p: Proposal, emit?: Emit): void {
  if (p.price) payPrice(state, p.to, p.from, p.price, emit);
  const roll = keyedRoll(state, `${p.id}|accept`);
  switch (p.kind) {
    case "ceasefire":
    case "peace":
      makePeace(state, p.from, p.to);
      break;
    case "nonAggression":
    case "alliance":
      signPact(state, p.from, p.to, p.kind);
      break;
    case "trade":
    case "research":
      signTreaty(state, p.from, p.to, p.kind);
      break;
    case "techExchange":
      giveTech(state, p.from, p.to, p.techId!, emit);
      giveTech(state, p.to, p.from, p.wantTechId!, emit);
      relationEvent(state, RELATION_EVENTS.techExchange, p.from, p.to);
      relationEvent(state, RELATION_EVENTS.techExchange, p.to, p.from);
      break;
    case "demandTribute":
      addTribute(state, p.to, p.from, p.percent!);
      break;
    case "demandTech":
      giveTech(state, p.to, p.from, p.wantTechId!, emit);
      break;
    case "demandSystem":
      cedeSystem(state, p.to, p.from, p.starId!, emit);
      break;
    case "demandWar":
      declareWar(state, p.to, p.third!, { roll });
      emit?.({ kind: "diplomacy", playerId: p.third!, other: p.to, what: "declared war on you" });
      // A computer ruler is grateful when you attack the empire it asked you to.
      relationEvent(state, 200, p.to, p.from, REASON.joinedWar);
      break;
    case "demandPeace":
      makePeace(state, p.to, p.third!);
      emit?.({ kind: "diplomacy", playerId: p.third!, other: p.to, what: "made peace with you" });
      break;
    case "demandBreakAlliance":
      recordBrokenFaith(state, p.to, p.third!, "alliance");
      setStatus(state, p.to, p.third!, "none");
      emit?.({ kind: "diplomacy", playerId: p.third!, other: p.to, what: "broke off its alliance with you" });
      break;
    case "demandStopSpying": {
      const spy = state.players[p.to]!.spies;
      spy.home += spy.abroad[p.from]?.count ?? 0;
      delete spy.abroad[p.from];
      break;
    }
    case "demandRemoveFleet":
      for (const f of intruders(state, p.from, p.to)) {
        const home = nearestColonyStar(state, p.to, f);
        if (home && home !== f.starId) f.destStarId = home;
      }
      break;
    case "compensation":
      // The price is paid above; the ruler keeps its treaties.
      break;
  }
  // A human who agrees to a computer ruler's request pleases it.
  if (isComputer(state, p.from) && state.players[p.to]?.isHuman) {
    const [lo, hi] = RELATION_EVENTS.agreedToRequest;
    relationEvent(state, lo - 1 + roll(hi - lo + 1), p.to, p.from);
  }
}

/**
 * Refusing a proposal. A computer ruler that refuses a demand may answer with
 * strikes, broken treaties or war (see demandAnswer); refusing a computer
 * ally's call to arms ends the alliance; refusing compensation ends the
 * computer ruler's treaties with you.
 */
export function rejectProposal(state: GameState, p: Proposal, emit?: Emit): void {
  const roll = keyedRoll(state, `${p.id}|reject`);
  if (isDemand(p.kind) && isComputer(state, p.to) && state.players[p.from]?.alive) {
    demandConsequences(state, p, roll, emit);
  }
  if (p.kind === "demandWar" && isComputer(state, p.from) && relation(state, p.from, p.to).status === "alliance") {
    recordBrokenFaith(state, p.to, p.from, "alliance");
    setStatus(state, p.from, p.to, "none");
    exhaustPatience(state, p.from, p.to);
    emit?.({ kind: "diplomacy", playerId: p.to, other: p.from, what: "ended your alliance after you refused to join its war" });
  }
  if (p.kind === "compensation") {
    breakAllTreaties(state, p.to, p.from, roll);
    emit?.({ kind: "diplomacy", playerId: p.to, other: p.from, what: "ended its treaties with you after you refused compensation" });
  }
}

function nearestColonyStar(state: GameState, playerId: PlayerId, from: { x: number; y: number }): Id | null {
  let best: Id | null = null;
  let bestD = Infinity;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId) continue;
    const s = state.galaxy.stars.find((x) => x.id === state.planets[c.planetId]?.starId);
    if (!s) continue;
    const d = distance(s, from);
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

function giveTech(state: GameState, from: PlayerId, to: PlayerId, tech: string, emit?: Emit): void {
  const receiver = state.players[to]!;
  if (!grantTech(receiver, tech)) return;
  emit?.({ kind: "techLearned", playerId: to, techId: tech, tierId: TIER_OF_TECH[tech]?.id ?? "", source: "trade" });
  void from;
}

/** The receiver of a counter-offer pays its price to the ruler who named it. */
function payPrice(state: GameState, payer: PlayerId, payee: PlayerId, price: Price, emit?: Emit): void {
  if (price.bc) {
    state.players[payer]!.bc -= price.bc;
    state.players[payee]!.bc += price.bc;
  }
  if (price.techId) giveTech(state, payer, payee, price.techId, emit);
  if (price.tribute) addTribute(state, payer, payee, price.tribute);
  if (price.starId) cedeSystem(state, payer, payee, price.starId, emit);
}

function addTribute(state: GameState, from: PlayerId, to: PlayerId, percent: number): void {
  state.tributes = (state.tributes ?? []).filter((t) => !(t.from === from && t.to === to));
  state.tributes.push({ from, to, percent });
}

/** Hands every colony a player has at a star to another empire (a gift or a demand). */
export function cedeSystem(state: GameState, from: PlayerId, to: PlayerId, starId: Id, emit?: Emit): void {
  for (const c of coloniesAt(state, from, starId)) {
    c.ownerId = to;
    c.queue = [];
    c.progress = 0;
    emit?.({ kind: "colonyLost", playerId: from, colonyId: c.id, to, how: "invaded" });
    emit?.({ kind: "colonyCaptured", playerId: to, colonyId: c.id, from });
  }
  for (const l of Object.values(state.leaders)) if (l.ownerId === from && l.assignedTo === starId) l.assignedTo = null;
}

/** A non-aggression pact or alliance: strikes are forgotten and each computer side adds its no-war time. */
export function signPact(state: GameState, a: PlayerId, b: PlayerId, kind: "nonAggression" | "alliance"): void {
  setStatus(state, a, b, kind);
  setStrikes(state, a, b, 0);
  setStrikes(state, b, a, 0);
  addTreatyNoWar(state, a, b, NO_WAR_MULT[kind]);
}

/** A trade or research treaty: each side's yield starts at minus the base and ramps up from there. */
export function signTreaty(state: GameState, a: PlayerId, b: PlayerId, kind: "trade" | "research"): void {
  const r = relation(state, a, b);
  writeRelation(state, a, b, { ...r, [kind]: true, [kind === "trade" ? "tradeSince" : "researchSince"]: state.turn });
  addTreatyNoWar(state, a, b, NO_WAR_MULT[kind]);
  const base = treatyBase(state, a, b, kind);
  for (const [x, y] of [[a, b], [b, a]] as const) (((state.treatyYields ??= {})[x] ??= {})[y] ??= {})[kind] = -base;
}

/**
 * Peace, after the original: the relation rises by 50 but no higher than 0,
 * strikes and war losses are forgotten, and neither side may declare war for
 * 30 turns, after which the treaty lapses to no treaty.
 */
export function makePeace(state: GameState, a: PlayerId, b: PlayerId): void {
  setStatus(state, a, b, "peace");
  setRelation(state, a, b, Math.min(attitude(state, a, b) + RELATION_EVENTS.peace.gain, RELATION_EVENTS.peace.max));
  setNoWar(state, a, b, PEACE_TREATY_TURNS);
  setNoWar(state, b, a, PEACE_TREATY_TURNS);
  setStrikes(state, a, b, 0);
  setStrikes(state, b, a, 0);
  clearShipLosses(state, a, b);
}

/** Turns left on a peace treaty between a and b (0 when none). */
export function peaceTurnsLeft(state: GameState, a: PlayerId, b: PlayerId): number {
  if (relation(state, a, b).status !== "peace") return 0;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return state.noWar?.[lo]?.[hi] ?? Math.max(0, (relation(state, a, b).peaceUntil ?? state.turn) - state.turn);
}

/**
 * War, after the original: the relation falls to -75 - d25 on both sides and
 * the baseline by 10 (an estimate: the decoded write may set it to -10
 * instead), treaties and tribute end, strikes and war losses are forgotten,
 * patience runs out and the no-war time is gone. Whoever is to blame (the
 * declarer, unless a computer ruler went to war over your offences) is
 * recorded as having broken faith when a treaty was in force. Allies are not
 * dragged in at once: computer allies join over the next turns (see aiDiplomacy).
 */
export function declareWar(state: GameState, from: PlayerId, to: PlayerId, opts: { blame?: PlayerId; roll?: Roll } = {}): void {
  const before = relation(state, from, to);
  const blamed = opts.blame ?? from;
  const wronged = blamed === from ? to : from;
  const roll = opts.roll ?? keyedRoll(state, `war${state.turn}|${from}|${to}`);
  if (before.status === "peace" || before.status === "nonAggression" || before.status === "alliance") recordBrokenFaith(state, blamed, wronged, before.status);
  else if (before.trade || before.research) recordBrokenFaith(state, blamed, wronged, before.research ? "research" : "trade");
  setStatus(state, from, to, "war");
  const W = RELATION_EVENTS.declareWar;
  setRelation(state, from, to, W.set - roll(W.roll));
  setBaseline(state, from, to, baselineOf(state, from, to) + W.baseline);
  setBaseline(state, to, from, baselineOf(state, to, from) + W.baseline);
  setStrikes(state, from, to, 0);
  setStrikes(state, to, from, 0);
  clearShipLosses(state, from, to);
  exhaustPatience(state, from, to);
  setNoWar(state, from, to, 0);
  setNoWar(state, to, from, 0);
}

export type TreatyName = "trade" | "research" | "nonAggression" | "alliance" | "tribute";

/** Ending a research treaty, after the original: relation -(d20 + d20), baseline -d20. */
function researchBreak(state: GameState, a: PlayerId, b: PlayerId, roll: Roll): void {
  const R = RELATION_EVENTS.researchBreak;
  setRelation(state, a, b, attitude(state, a, b) - (roll(R.roll) + roll(R.roll)));
  const drop = roll(R.baselineRoll);
  setBaseline(state, a, b, baselineOf(state, a, b) - drop);
  setBaseline(state, b, a, baselineOf(state, b, a) - drop);
}

/** Breaking faith, after the original: the wronged side holds one more strike, patience runs out, no-war time is gone. */
function brokeFaith(state: GameState, blamed: PlayerId, wronged: PlayerId, treaty: string): void {
  recordBrokenFaith(state, blamed, wronged, treaty);
  if (isComputer(state, wronged)) setStrikes(state, wronged, blamed, strikesOf(state, wronged, blamed) + 1);
  exhaustPatience(state, blamed, wronged);
  setNoWar(state, blamed, wronged, 0);
  setNoWar(state, wronged, blamed, 0);
}

/** Ends one treaty without going to war. */
export function breakTreaty(state: GameState, from: PlayerId, to: PlayerId, treaty: TreatyName, roll: Roll = keyedRoll(state, `break${state.turn}|${from}|${to}|${treaty}`)): void {
  const r = relation(state, from, to);
  brokeFaith(state, from, to, treaty);
  switch (treaty) {
    case "trade":
      writeRelation(state, from, to, { ...r, trade: false });
      clearYields(state, from, to, "trade");
      break;
    case "research":
      writeRelation(state, from, to, { ...r, research: false });
      clearYields(state, from, to, "research");
      researchBreak(state, from, to, roll);
      break;
    case "nonAggression":
    case "alliance":
      setStatus(state, from, to, "none");
      break;
    case "tribute":
      state.tributes = (state.tributes ?? []).filter((t) => !(t.from === from && t.to === to));
      break;
  }
}

/** Every treaty between the two ends, `blamed` taking the blame (strikes, a refused compensation or demand). */
export function breakAllTreaties(state: GameState, blamed: PlayerId, wronged: PlayerId, roll: Roll): void {
  const r = relation(state, blamed, wronged);
  if (r.status === "nonAggression" || r.status === "alliance") breakTreaty(state, blamed, wronged, r.status, roll);
  if (r.research) breakTreaty(state, blamed, wronged, "research", roll);
  if (r.trade) breakTreaty(state, blamed, wronged, "trade", roll);
}

/** A computer ruler with two strikes asks you to pay for its grievances; false when there is nothing to ask. */
export function offerCompensation(state: GameState, ai: PlayerId, human: PlayerId): boolean {
  const id = proposalId(state.turn, ai, human, "compensation");
  if (state.proposals.some((p) => p.id === id)) return false;
  // The original asks at level 6 through the same price routine; which options it allows here is not decoded, so like a pact (BC or a tech).
  const price = counterPrice(state, ai, human, 6, id, "nonAggression");
  if (!price) return false;
  state.proposals.push({ id, from: ai, to: human, kind: "compensation", turn: state.turn, price });
  return true;
}

/** Whether `from` has that treaty with `to` to break. */
export function hasTreaty(state: GameState, from: PlayerId, to: PlayerId, treaty: TreatyName): boolean {
  const r = relation(state, from, to);
  switch (treaty) {
    case "trade":
      return r.trade;
    case "research":
      return r.research;
    case "nonAggression":
    case "alliance":
      return r.status === treaty;
    case "tribute":
      return (state.tributes ?? []).some((t) => t.from === from && t.to === to);
  }
}

export interface Gift {
  bc?: number;
  techId?: string;
  starId?: Id;
  /** Start paying a standing tribute of this percentage. */
  tribute?: number;
}

export function giftProblem(state: GameState, from: PlayerId, to: PlayerId, gift: Gift): string | null {
  const pf = state.players[from]!;
  const pt = state.players[to];
  if (!pt || pt.kind !== "empire" || !pt.alive || to === from) return "no such empire";
  if (!pf.contacts.includes(to)) return "no contact";
  if (gift.bc !== undefined && (!(gift.bc > 0) || gift.bc > pf.bc)) return "not enough BC";
  if (gift.techId !== undefined && (!pf.techs.includes(gift.techId) || pt.techs.includes(gift.techId) || !TIER_OF_TECH[gift.techId])) {
    return "cannot give that technology";
  }
  if (gift.starId !== undefined && coloniesAt(state, from, gift.starId).length === 0) return "you have no colony there";
  if (gift.tribute !== undefined && !TRIBUTE_PERCENTS.includes(gift.tribute as 5 | 10)) return "tribute is 5% or 10%";
  if (gift.bc === undefined && gift.techId === undefined && gift.starId === undefined && gift.tribute === undefined) return "empty gift";
  return null;
}

/**
 * What a gift is worth to a computer ruler (the original's m): BC / max(its
 * expenses, 10) / 10, at most 8; a technology 5 x its level / the ruler's best
 * level; a tribute 2; a system its population / 2 + 1 (an estimate). Each
 * point raises the relation by 4 + d4 and the baseline by 1.
 */
export function giftWorth(state: GameState, from: PlayerId, to: PlayerId, gift: Gift): number {
  const G = RELATION_EVENTS.gift;
  let m = 0;
  if (gift.bc) m += Math.min(G.maxBc, Math.trunc(Math.trunc(gift.bc / Math.max(G.minExpenses, empireExpenses(state, to))) / 10));
  if (gift.techId) m += Math.trunc((G.techPerLevel * (TIER_OF_TECH[gift.techId]?.level ?? 1)) / bestTechLevel(state, to));
  if (gift.tribute) m += G.tribute;
  if (gift.starId) m += Math.trunc(coloniesAt(state, from, gift.starId).reduce((s, c) => s + population(c), 0) / 2) + 1;
  return m;
}

export function giveGift(state: GameState, from: PlayerId, to: PlayerId, gift: Gift, emit?: Emit): void {
  const pf = state.players[from]!;
  const pt = state.players[to]!;
  const m = giftWorth(state, from, to, gift);
  if (gift.bc) {
    pf.bc -= gift.bc;
    pt.bc += gift.bc;
  }
  if (gift.techId) giveTech(state, from, to, gift.techId, emit);
  if (gift.starId) cedeSystem(state, from, to, gift.starId, emit);
  if (gift.tribute) addTribute(state, from, to, gift.tribute);
  if (!pt.isHuman && m > 0) {
    const G = RELATION_EVENTS.gift;
    const roll = keyedRoll(state, `gift${state.turn}|${from}|${to}`);
    setRelation(state, from, to, Math.min(RELATION.max, attitude(state, to, from) + m * (roll(G.roll) + G.rollBase)));
    setBaseline(state, to, from, Math.min(RELATION.max, baselineOf(state, to, from) + m));
    // A gift puts off the ruler's next visit.
    const clock = (state.audienceClock ??= {})[to] ??= {};
    clock[from] = Math.trunc((clock[from] ?? 0) / m);
  }
  emit?.({ kind: "diplomacy", playerId: to, other: from, what: "sent you a gift" });
}

/**
 * Once per turn: make contact, recover patience, run the relation rules and
 * the computer empires' dealings among themselves, ramp treaty yields, pay
 * tribute and expire old proposals.
 */
export function diplomacyTick(state: GameState, rng: Rng, emit?: Emit): void {
  updateContacts(state, emit);
  recoverPatience(state);
  relationsTick(state, rng, emit);
  aiDiplomacyTick(state, rng, emit);
  rampTreaties(state, rngRoll(rng));
  payTributes(state, emit);
  state.proposals = state.proposals.filter((p) => state.turn - p.turn < PROPOSAL_LIFETIME);
}

/** Standing tributes: a share of the payer's income every turn. */
export function tributeAmount(state: GameState, from: PlayerId, percent: number): number {
  return Math.round(Math.max(0, empireTotals(state, from).bcIncome) * percent) / 100;
}

function payTributes(state: GameState, emit?: Emit): void {
  state.tributes = (state.tributes ?? []).filter((t) => state.players[t.from]?.alive && state.players[t.to]?.alive);
  for (const t of state.tributes) {
    const payer = state.players[t.from]!;
    const amount = Math.min(Math.max(0, payer.bc), tributeAmount(state, t.from, t.percent));
    payer.bc = Math.round((payer.bc - amount) * 10) / 10;
    state.players[t.to]!.bc = Math.round((state.players[t.to]!.bc + amount) * 10) / 10;
    void emit;
  }
}

/**
 * Empires meet when their ships could reach each other's colonies (one's
 * colonies lie within the other's fuel range of its own), or when their
 * scanners see each other's ships.
 */
export function updateContacts(state: GameState, emit?: Emit): void {
  const list = empires(state).filter((p) => p.alive);
  const colonyStars = new Map<PlayerId, { x: number; y: number }[]>();
  const eyes = new Map<PlayerId, { x: number; y: number }[]>();
  for (const p of list) {
    const stars: { x: number; y: number }[] = [];
    for (const c of Object.values(state.colonies)) {
      if (c.ownerId !== p.id) continue;
      const s = state.galaxy.stars.find((x) => x.id === state.planets[c.planetId]?.starId);
      if (s) stars.push(s);
    }
    colonyStars.set(p.id, stars);
    eyes.set(p.id, [...stars, ...Object.values(state.fleets).filter((f) => f.ownerId === p.id)]);
  }
  const meet = (a: PlayerId, b: PlayerId) => {
    state.players[a]!.contacts.push(b);
    emit?.({ kind: "diplomacy", playerId: a, other: b, what: "made contact with you" });
    if (state.players[b]!.contacts.includes(a)) return;
    state.players[b]!.contacts.push(a);
    emit?.({ kind: "diplomacy", playerId: b, other: a, what: "made contact with you" });
    firstContact(state, a, b);
  };
  for (const a of list) {
    const reach = Math.max(fleetRange(a), scanRange(a) + 1);
    for (const b of list) {
      if (a.id === b.id || a.contacts.includes(b.id)) continue;
      const mine = colonyStars.get(a.id)!;
      const reachable = colonyStars.get(b.id)!.some((y) => mine.some((x) => distance(x, y) <= reach));
      const seen = eyes.get(a.id)!.some((x) => eyes.get(b.id)!.some((y) => distance(x, y) <= scanRange(a) + 1));
      if (reachable || seen) meet(a.id, b.id);
    }
  }
}

// ---------------------------------------------------------------- trade and research treaties

/**
 * An empire's population of its own kind for treaties: everyone who holds a
 * job except natives and androids (android scientists count for research).
 * In a player's view, a treaty partner's comes from `knownTreatyPop`.
 */
export function treatyPopulation(state: GameState, playerId: PlayerId, kind: "trade" | "research"): number {
  const known = (state as { knownTreatyPop?: Record<PlayerId, { trade: number; research: number }> }).knownTreatyPop?.[playerId];
  if (known) return known[kind];
  let n = 0;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== playerId || c.outpost) continue;
    n += Math.max(0, population(c) - (c.natives ?? 0));
    if (kind === "research") n += androids(c).scientists;
  }
  return n;
}

const pirated = (state: GameState, playerId: PlayerId) => (state.activeEvents ?? []).some((e) => e.kind === "pirates" && e.playerId === playerId);

/**
 * The unscaled base of a treaty between a and b: half the smaller partner's
 * population; trade halved again while pirates prey on either (the original
 * halves for one random event that is probably its pirates: an estimate).
 */
export function treatyBase(state: GameState, a: PlayerId, b: PlayerId, kind: "trade" | "research"): number {
  const base = Math.trunc(Math.min(treatyPopulation(state, a, kind), treatyPopulation(state, b, kind)) / TREATY_YIELD.baseDivisor);
  if (kind === "trade" && (pirated(state, a) || pirated(state, b))) return Math.trunc(base / TREATY_YIELD.piratesDivisor);
  return base;
}

/**
 * What a treaty with b yields a each turn at full strength: the base times a's
 * government's BC multiplier, +50% for Fantastic Traders and the best Trader
 * leader's skill (trade), or times the government's research multiplier (research).
 */
export function treatyTarget(state: GameState, a: PlayerId, b: PlayerId, kind: "trade" | "research"): number {
  const p = state.players[a]!;
  const gov = GOVERNMENTS[p.government];
  const base = treatyBase(state, a, b, kind);
  if (kind === "research") return Math.trunc(base * gov.researchMult);
  const points = Math.round(gov.bcMult * 100) + (hasTrait(getRace(p.raceId), "fantasticTraders") ? TREATY_YIELD.traderPoints : 0) + leaderTradeBonus(state, a);
  return Math.trunc((base * points) / 100);
}

export interface TreatyIncome {
  bc: number;
  research: number;
}

/** What a's trade and research treaties with b yield a this turn: trade in BC, research in research points (its setup cost in BC). */
export function treatyYield(state: GameState, a: PlayerId, b: PlayerId): TreatyIncome {
  const r = relation(state, a, b);
  const out: TreatyIncome = { bc: 0, research: 0 };
  const row = state.treatyYields?.[a]?.[b];
  if (r.trade) out.bc += row?.trade ?? treatyTarget(state, a, b, "trade");
  if (r.research) {
    const v = row?.research ?? treatyTarget(state, a, b, "research");
    if (v < 0) out.bc += v;
    else out.research += v;
  }
  return out;
}

export function treatyIncome(state: GameState, playerId: PlayerId): TreatyIncome {
  const out: TreatyIncome = { bc: 0, research: 0 };
  for (const other of empires(state)) {
    if (other.id === playerId || !other.alive) continue;
    const y = treatyYield(state, playerId, other.id);
    out.bc += y.bc;
    out.research += y.research;
  }
  return out;
}

/** One ramp step: toward the full value by a fifth of it (the remainder rounds up by chance); above it, straight down. */
export function rampStep(current: number, target: number, roll: Roll): number {
  if (current >= target) return target;
  const rest = target % TREATY_YIELD.rampSteps;
  const step = Math.trunc(target / TREATY_YIELD.rampSteps) + (rest !== 0 && roll(TREATY_YIELD.rampSteps) <= rest ? 1 : 0);
  return Math.min(target, current + step);
}

function rampTreaties(state: GameState, roll: Roll): void {
  const list = empires(state).filter((p) => p.alive);
  for (const a of list) {
    for (const b of list) {
      if (a.id === b.id) continue;
      const r = relation(state, a.id, b.id);
      for (const kind of ["trade", "research"] as const) {
        if (!r[kind]) continue;
        const target = treatyTarget(state, a.id, b.id, kind);
        const row = (((state.treatyYields ??= {})[a.id] ??= {})[b.id] ??= {});
        row[kind] = rampStep(row[kind] ?? target, target, roll);
      }
    }
  }
}

// ---------------------------------------------------------------- demands and peace offers

/** How a's number compares to b's, as the original's ratios: 100 x a / b - 100 when a is bigger, else 100 - 100 x b / a, held to -300..300. */
function compare(a: number, b: number): number {
  const x = Math.max(1, a);
  const y = Math.max(1, b);
  const v = x >= y ? Math.trunc((100 * x) / y) - 100 : 100 - Math.trunc((100 * y) / x);
  return Math.max(-DEMAND_ANSWER.ratioCap, Math.min(DEMAND_ANSWER.ratioCap, v));
}

function sizeOf(state: GameState, playerId: PlayerId): number {
  let n = 0;
  for (const c of Object.values(state.colonies)) if (c.ownerId === playerId) n += population(c) + androids(c).farmers + androids(c).workers + androids(c).scientists;
  return n;
}

export interface DemandAnswer {
  score: number;
  parts: { why: string; value: number }[];
  /** What a refusal brings: nothing, a strike, a strike and broken treaties, or war. */
  outcome: "accept" | "refuse" | "strike" | "breakTreaties" | "war";
}

/**
 * How a computer ruler answers a demand, after the original: d200 + how your
 * fleets, size and technology compare to its own + your patience left + 2 x
 * its temperament + what the demand costs it. See DEMAND_ANSWER for the bands.
 * With `roll` null the die is left out.
 */
export function demandAnswer(state: GameState, p: Proposal, roll: number | null = fixedRoll(state, `${p.id}|demand`, DEMAND_ANSWER.die)): DemandAnswer {
  const ai = p.to;
  const you = p.from;
  const parts: { why: string; value: number }[] = [];
  const add = (why: string, value: number) => {
    if (value) parts.push({ why, value: Math.trunc(value) });
  };
  const power = Math.trunc((compare(fleetPower(state, you), fleetPower(state, ai)) + compare(sizeOf(state, you), sizeOf(state, ai)) +
    compare(state.players[you]!.techs.length, state.players[ai]!.techs.length)) / 3);
  add("your power against theirs (fleets, size, technology)", power);
  add("patience worn by earlier asks", Math.min(0, ...Object.values(askTally(state, you, ai))));
  add("their temperament (counts twice)", 2 * persOf(state, ai, you));
  const third = p.third;
  const D = DEMAND_ANSWER;
  switch (p.kind) {
    case "demandWar": {
      if (third === undefined) break;
      const st = relation(state, ai, third).status;
      add("what war on them costs", st === "alliance" ? D.war.alliance : st === "nonAggression" || st === "peace" ? D.war.nonAggression : D.war.none);
      add("how they feel about them", -Math.trunc(attitude(state, ai, third) / 2));
      add("how their fleets compare", -Math.trunc(compare(fleetPower(state, ai), fleetPower(state, third)) / 4));
      if (isComputer(state, third)) add("they are a computer empire", -D.war.computer);
      break;
    }
    case "demandPeace":
      // Which of the original's demand types this is is an estimate.
      add("what peace with them costs", -((third !== undefined ? persOf(state, third, ai) : 0) + D.peaceBase));
      break;
    case "demandBreakAlliance":
      add("how they feel about their ally", third !== undefined ? -2 * attitude(state, ai, third) : 0);
      break;
    case "demandTech": {
      // The original weighs the tech's value against theirs; StarLord compares it with the average tech they know (an estimate).
      const known = state.players[ai]!.techs.map((t) => TIER_OF_TECH[t]?.cost ?? 0).filter((c) => c > 0);
      const avg = known.length ? known.reduce((s, c) => s + c, 0) / known.length : 1;
      add("what the technology is worth to them", -Math.min(D.systemCap, Math.trunc((100 * (TIER_OF_TECH[p.wantTechId ?? ""]?.cost ?? 0)) / Math.max(1, avg))));
      break;
    }
    case "demandSystem": {
      const pop = p.starId ? coloniesAt(state, ai, p.starId).reduce((s, c) => s + population(c), 0) : 0;
      add("what the system is worth to them", -Math.min(D.systemCap, Math.trunc((pop * 1000) / Math.max(1, sizeOf(state, ai)))));
      break;
    }
    default:
      add("what the demand costs them", D.other);
  }
  if (roll !== null) parts.push({ why: "their mood today (d200)", value: roll });
  const score = parts.reduce((s, x) => s + x.value, 0);
  const pact = ["nonAggression", "alliance"].includes(relation(state, ai, you).status);
  const dishonored = isDishonored(state, ai, you);
  let outcome: DemandAnswer["outcome"];
  if (pact) {
    outcome = score <= D.pact.war || dishonored ? "war" : score <= D.pact.breakTreaties ? "breakTreaties"
      : score <= D.pact.strike ? "strike" : score <= D.pact.refuse ? "refuse" : "accept";
  } else {
    outcome = score <= D.none.war || dishonored ? "war" : score <= D.none.strike ? "strike" : score <= D.none.refuse ? "refuse" : "accept";
  }
  return { score, parts, outcome };
}

/** What a computer ruler does after refusing a demand. */
function demandConsequences(state: GameState, p: Proposal, roll: Roll, emit?: Emit): void {
  const a = demandAnswer(state, p);
  const ai = p.to;
  const you = p.from;
  switch (a.outcome) {
    case "war":
      declareWar(state, ai, you, { blame: you, roll });
      emit?.({ kind: "diplomacy", playerId: you, other: ai, what: "answered your demand by declaring war on you" });
      break;
    case "breakTreaties":
      setStrikes(state, ai, you, strikesOf(state, ai, you) + 1);
      breakAllTreaties(state, you, ai, roll);
      emit?.({ kind: "diplomacy", playerId: you, other: ai, what: "answered your demand by ending its treaties with you" });
      break;
    case "strike":
      setStrikes(state, ai, you, strikesOf(state, ai, you) + 1);
      setBaseline(state, ai, you, baselineOf(state, ai, you) + DEMAND_ANSWER.strikeBaseline);
      emit?.({ kind: "diplomacy", playerId: you, other: ai, what: "warns you: one more demand like that and there will be consequences" });
      break;
    default:
      break;
  }
}

/**
 * Whether a computer ruler offers peace this turn and on what terms, after
 * the original (see AI_PEACE): S weighs the wars both fight, the fleets, the
 * systems held, trust, reputation, the losses (K) and temperament.
 */
export function peaceWish(state: GameState, ai: PlayerId, you: PlayerId): { score: number; chance: number; turns: number } {
  const r = relation(state, ai, you);
  const t = state.turn - r.since - (AI_PEACE.minTurns - 1);
  if (r.status !== "war" || t < 1) return { score: 0, chance: 0, turns: Math.max(0, t) };
  let third = 0;
  for (const k of empires(state)) {
    if (k.id === ai || k.id === you || !k.alive || relation(state, k.id, you).status !== "war") continue;
    third += occupiedBy(state, you, k.id);
  }
  const s = 5 * otherWarCount(state, ai, you) - 5 * otherWarCount(state, you, ai) + Math.trunc(strengthRatio(state, ai, you) / 10) - 10 +
    40 * occupiedBy(state, you, ai) - 20 * occupiedBy(state, ai, you) + reputationOf(state, ai, you) + Math.trunc(trustIn(state, ai, you) / 2) +
    Math.trunc(peaceLossTerm(state, ai, you) / 10) - Math.trunc(persOf(state, ai, you) / 5) + 20 * third;
  const chance = s < 0 ? -s * t : t / Math.sqrt(s + 3);
  return { score: s, chance: Math.min(100, chance), turns: t };
}

function otherWarCount(state: GameState, a: PlayerId, b: PlayerId): number {
  return empires(state).filter((p) => p.id !== a && p.id !== b && p.alive && relation(state, a, p.id).status === "war").length;
}

/** The price a computer ruler asks for peace when it is winning (S over 10): level (S - 10) / 5 + 2. */
export function peacePriceLevel(score: number): number {
  return Math.trunc((score - AI_PEACE.askAbove) / AI_PEACE.priceStep) + AI_PEACE.priceBase;
}

// ---------------------------------------------------------------- surrender and outrage

/**
 * Surrender: everything the empire has (colonies, ships, technology, treasury,
 * leaders) passes to the chosen empire and the surrendering empire leaves the game.
 */
export function surrenderEmpire(state: GameState, from: PlayerId, to: PlayerId, emit?: Emit): void {
  const loser = state.players[from]!;
  const winner = state.players[to]!;
  for (const c of Object.values(state.colonies)) {
    if (c.ownerId !== from) continue;
    c.ownerId = to;
    c.queue = [];
    c.progress = 0;
    emit?.({ kind: "colonyCaptured", playerId: to, colonyId: c.id, from });
  }
  for (const f of Object.values(state.fleets)) {
    if (f.ownerId !== from) continue;
    f.ownerId = to;
    f.ships = f.ships.map((s) => {
      const design = loser.designs.find((d) => d.id === s.designId);
      if (!design) return s;
      const id = `sur${from}-${design.id}`;
      if (!winner.designs.some((d) => d.id === id)) winner.designs.push({ ...structuredClone(design), id, name: `${design.name} (${loser.name})`, obsolete: true });
      return { designId: id, count: s.count };
    });
    delete f.invadeTarget;
    f.destStarId = f.starId ? null : nearestColonyStar(state, to, f);
  }
  for (const l of Object.values(state.leaders)) {
    if (l.ownerId === from) {
      l.ownerId = to;
      l.assignedTo = l.kind === "captain" ? l.assignedTo : null;
    }
  }
  winner.bc += Math.max(0, loser.bc);
  loser.bc = 0;
  state.tributes = (state.tributes ?? []).filter((t) => t.from !== from && t.to !== from);
  for (const p of empires(state)) {
    if (p.id !== from && p.alive) emit?.({ kind: "diplomacy", playerId: p.id, other: from, what: `surrendered to ${winner.name}` });
  }
}

/** Population that votes at the council: everyone, androids and natives included. */
export function votingPopulation(state: GameState, playerId: PlayerId): number {
  return sizeOf(state, playerId);
}

