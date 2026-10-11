import { DIFFICULTIES } from "./data/galaxy.js";
import {
  ATTITUDE, ATTITUDE_EVENTS, AUDIENCE_ITEMS,
  PEACE_TREATY_TURNS, PROPOSAL_LIFETIME, TREATY_YIELD, TRIBUTE_PERCENTS,
} from "./data/diplomacy.js";
import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { leaderTradeBonus } from "./leaders.js";
import { treatyIncomeMult } from "./raceEffects.js";
import { getRace, hasTrait } from "./data/races.js";
import { TIER_OF_TECH } from "./data/techs.js";
import type { Emit } from "./context.js";
import { empireTotals } from "./economy.js";
import { empireBonus, empires, fleetRange, grantTech, scanRange } from "./empire.js";
import { distance } from "./galaxy.js";
import type { DiplomaticStatus, GameState, Id, PlayerId, Proposal, ProposalKind, Relation } from "./types.js";

/**
 * Relations between empires, after the original: a status (no treaty, war,
 * peace treaty, non-aggression pact, alliance) plus independent trade and
 * research treaties and tribute. Each empire also feels an attitude toward
 * every other (-100..100) that drifts toward a baseline set by treaties,
 * borders, wars, race traits and difficulty; the AI uses it to decide what to
 * accept and whom to attack. Proposals cover treaties, tech exchanges and
 * demands; gifts and surrender happen at once.
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

export function setStatus(state: GameState, a: PlayerId, b: PlayerId, status: DiplomaticStatus): void {
  const r: Relation = { ...relation(state, a, b), status, since: state.turn };
  delete r.peaceUntil;
  if (status === "war") {
    // War cancels every treaty, tribute included.
    r.trade = false;
    r.research = false;
    state.tributes = (state.tributes ?? []).filter((t) => !((t.from === a && t.to === b) || (t.from === b && t.to === a)));
  }
  if (status === "peace") r.peaceUntil = state.turn + PEACE_TREATY_TURNS;
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

export function attitude(state: GameState, a: PlayerId, b: PlayerId): number {
  return state.attitude[a]?.[b] ?? 0;
}

function shiftAttitude(state: GameState, a: PlayerId, b: PlayerId, delta: number): void {
  const row = (state.attitude[a] ??= {});
  row[b] = Math.max(-100, Math.min(100, Math.round(((row[b] ?? 0) + delta) * 10) / 10));
}

/**
 * Changes how a feels about b after something b did. Charismatic races get
 * double the good effects and half the bad ones.
 */
export function adjustAttitude(state: GameState, a: PlayerId, b: PlayerId, delta: number): void {
  const pb = state.players[b];
  if (pb?.kind === "empire" && hasTrait(getRace(pb.raceId), "charismatic")) delta *= delta > 0 ? TRAIT_EFFECTS.charismaticGood : TRAIT_EFFECTS.charismaticBad;
  shiftAttitude(state, a, b, delta);
}

/** Attitude change toward `actor` felt by every other living empire. */
function everyoneFeels(state: GameState, actor: PlayerId, delta: number, except: PlayerId[] = []): void {
  for (const p of empires(state)) {
    if (p.id === actor || !p.alive || except.includes(p.id)) continue;
    adjustAttitude(state, p.id, actor, delta);
  }
}

/**
 * Extra weight a proposer's deals carry with the other side: Xeno Psychology,
 * charismatic (+50% acceptance) and telepathic (+25% diplomacy) races.
 */
export function dealBonus(state: GameState, proposer: PlayerId): number {
  const p = state.players[proposer]!;
  const race = getRace(p.raceId);
  return empireBonus(p).diplomacy + (hasTrait(race, "charismatic") ? TRAIT_EFFECTS.charismaticDiplomacy : 0) +
    (hasTrait(race, "telepathic") ? TRAIT_EFFECTS.telepathicDiplomacy : 0);
}

function repulsivePair(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return hasTrait(getRace(state.players[a]!.raceId), "repulsive") || hasTrait(getRace(state.players[b]!.raceId), "repulsive");
}

export type ProposalTerms = Pick<Proposal, "techId" | "wantTechId" | "starId" | "third" | "percent">;

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
  const third = terms.third !== undefined ? state.players[terms.third] : undefined;
  const validThird = () => !!third && third.kind === "empire" && third.alive && third.id !== from && third.id !== to;
  switch (kind) {
    case "ceasefire":
    case "peace":
      return r.status === "war" ? null : "not at war";
    case "nonAggression":
      return r.status === "nonAggression" || r.status === "alliance" ? "already pledged" : null;
    case "alliance":
      return r.status === "alliance" ? "already allied" : null;
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

export function audienceTired(state: GameState, from: PlayerId, to: PlayerId): boolean {
  return audienceItems(state, from, to) >= AUDIENCE_ITEMS;
}

export function isDemand(kind: ProposalKind): boolean {
  return kind.startsWith("demand");
}

/** Carries out an accepted proposal. */
export function acceptProposal(state: GameState, p: Proposal, emit?: Emit): void {
  const r = relation(state, p.from, p.to);
  switch (p.kind) {
    case "ceasefire":
    case "peace":
      setStatus(state, p.from, p.to, "peace");
      break;
    case "nonAggression":
      setStatus(state, p.from, p.to, "nonAggression");
      break;
    case "alliance":
      setStatus(state, p.from, p.to, "alliance");
      break;
    case "trade":
      writeRelation(state, p.from, p.to, { ...r, trade: true, tradeSince: state.turn });
      break;
    case "research":
      writeRelation(state, p.from, p.to, { ...r, research: true, researchSince: state.turn });
      break;
    case "techExchange":
      giveTech(state, p.from, p.to, p.techId!, emit);
      giveTech(state, p.to, p.from, p.wantTechId!, emit);
      adjustAttitude(state, p.to, p.from, ATTITUDE_EVENTS.techExchange);
      adjustAttitude(state, p.from, p.to, ATTITUDE_EVENTS.techExchange);
      return;
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
      declareWar(state, p.to, p.third!);
      emit?.({ kind: "diplomacy", playerId: p.third!, other: p.to, what: "declared war on you" });
      break;
    case "demandPeace":
      setStatus(state, p.to, p.third!, "peace");
      emit?.({ kind: "diplomacy", playerId: p.third!, other: p.to, what: "made peace with you" });
      break;
    case "demandBreakAlliance":
      setStatus(state, p.to, p.third!, "none");
      adjustAttitude(state, p.third!, p.to, ATTITUDE_EVENTS.brokeAlliance);
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
  }
  if (isDemand(p.kind)) {
    adjustAttitude(state, p.to, p.from, ATTITUDE_EVENTS.demandMet);
  } else {
    adjustAttitude(state, p.from, p.to, ATTITUDE_EVENTS.acceptedTreaty);
    adjustAttitude(state, p.to, p.from, ATTITUDE_EVENTS.acceptedTreaty);
  }
}

/** Refusing a proposal; refused demands sour the demander. */
export function rejectProposal(state: GameState, p: Proposal): void {
  adjustAttitude(state, p.from, p.to, isDemand(p.kind) ? ATTITUDE_EVENTS.demandRefused : ATTITUDE_EVENTS.rejectedProposal);
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

export function declareWar(state: GameState, from: PlayerId, to: PlayerId): void {
  const before = relation(state, from, to);
  const brokePeace = (before.peaceUntil ?? 0) > state.turn;
  setStatus(state, from, to, "war");
  adjustAttitude(state, to, from, ATTITUDE_EVENTS.declaredWar + (brokePeace ? ATTITUDE_EVENTS.brokePeace : 0));
  for (const other of empires(state)) {
    if (other.id === from || other.id === to || !other.alive) continue;
    // Breaking a treaty sours everyone; friends of the victim more so; breaking a peace treaty most of all.
    if (before.status !== "none" && before.status !== "war") adjustAttitude(state, other.id, from, ATTITUDE_EVENTS.brokeTreatyOthers);
    if (brokePeace) adjustAttitude(state, other.id, from, ATTITUDE_EVENTS.brokePeaceOthers);
    if (attitude(state, other.id, to) > ATTITUDE_EVENTS.likedVictimThreshold) adjustAttitude(state, other.id, from, ATTITUDE_EVENTS.likedVictim);
    if (relation(state, other.id, to).status === "alliance" && relation(state, other.id, from).status !== "war") {
      setStatus(state, other.id, from, "war");
    }
  }
}

export type TreatyName = "trade" | "research" | "nonAggression" | "alliance" | "tribute";

/** Ends one treaty without going to war. */
export function breakTreaty(state: GameState, from: PlayerId, to: PlayerId, treaty: TreatyName): void {
  const r = relation(state, from, to);
  switch (treaty) {
    case "trade":
      writeRelation(state, from, to, { ...r, trade: false });
      break;
    case "research":
      writeRelation(state, from, to, { ...r, research: false });
      break;
    case "nonAggression":
    case "alliance":
      setStatus(state, from, to, "none");
      break;
    case "tribute":
      state.tributes = (state.tributes ?? []).filter((t) => !(t.from === from && t.to === to));
      break;
  }
  adjustAttitude(state, to, from, treaty === "alliance" ? ATTITUDE_EVENTS.brokeAlliance : ATTITUDE_EVENTS.brokeTreaty);
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

export function giveGift(state: GameState, from: PlayerId, to: PlayerId, gift: Gift, emit?: Emit): void {
  const pf = state.players[from]!;
  const pt = state.players[to]!;
  let warmth = 0;
  if (gift.bc) {
    pf.bc -= gift.bc;
    pt.bc += gift.bc;
    warmth += Math.min(ATTITUDE_EVENTS.giftBcCap, gift.bc * ATTITUDE_EVENTS.giftPerBc);
  }
  if (gift.techId) {
    giveTech(state, from, to, gift.techId, emit);
    warmth += ATTITUDE_EVENTS.giftTech;
  }
  if (gift.starId) {
    cedeSystem(state, from, to, gift.starId, emit);
    warmth += ATTITUDE_EVENTS.giftSystem;
  }
  if (gift.tribute) addTribute(state, from, to, gift.tribute);
  adjustAttitude(state, to, from, warmth);
  emit?.({ kind: "diplomacy", playerId: to, other: from, what: "sent you a gift" });
}

/** One reason for how a feels about b, with its weight in attitude points. */
export interface AttitudePart {
  why: string;
  value: number;
}

/** What a's baseline attitude toward b is made of; attitude drifts toward its sum. */
export function attitudeParts(state: GameState, a: PlayerId, b: PlayerId): AttitudePart[] {
  const r = relation(state, a, b);
  const pa = state.players[a]!;
  const pb = state.players[b]!;
  const raceB = getRace(pb.raceId);
  const raceA = getRace(pa.raceId);
  const parts: AttitudePart[] = [];
  const add = (why: string, value: number) => {
    if (value !== 0) parts.push({ why, value });
  };
  if (hasTrait(raceB, "charismatic")) add("charismatic race", ATTITUDE.charismatic);
  if (hasTrait(raceB, "repulsive")) add("repulsive race", ATTITUDE.repulsive);
  if (raceA.id === raceB.id) add("same race", ATTITUDE.sameRace);
  const held = Math.floor(Math.max(0, state.turn - r.since) / ATTITUDE.pactWarmthTurns);
  if (r.status === "war") add("at war", ATTITUDE.war);
  if (r.status === "alliance") add("alliance", ATTITUDE.alliance + Math.min(ATTITUDE.allianceWarmthCap, held));
  if (r.status === "nonAggression") add("non-aggression pact", ATTITUDE.nonAggression + Math.min(ATTITUDE.nonAggressionWarmthCap, held));
  if (r.status === "peace") add("peace treaty", ATTITUDE.peace);
  if (r.trade) add("trade treaty", ATTITUDE.treaty);
  if (r.research) add("research treaty", ATTITUDE.treaty);
  if ((state.tributes ?? []).some((t) => t.from === b && t.to === a)) add("tribute paid to them", ATTITUDE.tributePaid);
  if (bordersTouch(state, a, b)) add("shared border", ATTITUDE.borders);
  let shared = 0;
  for (const c of empires(state)) {
    if (c.id === a || c.id === b || !c.alive) continue;
    if (relation(state, a, c.id).status === "war" && relation(state, b, c.id).status === "war") shared += ATTITUDE.sharedEnemy;
  }
  add("common enemies", shared);
  // Difficulty: computer empires are friendlier (or hostile) toward human players.
  if (!pa.isHuman && pb.isHuman) add("difficulty level", DIFFICULTIES[state.settings.difficulty ?? "average"].aiAttitudeToHumans);
  return parts;
}

/** Baseline attitude a feels towards b before drift. */
export function attitudeBaseline(state: GameState, a: PlayerId, b: PlayerId): number {
  return attitudeParts(state, a, b).reduce((sum, p) => sum + p.value, 0);
}

function bordersTouch(state: GameState, a: PlayerId, b: PlayerId): boolean {
  const starsOf = (p: PlayerId) =>
    Object.values(state.colonies)
      .filter((c) => c.ownerId === p)
      .map((c) => state.galaxy.stars.find((s) => s.id === state.planets[c.planetId]?.starId))
      .filter((s) => !!s);
  const sa = starsOf(a);
  const sb = starsOf(b);
  return sa.some((x) => sb.some((y) => distance(x!, y!) <= ATTITUDE.borderRange));
}

/** Once per turn: make contact, drift attitudes, pay tribute, expire old proposals. */
export function diplomacyTick(state: GameState, emit?: Emit): void {
  const list = empires(state).filter((p) => p.alive);
  updateContacts(state, emit);
  for (const a of list) {
    for (const b of list) {
      if (a.id === b.id || !a.contacts.includes(b.id)) continue;
      const target = attitudeBaseline(state, a.id, b.id);
      const now = attitude(state, a.id, b.id);
      if (now !== target) shiftAttitude(state, a.id, b.id, Math.sign(target - now) * Math.min(ATTITUDE.driftPerTurn, Math.abs(target - now)));
    }
  }
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

/**
 * Trade and research treaties: yield based on the smaller empire's
 * population. New treaties cost money while routes are set up, break even
 * after 5 turns and reach their full value after 10.
 */
export function treatyRamp(state: GameState, signed: number, kind: "trade" | "research"): number {
  const y = TREATY_YIELD[kind];
  const t = Math.max(0, state.turn - signed);
  return Math.max(-1, Math.min(1, (t - y.breakEven) / (y.full - y.breakEven)));
}

export interface TreatyIncome {
  bc: number;
  research: number;
}

export function treatyIncome(
  state: GameState,
  playerId: PlayerId,
  totals: Map<PlayerId, { population: number; research: number }>,
): TreatyIncome {
  const out: TreatyIncome = { bc: 0, research: 0 };
  for (const other of empires(state)) {
    if (other.id === playerId || !other.alive) continue;
    const y = treatyYield(state, playerId, other.id, totals);
    out.bc += y.bc;
    out.research += y.research;
  }
  return out;
}

/** What a's trade and research treaties with b yield a this turn. */
export function treatyYield(
  state: GameState,
  playerId: PlayerId,
  other: PlayerId,
  totals: Map<PlayerId, { population: number; research: number }>,
): TreatyIncome {
  const out: TreatyIncome = { bc: 0, research: 0 };
  const me = totals.get(playerId);
  const them = totals.get(other);
  if (!me || !them) return out;
  const r = relation(state, playerId, other);
  const pop = Math.min(me.population, them.population);
  if (r.trade) {
    const k = treatyRamp(state, r.tradeSince ?? r.since, "trade");
    out.bc += TREATY_YIELD.trade.perPop * pop * k * (k > 0 ? tradeMult(state, playerId) : 1);
  }
  if (r.research) out.research += TREATY_YIELD.research.perPop * pop * treatyRamp(state, r.researchSince ?? r.since, "research");
  return out;
}

/**
 * Pirates (a random event) choke off trade income; fantastic traders earn 25%
 * more from trade treaties, Trader leaders their skill in % on top.
 */
function tradeMult(state: GameState, playerId: PlayerId): number {
  const pirated = (state.activeEvents ?? []).some((e) => e.kind === "pirates" && e.playerId === playerId);
  return pirated ? 0 : treatyIncomeMult(getRace(state.players[playerId]!.raceId)) + leaderTradeBonus(state, playerId) / 100;
}

/** What a new trade or research treaty between a and b would yield a each turn once at full strength. */
export function treatyPotential(state: GameState, a: PlayerId, b: PlayerId, kind: "trade" | "research"): number {
  const pop = Math.min(empireTotals(state, a).population, empireTotals(state, b).population);
  return TREATY_YIELD[kind].perPop * pop * (kind === "trade" ? tradeMult(state, a) : 1);
}

/**
 * Surrender: everything the empire has (colonies, ships, treasury, leaders)
 * passes to the chosen empire and the surrendering empire leaves the game.
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

/** Biological weapons used on a colony: the whole galaxy is appalled. */
export function bioWeaponOutrage(state: GameState, user: PlayerId): void {
  everyoneFeels(state, user, ATTITUDE_EVENTS.bioWeapons);
}

/** Exterminating a conquered population. */
export function exterminationOutrage(state: GameState, user: PlayerId): void {
  everyoneFeels(state, user, ATTITUDE_EVENTS.exterminate);
}
