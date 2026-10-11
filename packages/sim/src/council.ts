import { COUNCIL, COUNCIL_VOTE, RELATION_EVENTS } from "./data/diplomacy.js";
import { DIFFICULTIES } from "./data/galaxy.js";
import { getRace, hasTrait } from "./data/races.js";
import { attitude, declareWar, fixedRoll, relation, reputationOf, setStatus, surrenderEmpire, trustIn, votingPopulation } from "./diplomacy.js";
import { empires, grantTech } from "./empire.js";
import { REASON, relationEvent, setRelation } from "./relations.js";
import type { GameState, PlayerId } from "./types.js";
import type { Emit } from "./context.js";

/**
 * The Galactic Council forms once nearly the whole galaxy is settled and then
 * meets every 25 turns while three or more empires remain. The two empires
 * with the most votes stand; every empire votes with its size, by its
 * relations with the candidates (the original's rule, see COUNCIL_VOTE), and
 * each vote moves relations: +24 with the candidate backed, -12 with the
 * other, -6 with both for abstaining. A two-thirds majority elects a leader of
 * the galaxy. A human may refuse a computer winner: every other computer
 * empire then joins the winner (colonies, fleets, technology and treasury) and
 * the refuser faces it in a final war. A human refusing a human winner goes to
 * war with every other empire.
 */

export const COUNCIL_FIRST = COUNCIL.earliestTurn;
export const COUNCIL_INTERVAL = COUNCIL.interval;
export const COUNCIL_MAJORITY = COUNCIL.majority;

/** One vote per 10 population (androids and natives count), rounded up; an empire without population has none. */
export function councilVotes(state: GameState, playerId: PlayerId): number {
  return Math.ceil(votingPopulation(state, playerId) / COUNCIL.popPerVote);
}

/** Votes a candidate needs: two thirds of all votes, rounded up. */
export function votesToWin(total: number): number {
  return Math.trunc((2 * total + 2) / 3);
}

/**
 * Who holds Orion for the council, as the original decides it: the owner of
 * the first settled habitable planet (not an asteroid belt or gas giant) there.
 */
export function orionHolder(state: GameState): PlayerId | null {
  const orion = state.galaxy.stars.find((st) => st.special === "orion");
  for (const id of orion?.planetIds ?? []) {
    const planet = state.planets[id];
    if (!planet || planet.type === "asteroids" || planet.type === "gasGiant" || !planet.colonyId) continue;
    const owner = state.colonies[planet.colonyId]?.ownerId;
    if (owner !== undefined) return owner;
  }
  return null;
}

export function councilCandidates(state: GameState): PlayerId[] {
  return empires(state)
    .filter((p) => p.alive)
    .map((p) => ({ id: p.id, votes: councilVotes(state, p.id) }))
    .sort((a, b) => b.votes - a.votes || a.id - b.id)
    .slice(0, 2)
    .map((x) => x.id);
}

/**
 * How much a voter is inclined to back a candidate over the other one, out
 * of COUNCIL_VOTE.die, by the original's rule: always (die) for an ally,
 * never (-1) when at war, otherwise relations plus treaties and traits.
 */
export function voteScore(state: GameState, voter: PlayerId, candidate: PlayerId, rival: PlayerId): number {
  const r = relation(state, voter, candidate);
  if (r.status === "war") return -1;
  if (r.status === "alliance") return COUNCIL_VOTE.die;
  const c = state.players[candidate]!;
  const race = getRace(c.raceId);
  let s = attitude(state, voter, candidate) + trustIn(state, voter, candidate) + 2 * reputationOf(state, voter, candidate);
  if (relation(state, voter, rival).status === "war") s += COUNCIL_VOTE.atWarWithRival;
  if (orionHolder(state) === candidate) s += COUNCIL_VOTE.holdsOrion;
  if (state.council.lastVotes?.[voter] === candidate) s += COUNCIL_VOTE.sameAsLastTime;
  if (hasTrait(race, "charismatic")) s += COUNCIL_VOTE.charismatic;
  if (hasTrait(race, "repulsive")) s += COUNCIL_VOTE.repulsive;
  if (c.techs.includes("xenoPsychology")) s += COUNCIL_VOTE.xenoPsychology;
  if (r.status === "nonAggression") s += COUNCIL_VOTE.nonAggression;
  if (r.trade) s += COUNCIL_VOTE.trade;
  if (r.research) s += COUNCIL_VOTE.research;
  const level = Object.keys(DIFFICULTIES).indexOf(state.settings.difficulty ?? "average");
  if (c.isHuman && level > COUNCIL_VOTE.humanScaleAbove) s = Math.trunc((s * COUNCIL_VOTE.humanScaleBase) / (level + COUNCIL_VOTE.humanScaleBase));
  return s;
}

/** Chance (0..1) a voter would back a candidate, before the other candidate is weighed. */
export function voteChance(state: GameState, voter: PlayerId, candidate: PlayerId, rival: PlayerId): number {
  return Math.max(0, Math.min(1, voteScore(state, voter, candidate, rival) / COUNCIL_VOTE.die));
}

/**
 * Who a player's votes go to. Candidates vote for themselves; "auto" (every
 * computer empire) rolls a d200 against each candidate's vote score and backs
 * the one that passes, abstaining when both or neither do.
 */
export function resolveVote(state: GameState, voter: PlayerId, candidates: PlayerId[]): PlayerId | null {
  if (candidates.includes(voter)) return voter;
  const choice = state.players[voter]!.councilVote;
  if (choice === "abstain") return null;
  if (typeof choice === "number" && candidates.includes(choice)) return choice;
  const [a, b] = candidates;
  if (a === undefined || b === undefined) return null;
  const backs = (c: PlayerId, rival: PlayerId) => fixedRoll(state, `council${state.turn}|${voter}|${c}`, COUNCIL_VOTE.die) <= voteScore(state, voter, c, rival);
  const forA = backs(a, b);
  const forB = backs(b, a);
  return forA === forB ? null : forA ? a : b;
}

/** Share of systems with a habitable planet that hold a colony. */
export function settledShare(state: GameState): number {
  const stars = state.galaxy.stars;
  const owned = stars.filter((s) => s.planetIds.some((id) => state.planets[id]?.colonyId)).length;
  return stars.length === 0 ? 1 : owned / stars.length;
}

/** Turn of the next session, or null while the council has not formed yet. */
export function nextCouncilTurn(state: GameState): number | null {
  return state.council.convened ? state.council.nextTurn : null;
}

export function councilTick(state: GameState, emit: Emit): { winner: PlayerId } | null {
  const alive = empires(state).filter((p) => p.alive);
  const council = state.council;

  // Settle last turn's election: a refusal voids it.
  if (council.pending) {
    const { winner, refused } = council.pending;
    council.pending = null;
    const refusers = refused.filter((id) => state.players[id]?.alive && id !== winner);
    if (refusers.length === 0) return { winner };
    if (!state.players[winner]!.isHuman) {
      finalWar(state, winner, refusers, emit);
      return null;
    }
    for (const r of refusers) {
      for (const p of alive) {
        if (p.id === r || refusers.includes(p.id)) continue;
        setStatus(state, r, p.id, "war");
      }
      for (const p of alive) {
        emit({ kind: "council", playerId: p.id, what: `${state.players[r]!.name} refused the council's decision and is now at war with the galaxy.` });
      }
    }
    return null;
  }

  if (!state.settings.council) return null;
  if (!council.convened) {
    if (state.turn < COUNCIL.earliestTurn || alive.length < COUNCIL.minEmpires) return null;
    if (settledShare(state) < COUNCIL.settledShare) return null;
    council.convened = true;
    council.nextTurn = state.turn;
  }
  if (state.turn < council.nextTurn) return null;
  council.nextTurn = state.turn + COUNCIL.interval;
  if (alive.length < COUNCIL.minEmpires) return null;
  const candidates = councilCandidates(state);
  const votes: Record<string, number> = {};
  const choices: [PlayerId, PlayerId | null][] = [];
  let total = 0;
  for (const p of alive) {
    const weight = councilVotes(state, p.id);
    total += weight;
    const v = resolveVote(state, p.id, candidates);
    if (v !== null) votes[v] = (votes[v] ?? 0) + weight;
    choices.push([p.id, v]);
  }
  // Every vote moves relations with the candidates, and is remembered for the next session.
  const lastVotes: Record<string, PlayerId | null> = {};
  for (const [voter, v] of choices) {
    lastVotes[voter] = v;
    if (candidates.includes(voter)) continue;
    for (const c of candidates) {
      if (v === null) relationEvent(state, RELATION_EVENTS.councilAbstain, voter, c);
      else if (v === c) relationEvent(state, RELATION_EVENTS.councilFor, voter, c, REASON.councilFor);
      else relationEvent(state, RELATION_EVENTS.councilAgainst, voter, c, REASON.councilAgainst);
    }
  }
  council.lastVotes = lastVotes;
  const winner = total > 0 ? candidates.find((c) => (votes[c] ?? 0) >= votesToWin(total)) ?? null : null;
  council.lastResult = { turn: state.turn, candidates, votes, winner };
  for (const p of alive) {
    emit({
      kind: "council",
      playerId: p.id,
      what: winner === null ? "The council failed to elect a leader." : `${state.players[winner]!.name} was elected leader of the galaxy.`,
    });
  }
  if (winner === null) return null;
  // People may refuse the result; computer empires always bow to the council.
  const mayRefuse = alive.filter((p) => p.isHuman && p.id !== winner);
  if (mayRefuse.length === 0) return { winner };
  council.pending = { winner, turn: state.turn, refused: [] };
  for (const p of mayRefuse) {
    emit({
      kind: "council", playerId: p.id,
      what: state.players[winner]!.isHuman ? "Accept the council's decision, or refuse it and face war with every other empire."
        : `Accept the council's decision, or refuse it: every other computer empire then joins the ${state.players[winner]!.name} and you face them in a final war.`,
    });
  }
  return null;
}

/**
 * A human refused a computer winner, as in the original: every other computer
 * empire is absorbed into the winner (colonies, fleets, technology, treasury
 * and leaders), and each refuser faces the winner in a final war.
 */
function finalWar(state: GameState, winner: PlayerId, refusers: PlayerId[], emit: Emit): void {
  const w = state.players[winner]!;
  for (const p of empires(state)) {
    if (p.id === winner || !p.alive || p.isHuman) continue;
    for (const t of p.techs) grantTech(w, t);
    surrenderEmpire(state, p.id, winner);
    state.proposals = state.proposals.filter((x) => x.from !== p.id && x.to !== p.id);
    for (const q of empires(state)) {
      if (q.alive) emit({ kind: "council", playerId: q.id, what: `The ${p.name} joined the ${w.name}, the council's choice.` });
    }
  }
  for (const r of refusers) {
    if (relation(state, winner, r).status !== "war") declareWar(state, winner, r, { blame: r });
    setRelation(state, winner, r, -100);
    for (const p of empires(state)) {
      if (p.alive) emit({ kind: "council", playerId: p.id, what: `${state.players[r]!.name} refused the council's decision and faces the ${w.name} in a final war.` });
    }
  }
}
