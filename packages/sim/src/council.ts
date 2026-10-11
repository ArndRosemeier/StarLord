import { COUNCIL, COUNCIL_VOTE } from "./data/diplomacy.js";
import { DIFFICULTIES } from "./data/galaxy.js";
import { getRace, hasTrait } from "./data/races.js";
import { attitude, fixedRoll, relation, reputationOf, setStatus, trustIn } from "./diplomacy.js";
import { empireTotals } from "./economy.js";
import { empires } from "./empire.js";
import type { GameState, PlayerId } from "./types.js";
import type { Emit } from "./context.js";

/**
 * The Galactic Council forms once nearly the whole galaxy is settled and then
 * meets every 25 turns while three or more empires remain. The two empires
 * with the most votes stand; every empire votes with its size, by its
 * relations with the candidates (the original's rule, see COUNCIL_VOTE). A
 * two-thirds majority elects a leader of the
 * galaxy, but nobody can be forced to accept: an empire that refuses the
 * result goes to war with everyone else and the game goes on.
 */

export const COUNCIL_FIRST = COUNCIL.earliestTurn;
export const COUNCIL_INTERVAL = COUNCIL.interval;
export const COUNCIL_MAJORITY = COUNCIL.majority;

export function councilVotes(state: GameState, playerId: PlayerId): number {
  return Math.max(1, Math.round(empireTotals(state, playerId).population / COUNCIL.popPerVote));
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
  const orion = state.galaxy.stars.find((st) => st.special === "orion");
  if (orion?.planetIds.some((id) => { const col = state.planets[id]?.colonyId; return col && state.colonies[col]?.ownerId === candidate; })) {
    s += COUNCIL_VOTE.holdsOrion;
  }
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

  // Settle last turn's election: refusals void it and start a war with everyone.
  if (council.pending) {
    const { winner, refused } = council.pending;
    council.pending = null;
    const refusers = refused.filter((id) => state.players[id]?.alive && id !== winner);
    if (refusers.length === 0) return { winner };
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
  let total = 0;
  for (const p of alive) {
    const weight = councilVotes(state, p.id);
    total += weight;
    const v = resolveVote(state, p.id, candidates);
    if (v !== null) votes[v] = (votes[v] ?? 0) + weight;
  }
  const winner = candidates.find((c) => (votes[c] ?? 0) >= total * COUNCIL.majority) ?? null;
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
    emit({ kind: "council", playerId: p.id, what: "Accept the council's decision, or refuse it and face war with every other empire." });
  }
  return null;
}
