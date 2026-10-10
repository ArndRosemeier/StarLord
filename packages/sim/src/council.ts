import { attitude } from "./diplomacy.js";
import { empireTotals } from "./economy.js";
import { empires } from "./empire.js";
import type { GameState, PlayerId } from "./types.js";
import type { Emit } from "./context.js";

/**
 * The Galactic Council meets every 25 turns once three empires remain. The two
 * most populous empires stand; every empire votes with its population. A
 * candidate with two thirds of all votes wins the game.
 */

export const COUNCIL_FIRST = 100;
export const COUNCIL_INTERVAL = 25;
export const COUNCIL_MAJORITY = 2 / 3;


export function councilCandidates(state: GameState): PlayerId[] {
  return empires(state)
    .filter((p) => p.alive)
    .map((p) => ({ id: p.id, pop: empireTotals(state, p.id).population }))
    .sort((a, b) => b.pop - a.pop || a.id - b.id)
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

export function councilTick(state: GameState, emit: Emit): void {
  if (!state.settings.council || state.turn < state.council.nextTurn) return;
  state.council.nextTurn = state.turn + COUNCIL_INTERVAL;
  const alive = empires(state).filter((p) => p.alive);
  if (alive.length < 3) return;
  const candidates = councilCandidates(state);
  const votes: Record<string, number> = {};
  let total = 0;
  for (const p of alive) {
    const weight = Math.max(1, Math.round(empireTotals(state, p.id).population / 5));
    total += weight;
    const v = resolveVote(state, p.id, candidates);
    if (v !== null) votes[v] = (votes[v] ?? 0) + weight;
  }
  const winner = candidates.find((c) => (votes[c] ?? 0) >= total * COUNCIL_MAJORITY) ?? null;
  state.council.lastResult = { turn: state.turn, candidates, votes, winner };
  for (const p of alive) {
    emit({
      kind: "council",
      playerId: p.id,
      what: winner === null ? "The council failed to elect a leader." : `${state.players[winner]!.name} was elected leader of the galaxy.`,
    });
  }
  if (winner !== null) {
    state.over = true;
    state.winner = winner;
    state.victory = "council";
    emit({ kind: "victory", playerId: winner, how: "council" });
  }
}
