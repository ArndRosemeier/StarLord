import { COUNCIL } from "./data/diplomacy.js";
import { CLIMATES } from "./data/planets.js";
import { attitude, setStatus } from "./diplomacy.js";
import { empireTotals } from "./economy.js";
import { empires } from "./empire.js";
import type { GameState, PlayerId } from "./types.js";
import type { Emit } from "./context.js";

/**
 * The Galactic Council forms once nearly the whole galaxy is settled and then
 * meets every 25 turns while three or more empires remain. The two empires
 * with the most votes stand; every empire votes with its size, by its
 * relations with the candidates. A two-thirds majority elects a leader of the
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

/** Who a player's votes go to; "auto" votes for itself or the candidate it likes better. */
export function resolveVote(state: GameState, voter: PlayerId, candidates: PlayerId[]): PlayerId | null {
  if (candidates.includes(voter)) return voter;
  const choice = state.players[voter]!.councilVote;
  if (choice === "abstain") return null;
  if (typeof choice === "number" && candidates.includes(choice)) return choice;
  const [a, b] = candidates;
  if (a === undefined || b === undefined) return null;
  // Empires only back a candidate they clearly like; the galaxy is wary of crowning anyone.
  const da = attitude(state, voter, a);
  const db = attitude(state, voter, b);
  const [best, other] = da >= db ? [a, db] : [b, da];
  const fav = Math.max(da, db);
  return fav >= 30 && fav - other >= 20 ? best : null;
}

/** Share of systems with a habitable planet that hold a colony. */
export function settledShare(state: GameState): number {
  let habitable = 0;
  let settled = 0;
  for (const s of state.galaxy.stars) {
    const planets = s.planetIds.map((id) => state.planets[id]).filter((p) => p && CLIMATES[p.type].habitable);
    if (planets.length === 0) continue;
    habitable++;
    if (planets.some((p) => p!.colonyId)) settled++;
  }
  return habitable === 0 ? 1 : settled / habitable;
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
    if (state.turn < COUNCIL.earliestTurn) return null;
    if (settledShare(state) < COUNCIL.settledShare && state.turn < COUNCIL.latestFirstTurn) return null;
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
