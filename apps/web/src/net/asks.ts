import {
  attackableColonies, pendingLiveBattle, pendingOrbital, pendingTarget,
  type Command, type GameState, type PlayerId, type TurnOrders,
} from "@starlord/sim";

/**
 * What a turn asks of the people playing it once every empire's orders are in, in the order a local
 * game asks: which planet to attack where there is a choice, battles to command, then what to do to
 * colonies whose orbit they hold. The host asks one question at a time and adds each answer to the
 * turn's orders, so every later question sees the earlier answers, exactly as the turn will run.
 */
export type AskKind = "target" | "battle" | "orbital";

export interface Ask {
  /** Counts up within the host's turn; answers name the ask they answer. */
  id: number;
  kind: AskKind;
  /** Who answers: one player, or both people in a live battle. */
  seats: PlayerId[];
  /** What it is about (star, battle key or colony), to recognise a question asked again. */
  key: string;
}

/** Whether any of the player's fleets is at or bound for a star with more than one enemy colony, to skip the check otherwise. */
export function mayChooseTarget(state: GameState, me: PlayerId): boolean {
  return Object.values(state.fleets).some((f) => {
    const star = f.ownerId === me ? f.destStarId ?? f.starId : null;
    return !!star && attackableColonies(state, me, star).length > 1;
  });
}

/** Whether any of the player's fleets is set to attack (only those strike from orbit without an order), to skip the check otherwise. */
export function mayStrikeFromOrbit(state: GameState, orders: TurnOrders, me: PlayerId): boolean {
  return Object.values(state.fleets).some((f) => f.ownerId === me && f.stance === "attack")
    || (orders[me] ?? []).some((c) => c.type === "setStance" && c.stance === "attack");
}

/** Whether the player commands their battles: the setting as this turn's orders leave it. */
export function commandsBattles(state: GameState, orders: TurnOrders, me: PlayerId): boolean {
  const set = [...(orders[me] ?? [])].reverse().find((c) => c.type === "setAutoBattles");
  return set?.type === "setAutoBattles" ? !set.on : !state.players[me]?.autoBattles;
}

/** The next question the turn asks of `seats` (people at their screens), or null when the turn can run. */
export function nextAsk(state: GameState, orders: TurnOrders, seats: PlayerId[]): Omit<Ask, "id"> | null {
  for (const seat of seats) {
    if (!mayChooseTarget(state, seat)) continue;
    const p = pendingTarget(state, orders, seat);
    if (p) return { kind: "target", seats: [seat], key: `${seat}:${p.starId}` };
  }
  const commanders = seats.filter((s) => commandsBattles(state, orders, s));
  if (commanders.length > 0) {
    const b = pendingLiveBattle(state, orders, commanders);
    if (b) return { kind: "battle", seats: b.commanders, key: b.key };
  }
  for (const seat of seats) {
    if (!mayStrikeFromOrbit(state, orders, seat)) continue;
    const p = pendingOrbital(state, orders, seat);
    if (p) return { kind: "orbital", seats: [seat], key: `${seat}:${p.colonyId}` };
  }
  return null;
}

/**
 * The answer a player gives when they cannot answer (they left, or the same question came back): the
 * fleets hold back, the battle resolves by itself, the colony is left alone.
 */
export function defaultAnswer(state: GameState, orders: TurnOrders, ask: Omit<Ask, "id">, seat: PlayerId): Command[] {
  if (ask.kind === "battle") return [{ type: "battleOrders", battle: ask.key, orders: "auto" }];
  if (ask.kind === "target") {
    const p = pendingTarget(state, orders, seat);
    return (p?.fleetIds ?? []).map((fleetId) => ({ type: "setStance", fleetId, stance: "defend" }));
  }
  const p = pendingOrbital(state, orders, seat);
  return p ? [{ type: "orbitalStrike", colonyId: p.colonyId, choice: "none" }] : [];
}
