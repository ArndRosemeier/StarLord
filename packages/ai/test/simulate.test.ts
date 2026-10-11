import { describe, expect, it } from "vitest";
import { checkInvariants, newGame } from "@starlord/sim";
import { Simulation } from "@starlord/ai";

describe("headless simulation", () => {
  it("plays an all-AI game without crashes or broken invariants", () => {
    const sim = new Simulation({ seed: "soak-test", galaxySize: "small", playerCount: 4, maxTurns: 80 });
    const result = sim.run();
    expect(result.crashed).toBe(false);
    expect(result.problems.filter((p) => p.kind !== "slowTurn")).toEqual([]);
    expect(result.over).toBe(true);
    expect(result.turns).toBeGreaterThan(0);
    expect(result.victory).not.toBeNull();
    expect(result.empires).toHaveLength(4);
    expect(result.events.colonyFounded ?? 0).toBeGreaterThan(0);
  });

  it("is deterministic: the same seed plays the same game", () => {
    const a = new Simulation({ seed: 7, galaxySize: "small", playerCount: 3, maxTurns: 40 }).run();
    const b = new Simulation({ seed: 7, galaxySize: "small", playerCount: 3, maxTurns: 40 }).run();
    expect(a.empires).toEqual(b.empires);
    expect(a.events).toEqual(b.events);
  });

  it("reports a crash instead of throwing", () => {
    const sim = new Simulation({ seed: 1, galaxySize: "small", playerCount: 2, maxTurns: 10 });
    sim.state = { ...sim.state, players: null as never };
    expect(sim.step()).toBe(false);
    expect(sim.result.crashed).toBe(true);
    expect(sim.result.problems[0]!.kind).toBe("crash");
  });
});

describe("invariants", () => {
  it("accept a new game", () => {
    expect(checkInvariants(newGame({ seed: 3, playerCount: 4 }))).toEqual([]);
  });

  it("catch broken references and bad numbers", () => {
    const s = newGame({ seed: 3, playerCount: 2 });
    const colony = Object.values(s.colonies)[0]!;
    s.planets[colony.planetId]!.colonyId = null;
    s.players[0]!.bc = NaN;
    const fleet = Object.values(s.fleets)[0]!;
    fleet.ships = [];
    const problems = checkInvariants(s);
    expect(problems.some((p) => p.includes("doesn't point back"))).toBe(true);
    expect(problems.some((p) => p.includes("bc is NaN"))).toBe(true);
    expect(problems.some((p) => p.includes("has no ships"))).toBe(true);
  });
});
