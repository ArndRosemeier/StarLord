import { TRAIT_EFFECTS } from "./data/racePicks.js";
import { leaderTradeBonus } from "./leaders.js";
import { treatyIncomeMult } from "./raceEffects.js";
import { getRace, hasTrait } from "./data/races.js";
import { empires, scanRange } from "./empire.js";
import { distance } from "./galaxy.js";
import type { DiplomaticStatus, GameState, PlayerId, Proposal, ProposalKind, Relation } from "./types.js";

/**
 * Relations between empires. Each pair has a status (none, war, peace,
 * alliance) plus optional trade and research treaties. Each empire also has an
 * attitude towards every other (-100..100) that drifts towards a baseline set
 * by treaties, borders, wars and race traits; AI uses it to decide what to
 * accept or when to attack.
 */

export const PROPOSAL_LIFETIME = 2;

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
  const r = { ...relation(state, a, b), status, since: state.turn };
  if (status === "war") {
    r.trade = false;
    r.research = false;
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

export function attitude(state: GameState, a: PlayerId, b: PlayerId): number {
  return state.attitude[a]?.[b] ?? 0;
}

export function adjustAttitude(state: GameState, a: PlayerId, b: PlayerId, delta: number): void {
  // Others take a charismatic race's good deeds twice as warmly and its slights half as hard.
  const other = state.players[b];
  if (other?.kind === "empire" && hasTrait(getRace(other.raceId), "charismatic")) {
    delta *= delta > 0 ? TRAIT_EFFECTS.charismaticGood : TRAIT_EFFECTS.charismaticBad;
  }
  const row = (state.attitude[a] ??= {});
  row[b] = Math.max(-100, Math.min(100, (row[b] ?? 0) + delta));
}

export function canSign(state: GameState, from: PlayerId, to: PlayerId, kind: ProposalKind): string | null {
  const r = relation(state, from, to);
  const fromRace = getRace(state.players[from]!.raceId);
  const toRace = getRace(state.players[to]!.raceId);
  const repulsive = hasTrait(fromRace, "repulsive") || hasTrait(toRace, "repulsive");
  if (!state.players[from]!.contacts.includes(to)) return "no contact";
  switch (kind) {
    case "ceasefire":
    case "peace":
      return r.status === "war" ? null : "not at war";
    case "alliance":
      if (repulsive) return "repulsive races cannot ally";
      return r.status === "peace" ? null : "needs a peace treaty first";
    case "trade":
      if (repulsive) return "repulsive races cannot trade";
      return r.status !== "war" && !r.trade ? null : "not possible";
    case "research":
      if (repulsive) return "repulsive races cannot share research";
      return r.status !== "war" && !r.research ? null : "not possible";
  }
}

export function acceptProposal(state: GameState, p: Proposal): void {
  const r = relation(state, p.from, p.to);
  switch (p.kind) {
    case "ceasefire":
    case "peace":
      setStatus(state, p.from, p.to, "peace");
      break;
    case "alliance":
      setStatus(state, p.from, p.to, "alliance");
      break;
    case "trade":
      writeRelation(state, p.from, p.to, { ...r, trade: true });
      break;
    case "research":
      writeRelation(state, p.from, p.to, { ...r, research: true });
      break;
  }
  adjustAttitude(state, p.from, p.to, 5);
  adjustAttitude(state, p.to, p.from, 5);
}

export function declareWar(state: GameState, from: PlayerId, to: PlayerId): void {
  const before = relation(state, from, to);
  setStatus(state, from, to, "war");
  adjustAttitude(state, to, from, -40);
  for (const other of empires(state)) {
    if (other.id === from || other.id === to || !other.alive) continue;
    // Breaking a treaty sours everyone; friends of the victim more so.
    if (before.status === "peace" || before.status === "alliance") adjustAttitude(state, other.id, from, -10);
    if (attitude(state, other.id, to) > 30) adjustAttitude(state, other.id, from, -10);
    if (relation(state, other.id, to).status === "alliance") setStatus(state, other.id, from, "war");
  }
}

/** Baseline attitude a feels towards b before drift. */
export function attitudeBaseline(state: GameState, a: PlayerId, b: PlayerId): number {
  const r = relation(state, a, b);
  const raceB = getRace(state.players[b]!.raceId);
  const raceA = getRace(state.players[a]!.raceId);
  let base = 0;
  if (hasTrait(raceB, "repulsive")) base -= 20;
  if (raceA.id === raceB.id) base += 5;
  if (r.status === "war") base -= 30;
  if (r.status === "alliance") base += 20;
  if (r.status === "peace") base += 5;
  if (r.trade) base += 5;
  if (r.research) base += 5;
  if (bordersTouch(state, a, b)) base -= 10;
  for (const c of empires(state)) {
    if (c.id === a || c.id === b || !c.alive) continue;
    if (relation(state, a, c.id).status === "war" && relation(state, b, c.id).status === "war") base += 10;
  }
  return base;
}

function bordersTouch(state: GameState, a: PlayerId, b: PlayerId): boolean {
  const starsOf = (p: PlayerId) =>
    Object.values(state.colonies)
      .filter((c) => c.ownerId === p)
      .map((c) => state.galaxy.stars.find((s) => s.id === state.planets[c.planetId]!.starId)!);
  const sa = starsOf(a);
  const sb = starsOf(b);
  return sa.some((x) => sb.some((y) => distance(x, y) <= 3));
}

/** Once per turn: drift attitudes, make contact, expire old proposals. */
export function diplomacyTick(state: GameState): void {
  const list = empires(state).filter((p) => p.alive);
  updateContacts(state);
  for (const a of list) {
    for (const b of list) {
      if (a.id === b.id || !a.contacts.includes(b.id)) continue;
      const target = attitudeBaseline(state, a.id, b.id);
      const now = attitude(state, a.id, b.id);
      if (now !== target) adjustAttitude(state, a.id, b.id, Math.sign(target - now) * Math.min(2, Math.abs(target - now)));
    }
  }
  state.proposals = state.proposals.filter((p) => state.turn - p.turn < PROPOSAL_LIFETIME);
}

/** Empires meet when their colonies or ships come within scanner range of each other. */
export function updateContacts(state: GameState): void {
  const list = empires(state).filter((p) => p.alive);
  const eyes = new Map<PlayerId, { x: number; y: number }[]>();
  for (const p of list) {
    const pts: { x: number; y: number }[] = Object.values(state.fleets).filter((f) => f.ownerId === p.id);
    for (const c of Object.values(state.colonies)) {
      if (c.ownerId === p.id) pts.push(state.galaxy.stars.find((s) => s.id === state.planets[c.planetId]!.starId)!);
    }
    eyes.set(p.id, pts);
  }
  for (const a of list) {
    const range = scanRange(a) + 1;
    for (const b of list) {
      if (a.id === b.id || a.contacts.includes(b.id)) continue;
      const met = eyes.get(a.id)!.some((x) => eyes.get(b.id)!.some((y) => distance(x, y) <= range));
      if (met) {
        a.contacts.push(b.id);
        if (!b.contacts.includes(a.id)) b.contacts.push(a.id);
      }
    }
  }
}

/** Ramp so new treaties start small, MoO2-style. */
function ramp(state: GameState, since: number): number {
  return Math.min(1, Math.max(0, state.turn - since) / 10);
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
  const me = totals.get(playerId);
  if (!me) return out;
  // Fantastic traders earn 25% more from trade treaties, Trader leaders their skill in % on top.
  const traders = treatyIncomeMult(getRace(state.players[playerId]!.raceId)) + leaderTradeBonus(state, playerId) / 100;
  for (const other of empires(state)) {
    if (other.id === playerId || !other.alive) continue;
    const r = relation(state, playerId, other.id);
    const them = totals.get(other.id);
    if (!them) continue;
    const k = ramp(state, r.since);
    if (r.trade) out.bc += 0.25 * Math.min(me.population, them.population) * k * traders;
    if (r.research) out.research += 0.1 * Math.min(me.research, them.research) * k;
  }
  return out;
}
