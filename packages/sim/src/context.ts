import type { Rng } from "./rng.js";
import type { GameEvent, GameState } from "./types.js";

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

export type EventInput = DistributiveOmit<GameEvent, "turn">;
export type Emit = (e: EventInput) => void;

/** What every turn phase gets: the state being built, the RNG and the event sink. */
export interface TurnContext {
  state: GameState;
  rng: Rng;
  emit: Emit;
}

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}
