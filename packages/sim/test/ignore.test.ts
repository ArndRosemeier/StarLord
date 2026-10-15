import { describe, expect, it } from "vitest";
import { newGame, processTurn, validateCommand } from "@starlord/sim";

describe("ignoring an empire", () => {
  it("is a per-game choice toggled by command, only for empires you have met", () => {
    let state = newGame({ seed: "ignore", races: ["terran", "felhari"], humanPlayers: [0], monsters: false, raiders: false, council: false });
    expect(validateCommand(state, 0, { type: "setIgnore", target: 1, on: true }).ok).toBe(false);
    state.players[0]!.contacts.push(1);
    state.players[1]!.contacts.push(0);
    expect(validateCommand(state, 0, { type: "setIgnore", target: 0, on: true }).ok).toBe(false);
    expect(validateCommand(state, 0, { type: "setIgnore", target: 1, on: "yes" as unknown as boolean }).ok).toBe(false);
    state = processTurn(state, { 0: [{ type: "setIgnore", target: 1, on: true }] });
    expect(state.players[0]!.ignoring).toEqual([1]);
    state = processTurn(state, { 0: [{ type: "setIgnore", target: 1, on: true }] });
    expect(state.players[0]!.ignoring).toEqual([1]);
    state = processTurn(state, { 0: [{ type: "setIgnore", target: 1, on: false }] });
    expect(state.players[0]!.ignoring).toBeUndefined();
  });
});
