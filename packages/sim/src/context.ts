import type { Rng } from "./rng.js";
import type { GameEvent, GameState, PlayerId, TacticalOrder } from "./types.js";

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

export type EventInput = DistributiveOmit<GameEvent, "turn">;
export type Emit = (e: EventInput) => void;

/** What every turn phase gets: the state being built, the RNG and the event sink. */
export interface TurnContext {
  state: GameState;
  rng: Rng;
  emit: Emit;
  /** Humans' orders for this turn's battles, by battle key and player (see the `battleOrders` command). */
  battleOrders?: Map<string, Map<PlayerId, TacticalOrder[] | "auto">>;
  /** Asked before each battle; a battle it returns true for is not fought (see `pendingBattle`). */
  pauseAt?: (battle: import("./combat.js").Battle, key: string) => boolean;
}

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}
