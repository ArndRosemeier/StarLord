import { describe, expect, it } from "vitest";
import {
  buildCustomRace, getRace, newGame, newRecord, playerView, processTurn, raceCost, recordTurn, replayRecord,
  stateHash, validateCustomRace, type CustomRaceSpec,
} from "@starlord/sim";

const spec = (over: Partial<CustomRaceSpec["picks"]> = {}): CustomRaceSpec => ({
  name: "Vorn", plural: "Vorn", description: "Test race.", color: "#33aa77", assetKey: "gorvath",
  picks: {
    growth: 0, farming: 0, industry: 1, science: 1, money: 0, shipAttack: 0, shipDefense: 0, groundCombat: 0, spying: 0,
    government: "dictatorship", traits: ["largeHomeworld"], ...over,
  },
});

describe("custom races", () => {
  it("cost points and stay within the budget", () => {
    expect(raceCost(spec().picks)).toEqual({ total: 7, negative: 0 });
    expect(validateCustomRace(spec())).toBeNull();
    expect(validateCustomRace(spec({ traits: ["creative", "tolerant"] }))).toMatch(/points/);
    expect(validateCustomRace(spec({ traits: ["lowG", "highG"] }))).toMatch(/exclude/);
    expect(validateCustomRace(spec({ industry: 3 }))).toMatch(/invalid/);
    // Drawbacks pay for strengths, up to the limit.
    expect(validateCustomRace(spec({ government: "feudal", traits: ["creative"], industry: 0, science: 0, growth: -0.5 }))).toBeNull();
  });

  it("get a stable id from their contents", () => {
    expect(buildCustomRace(spec()).id).toBe(buildCustomRace(spec()).id);
    expect(buildCustomRace(spec()).id).not.toBe(buildCustomRace(spec({ industry: 2 })).id);
  });

  it("play and replay like built-in races", () => {
    const race = buildCustomRace(spec());
    const options = { seed: "custom", galaxySize: "small" as const, races: [race.id, "terran"], customRaces: [spec()] };
    let state = newGame(options);
    expect(state.players[0]!.raceId).toBe(race.id);
    expect(state.settings.customRaces?.[0]?.name).toBe("Vorn");
    const record = newRecord(options);
    for (let i = 0; i < 5; i++) {
      state = processTurn(state, { 0: [], 1: [] });
      recordTurn(record, { 0: [], 1: [] }, state);
    }
    expect(stateHash(replayRecord(JSON.parse(JSON.stringify(record))))).toBe(stateHash(state));
    expect(getRace(playerView(state, 1).players[0]!.raceId).assetKey).toBe("gorvath");
  });
});
