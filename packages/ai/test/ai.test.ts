import { describe, expect, it } from "vitest";
import { newGame, playerView, processTurn, type GameEvent, type GameState, type TurnOrders } from "@starlord/sim";
import { createController } from "@starlord/ai";

function play(state: GameState, onTurn?: (s: GameState) => void): GameState {
  const ai = createController();
  while (!state.over) {
    const orders: TurnOrders = {};
    for (const p of state.players) if (p.alive) orders[p.id] = ai.orders(playerView(state, p.id));
    state = processTurn(state, orders);
    onTurn?.(state);
  }
  return state;
}

describe("AI", () => {
  it("never issues commands the sim rejects", () => {
    for (const seed of ["a", "b", "c"]) {
      const rejected: GameEvent[] = [];
      play(newGame({ seed, playerCount: 4, maxTurns: 120 }), (s) =>
        // Two empires racing for the same planet in the same turn is legitimate; one loses.
        rejected.push(
          ...s.events.filter((e) => e.kind === "commandRejected" && !e.reason.includes("already colonized")),
        ),
      );
      expect(rejected).toEqual([]);
    }
  });

  it("grows every empire over 100 turns", () => {
    const end = play(newGame({ seed: "growth", playerCount: 4, maxTurns: 100 }));
    for (const p of end.players) {
      const colonies = Object.values(end.colonies).filter((c) => c.ownerId === p.id);
      expect(colonies.length).toBeGreaterThan(1);
      expect(p.techs.length).toBeGreaterThan(2);
    }
  });

  it("can automate only some areas, leaving the rest to the player", () => {
    const state = newGame({ seed: "partial", playerCount: 2 });
    const researchOnly = createController(["research"]);
    const types = researchOnly.orders(playerView(state, 0)).map((c) => c.type);
    expect(types).toEqual(["setResearch"]);
  });
});
