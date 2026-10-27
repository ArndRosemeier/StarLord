import type { Rng } from "./rng.js";
import type { GameEvent, GameState, Id, OrbitalChoice, PlayerId, TacticalOrder } from "./types.js";

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
  /** Players' orbital strike orders for this turn, by colony and player (see the `orbitalStrike` command). */
  orbitalOrders?: Map<Id, Map<PlayerId, OrbitalChoice>>;
  /**
   * Asked when a player's fleets hold orbit over an enemy colony they have given no orbital order for; true stops
   * the turn there (see `pendingOrbital`).
   */
  pauseAtOrbit?: (playerId: PlayerId, colonyId: Id) => boolean;
  /** Asked when a player's fleets at a star could attack more than one enemy planet and none was picked; true stops the turn there (see `pendingTarget`). */
  pauseAtTarget?: (playerId: PlayerId, starId: Id) => boolean;
  /** Fleets that reached their destination star in this turn's movement. */
  arrived?: Set<Id>;
  /** Fleets whose stance their owner set in this turn's orders (an explicit choice, never asked again this turn). */
  stanceSet?: Set<Id>;
}

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}
