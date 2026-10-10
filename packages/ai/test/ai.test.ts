import { describe, expect, it } from "vitest";
import { newGame, playerView, processTurn, type GameEvent, type GameState, type TurnOrders } from "@starlord/sim";
import { automationOrders, createController } from "@starlord/ai";

function play(state: GameState, onTurn?: (s: GameState) => void): GameState {
  while (!state.over) {
    const orders: TurnOrders = {};
    for (const p of state.players) if (p.alive && p.kind === "empire") orders[p.id] = automationOrders(playerView(state, p.id));
    state = processTurn(state, orders);
    onTurn?.(state);
  }
  return state;
}

/** Rejections that come from two empires acting in the same turn, not from bad AI logic. */
const CONTESTED = ["already colonized", "no longer possible"];

describe("AI", () => {
  it("rarely issues commands the sim rejects", () => {
    for (const seed of ["a", "b"]) {
      const rejected: GameEvent[] = [];
      play(newGame({ seed, playerCount: 4, maxTurns: 150 }), (s) =>
        rejected.push(
          ...s.events.filter((e) => e.kind === "commandRejected" && !CONTESTED.some((c) => e.reason.includes(c))),
        ),
      );
      expect(rejected.length).toBeLessThanOrEqual(3);
    }
  });

  it("grows every empire over 100 turns", () => {
    const end = play(newGame({ seed: "growth", playerCount: 4, maxTurns: 100, raiders: false }));
    for (const p of end.players.filter((x) => x.kind === "empire")) {
      const colonies = Object.values(end.colonies).filter((c) => c.ownerId === p.id && !c.outpost);
      expect(colonies.length).toBeGreaterThan(1);
      expect(p.techs.length).toBeGreaterThan(15);
    }
  });

  it("can automate only some areas, leaving the rest to the player", () => {
    const state = newGame({ seed: "partial", playerCount: 2 });
    const types = createController(["research"]).orders(playerView(state, 0)).map((c) => c.type);
    expect(types).toEqual(["setResearch"]);
  });

  it("follows a human's automation choices", () => {
    const state = newGame({ seed: "human", playerCount: 2, humanPlayers: [0] });
    expect(automationOrders(playerView(state, 0))).toEqual([]);
    state.players[0]!.automation = ["research"];
    expect(automationOrders(playerView(state, 0)).map((c) => c.type)).toEqual(["setResearch"]);
  });
});
