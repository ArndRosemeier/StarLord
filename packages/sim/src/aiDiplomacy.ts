import { AI_AI_PEACE, AI_TREATIES, AI_WAR } from "./data/diplomacy.js";
import { getRace, hasTrait } from "./data/races.js";
import type { Emit } from "./context.js";
import { attitude, breakTreaty, declareWar, makePeace, patience, relation, signPact, signTreaty, temperament, trustIn } from "./diplomacy.js";
import { empireTotals } from "./economy.js";
import { empires } from "./empire.js";
import {
  REASON, difficultyLevel, fleetPower, noWarTurns, persOf, relationEvent, rngRoll, strengthRatio, strikesOf, type Roll,
} from "./relations.js";
import type { Rng } from "./rng.js";
import type { GameState, PlayerId } from "./types.js";

/**
 * How computer empires deal with each other, after the original. This runs in
 * the turn itself, as the original's does: pacts, trade and research treaties
 * and tribute among computer empires are signed here by the rules' dice
 * (AI_TREATIES), allies join each other's wars, an empire allied to two
 * enemies drops both, computer empires pick wars with each other (AI_WAR)
 * and make peace once a war has run long enough (AI_AI_PEACE). What computer
 * empires do toward humans (offers, peace, answers) is up to their
 * controllers, which only send commands.
 */
export function aiDiplomacyTick(state: GameState, rng: Rng, emit?: Emit): void {
  const ais = empires(state).filter((p) => p.alive && !p.isHuman);
  if (ais.length < 1) return;
  const roll = rngRoll(rng);
  const powers = new Map(empires(state).filter((p) => p.alive).map((p) => [p.id, fleetPower(state, p.id)]));
  aiTreaties(state, ais.map((p) => p.id), roll, powers, emit);
  allyConflicts(state, ais.map((p) => p.id), emit);
  aiWars(state, ais.map((p) => p.id), roll, powers, emit);
  aiPeace(state, ais.map((p) => p.id), emit);
}

const repulsive = (state: GameState, id: PlayerId) => hasTrait(getRace(state.players[id]!.raceId), "repulsive");
const atWar = (state: GameState, a: PlayerId, b: PlayerId) => relation(state, a, b).status === "war";
const tell = (emit: Emit | undefined, a: PlayerId, b: PlayerId, what: string) => {
  emit?.({ kind: "diplomacy", playerId: a, other: b, what });
  emit?.({ kind: "diplomacy", playerId: b, other: a, what });
};

/** Wars with other computer empires. */
function aiWarCount(state: GameState, a: PlayerId): number {
  return empires(state).filter((p) => p.id !== a && p.alive && !p.isHuman && atWar(state, a, p.id)).length;
}

function humanWarCount(state: GameState, a: PlayerId): number {
  return empires(state).filter((p) => p.id !== a && p.alive && p.isHuman && atWar(state, a, p.id)).length;
}

/**
 * The original's FUN_00025528: treaties between two computer empires,
 * considered 1 in (250 - 40 x difficulty) turns. On such a turn the empire
 * also joins its ally's wars and its patience with the partner drops, whether
 * or not a treaty was possible.
 */
function aiTreaties(state: GameState, ais: PlayerId[], roll: Roll, powers: Map<PlayerId, number>, emit?: Emit): void {
  const T = AI_TREATIES;
  const d = difficultyLevel(state);
  const all = empires(state).filter((p) => p.alive);
  for (const a of ais) {
    for (const b of ais) {
      if (a === b || repulsive(state, a) || repulsive(state, b) || roll(T.die - T.perDifficulty * d) !== 1) continue;
      if (!state.players[a]!.alive || !state.players[b]!.alive) continue;
      if (!state.players[a]!.contacts.includes(b) || !state.players[b]!.contacts.includes(a)) continue;
      if (!atWar(state, a, b) && patience(state, a, b) >= T.minPatience) considerTreaties(state, a, b, all, roll, powers, emit);
      allianceDuty(state, a, b, emit);
      const pat = ((state.patience ??= {})[a] ??= {});
      pat[b] = (pat[b] ?? 0) - T.patienceCost;
    }
  }
}

function considerTreaties(
  state: GameState, a: PlayerId, b: PlayerId, all: { id: PlayerId }[], roll: Roll, powers: Map<PlayerId, number>, emit?: Emit,
): void {
  const T = AI_TREATIES;
  const d = difficultyLevel(state);
  const r = relation(state, a, b);
  let base = attitude(state, a, b) + trustIn(state, a, b);
  if (r.status === "nonAggression") base += T.pact.nonAggression;
  if (r.status === "alliance") base += T.pact.alliance;
  // The original counts the trade treaty twice and the research treaty not at all.
  if (r.trade) base += 2 * T.pact.trade;
  for (const k of all) {
    if (k.id === a || k.id === b) continue;
    if (atWar(state, a, k.id)) base += T.theirWar;
    if (atWar(state, b, k.id)) base += T.partnerWar;
    if (strikesOf(state, b, k.id) > 0) base += T.partnerStrikes;
  }
  const pa = persOf(state, a, b);
  const pb = persOf(state, b, a);
  const bank = patience(state, a, b);
  const s1 = bank + roll(100) + base + T.humanWar * (humanWarCount(state, a) + humanWarCount(state, b)) + pa + pb;
  if (s1 >= T.alliance && r.status === "nonAggression" && aiWarCount(state, a) === 0 && aiWarCount(state, b) === 0) {
    signPact(state, a, b, "alliance");
    tell(emit, a, b, "signed an alliance with you");
  } else if (s1 >= T.nonAggression && r.status !== "nonAggression" && r.status !== "alliance") {
    signPact(state, a, b, "nonAggression");
    tell(emit, a, b, "signed a non-aggression pact with you");
  }
  const s2 = roll(100) + base + bank + pb;
  const now = relation(state, a, b);
  if (s2 > T.research && !now.research) {
    signTreaty(state, a, b, "research");
    tell(emit, a, b, "signed a research treaty with you");
  } else if (s2 > T.trade && !now.trade) {
    signTreaty(state, a, b, "trade");
    tell(emit, a, b, "signed a trade treaty with you");
  }
  const s3 = bank + roll(100) + base + pa + pb;
  const paying = (state.tributes ?? []).some((t) => t.from === a && t.to === b);
  if (s3 > T.tribute && !paying && strengthRatio(state, a, b, powers) < 100 &&
    empireTotals(state, a).bcIncome < empireTotals(state, b).bcIncome && roll(20) <= d + 1) {
    state.tributes = [...(state.tributes ?? []).filter((t) => !(t.from === a && t.to === b)), { from: a, to: b, percent: T.tributePercent }];
    relationEvent(state, roll(T.tributeWarmth.roll) + T.tributeWarmth.base, a, b, REASON.tribute);
    emit?.({ kind: "diplomacy", playerId: b, other: a, what: `pays you a ${T.tributePercent}% tribute` });
  }
}

/** The original's FUN_00025bc1: a computer empire allied to two empires at war with each other drops both alliances. */
function allyConflicts(state: GameState, ais: PlayerId[], emit?: Emit): void {
  const all = empires(state).filter((p) => p.alive).map((p) => p.id);
  for (const a of ais) {
    const allies = all.filter((x) => x !== a && relation(state, a, x).status === "alliance");
    for (const x of allies) {
      for (const y of allies) {
        if (x >= y || !atWar(state, x, y) || relation(state, a, x).status !== "alliance" || relation(state, a, y).status !== "alliance") continue;
        breakTreaty(state, a, x, "alliance");
        breakTreaty(state, a, y, "alliance");
        emit?.({ kind: "diplomacy", playerId: x, other: a, what: "ended your alliance: it will not take sides in your war" });
        emit?.({ kind: "diplomacy", playerId: y, other: a, what: "ended your alliance: it will not take sides in your war" });
      }
    }
  }
}

/** The original's FUN_00025acd: a computer empire joins every war its computer ally b fights against an empire it knows. */
function allianceDuty(state: GameState, a: PlayerId, b: PlayerId, emit?: Emit): void {
  if (relation(state, a, b).status !== "alliance") return;
  for (const kp of empires(state)) {
    const k = kp.id;
    if (!kp.alive || k === a || k === b || !atWar(state, b, k) || atWar(state, a, k) || !state.players[a]!.contacts.includes(k)) continue;
    declareWar(state, a, k);
    emit?.({ kind: "diplomacy", playerId: k, other: a, what: `declared war on you to stand by its ally, the ${state.players[b]!.name}` });
    emit?.({ kind: "diplomacy", playerId: b, other: a, what: "joined your war as your ally" });
  }
}

/**
 * The original's FUN_00026705: two computer empires make peace once their war
 * has lasted more than 90 - 15 x difficulty turns, 20 fewer for each human
 * empire the first one is also at war with (see AI_AI_PEACE).
 */
function aiPeace(state: GameState, ais: PlayerId[], emit?: Emit): void {
  const P = AI_AI_PEACE;
  const d = difficultyLevel(state);
  for (const a of ais) {
    for (const b of ais) {
      if (a === b || !state.players[a]!.alive || !state.players[b]!.alive || !atWar(state, a, b)) continue;
      if (!state.players[a]!.contacts.includes(b)) continue;
      const limit = P.baseTurns - P.perDifficulty * d - P.perHumanWar * humanWarCount(state, a);
      if (state.turn - relation(state, a, b).since <= limit) continue;
      makePeace(state, b, a);
      tell(emit, a, b, "made peace with you");
    }
  }
}

/**
 * The original's FUN_00025dec: when a computer empire goes to war with
 * another computer empire. See AI_WAR. Branches the original has but StarLord
 * cannot follow: an undecoded per-empire flag, and immediate war over
 * population killed outside a war (in StarLord populations only die at war).
 */
function aiWars(state: GameState, ais: PlayerId[], roll: Roll, powers: Map<PlayerId, number>, emit?: Emit): void {
  const W = AI_WAR;
  const d = difficultyLevel(state);
  const all = empires(state);
  const n = all.length;
  const humans = all.filter((p) => p.alive && p.isHuman).map((p) => p.id);
  for (const a of ais) {
    const pa = state.players[a]!;
    if (!pa.alive) continue;
    let fighting = false;
    const wanted: PlayerId[] = [];
    for (const kp of all) {
      const k = kp.id;
      if (k === a || !kp.alive) continue;
      if (atWar(state, a, k)) {
        fighting = true;
        continue;
      }
      if (kp.isHuman || !pa.contacts.includes(k) || noWarTurns(state, a, k) >= 1) continue;
      const ratio = strengthRatio(state, a, k, powers);
      if (ratio < 100) continue;
      let want = false;
      if (temperament(state, a) === "erratic" && roll(W.erratic * (d * d + 1)) === 1) want = true;
      if (state.turn % n === k && roll(100) <= Math.trunc((W.hatred - attitude(state, a, k)) / (2 * d + 1))) want = true;
      if (roll(100) < (state.deficitTurns?.[a] ?? 0)) want = true;
      // Never pile onto an empire already fighting a human.
      if (humans.some((h) => atWar(state, k, h))) want = false;
      else if (!want && state.turn % n === k) {
        const r = relation(state, a, k);
        const S = W.strength;
        let t = S.base + roll(S.roll) + S.temperament * persOf(state, a, k) + S.perDifficulty * d;
        if (r.status === "nonAggression") t += S.nonAggression;
        if (r.status === "alliance") t += S.alliance;
        if (r.status === "peace") t += S.peace;
        if (r.trade) t += S.trade;
        if (r.research) t += S.research;
        const tribute = (state.tributes ?? []).find((x) => x.from === a && x.to === k);
        if (tribute) t += S.tribute[tribute.percent] ?? 0;
        for (const h of humans) {
          if (!state.players[k]!.contacts.includes(h)) continue;
          const hr = strengthRatio(state, h, a, powers);
          if (hr > 100) t -= hr;
        }
        if (ratio >= t) want = true;
      }
      // On Hard and Impossible they don't pile onto an empire at war with another computer empire.
      if (want && d >= W.noDogpileFrom && all.some((x) => x.id !== a && x.id !== k && x.alive && !x.isHuman && atWar(state, k, x.id))) want = false;
      if (want) wanted.push(k);
    }
    if (fighting || wanted.length === 0) continue;
    const k = wanted[roll(wanted.length) - 1]!;
    declareWar(state, a, k);
    emit?.({ kind: "diplomacy", playerId: k, other: a, what: "declared war on you" });
  }
}
