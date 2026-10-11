import { describe, expect, it } from "vitest";
import {
  BASE_SCRAP_REFUND, PROJECT_COSTS, availableProjects, newGame, processTurn, validateCommand,
  type Colony, type GameState, type Planet,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

/** A game whose first empire's home system has at least `n` free habitable planets. */
function homeWithFree(n: number): { s: GameState; home: Colony; free: Planet[] } {
  for (let i = 0; ; i++) {
    const s = newGame({ seed: `bases${i}`, playerCount: 2, ...quiet });
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    const starId = s.planets[home.planetId]!.starId;
    const free = Object.values(s.planets).filter((p) => p.starId === starId && !p.colonyId);
    if (free.length < n) continue;
    // Plain habitable worlds of different sizes, so the best one is clear.
    free.forEach((p, k) => {
      p.type = "terran";
      p.size = (["tiny", "small", "medium", "large", "huge"] as const)[Math.min(4, k)]!;
    });
    s.players[0]!.techs.push("colonyBase");
    s.players[0]!.bc = 5000;
    return { s, home, free };
  }
}

/** Queues a project at the home colony and buys it, so it finishes this turn. */
function buildNow(s: GameState, home: Colony, id: string, planetId?: string): GameState {
  return processTurn(s, {
    0: [
      { type: "setQueue", colonyId: home.id, queue: [planetId ? { kind: "project", id, planetId } : { kind: "project", id }] },
      { type: "buy", colonyId: home.id },
    ],
  });
}

const ownedOn = (s: GameState, planetId: string) => s.colonies[s.planets[planetId]!.colonyId ?? ""]?.ownerId;

describe("colony bases", () => {
  it("settles the only free planet without asking", () => {
    const { s: s0, home, free } = homeWithFree(1);
    for (const p of free.slice(1)) p.type = "asteroids";
    const s = buildNow(s0, home, "colonyBase");
    expect(ownedOn(s, free[0]!.id)).toBe(0);
    expect(s.colonies[home.id]!.readyBases).toBeUndefined();
  });

  it("waits for the player to pick a planet when there are several", () => {
    const { s: s0, home, free } = homeWithFree(2);
    let s = buildNow(s0, home, "colonyBase");
    expect(free.every((p) => !s.planets[p.id]!.colonyId)).toBe(true);
    expect(s.colonies[home.id]!.readyBases).toEqual(["colonyBase"]);
    expect(s.events.some((e) => e.kind === "baseReady" && e.colonyId === home.id)).toBe(true);
    expect(validateCommand(s, 0, { type: "placeBase", colonyId: home.id, projectId: "colonyBase", planetId: home.planetId }).ok).toBe(false);

    const pick = free[1]!.id;
    s = processTurn(s, { 0: [{ type: "placeBase", colonyId: home.id, projectId: "colonyBase", planetId: pick }] });
    expect(ownedOn(s, pick)).toBe(0);
    expect(s.planets[free[0]!.id]!.colonyId).toBeFalsy();
    expect(s.colonies[home.id]!.readyBases).toBeUndefined();
  });

  it("uses the planet chosen when it was queued", () => {
    const { s: s0, home, free } = homeWithFree(2);
    const s = buildNow(s0, home, "colonyBase", free[1]!.id);
    expect(ownedOn(s, free[1]!.id)).toBe(0);
  });

  it("pays back half the cost when no planet is left, instead of losing it", () => {
    const { s: s0, home, free } = homeWithFree(1);
    for (const p of free) p.type = "asteroids";
    // Queued while a planet was free; the planet is gone by the time it finishes.
    s0.planets[free[0]!.id]!.type = "terran";
    let s = processTurn(s0, { 0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "project", id: "colonyBase" }] }] });
    s.planets[free[0]!.id]!.type = "asteroids";
    s = processTurn(s, { 0: [{ type: "buy", colonyId: home.id }] });
    const scrapped = s.events.find((e) => e.kind === "baseScrapped");
    expect(scrapped).toMatchObject({ projectId: "colonyBase", refund: PROJECT_COSTS.colonyBase * BASE_SCRAP_REFUND });
    expect(s.colonies[home.id]!.readyBases).toBeUndefined();
  });

  it("scraps a waiting base once every planet it could use is gone", () => {
    const { s: s0, home, free } = homeWithFree(2);
    let s = buildNow(s0, home, "colonyBase");
    for (const p of free) s.planets[p.id]!.type = "asteroids";
    s = processTurn(s, {});
    expect(s.colonies[home.id]!.readyBases).toBeUndefined();
    expect(s.events.some((e) => e.kind === "baseScrapped")).toBe(true);
  });

  it("never queues more bases than there are free planets", () => {
    const { s: s0, home, free } = homeWithFree(1);
    for (const p of free.slice(1)) p.type = "asteroids";
    const one = { kind: "project" as const, id: "colonyBase" };
    expect(validateCommand(s0, 0, { type: "setQueue", colonyId: home.id, queue: [one, one] }).ok).toBe(false);
    const s = processTurn(s0, { 0: [{ type: "setQueue", colonyId: home.id, queue: [one] }] });
    expect(availableProjects(s, 0, s.colonies[home.id]!)).not.toContain("colonyBase");
    // Reordering keeps it; an Outpost Base would need the same planet.
    expect(validateCommand(s, 0, { type: "setQueue", colonyId: home.id, queue: [{ kind: "project", id: "spy" }, one] }).ok).toBe(true);
    s.players[0]!.techs.push("outpostShip");
    expect(validateCommand(s, 0, { type: "setQueue", colonyId: home.id, queue: [{ kind: "project", id: "outpostBase" }, one] }).ok).toBe(false);
  });

});
