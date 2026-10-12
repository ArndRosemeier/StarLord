import { describe, expect, it } from "vitest";
import { availableBuildings, isTradeGoodsOnly, newGame, processTurn, validateCommand, type GameState } from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

function game(): GameState {
  return newGame({ seed: "idle", races: ["terran", "felhari"], humanPlayers: [0], ...quiet });
}

describe("colonies with nothing to build", () => {
  it("sell their industry as Trade Goods instead of wasting it", () => {
    const idle = game();
    const busy = structuredClone(idle);
    const home = Object.values(idle.colonies).find((c) => c.ownerId === 0)!;
    idle.colonies[home.id]!.queue = [];
    busy.colonies[home.id]!.queue = [{ kind: "building", id: availableBuildings(busy, 0, busy.colonies[home.id]!)[0]! }];
    expect(isTradeGoodsOnly(idle.colonies[home.id]!)).toBe(true);
    const a = processTurn(busy, {});
    const b = processTurn(idle, {});
    expect(b.players[0]!.bc).toBeGreaterThan(a.players[0]!.bc);
  });

  it("keeps the idle-planet alert as a per-game choice, on by default", () => {
    let state = game();
    expect(state.players[0]!.idleAlertOff).toBeUndefined();
    expect(validateCommand(state, 0, { type: "setIdleAlert", on: "no" as unknown as boolean }).ok).toBe(false);
    state = processTurn(state, { 0: [{ type: "setIdleAlert", on: false }] });
    expect(state.players[0]!.idleAlertOff).toBe(true);
    state = processTurn(state, { 0: [{ type: "setIdleAlert", on: true }] });
    expect(state.players[0]!.idleAlertOff).toBeUndefined();
  });
});
