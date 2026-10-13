import type { CombatReport, PlayerId } from "@starlord/sim";

/** The battles a player fought in the turn just ended, in the order they happened. */
export function battlesOfLastTurn(history: readonly { turn: number; combats: readonly CombatReport[] }[], me: PlayerId, turn: number): CombatReport[] {
  const last = history[0];
  if (!last || last.turn !== turn - 1) return [];
  return last.combats.filter((c) => c.sides.includes(me));
}
