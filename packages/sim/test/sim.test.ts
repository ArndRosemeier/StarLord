import { describe, expect, it } from "vitest";
import {
  RACES, STAR_COUNTS, colonyOutput, getRace, maxPopulation, newGame, playerView, processTurn, stateHash,
  type GameState,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

describe("new game", () => {
  it("is fully determined by its seed", () => {
    expect(stateHash(newGame({ seed: 7 }))).toBe(stateHash(newGame({ seed: 7 })));
    expect(stateHash(newGame({ seed: 7 }))).not.toBe(stateHash(newGame({ seed: 8 })));
  });

  it("creates the requested galaxy and fed homeworlds", () => {
    const s = newGame({ seed: "x", galaxySize: "large", playerCount: 6, ...quiet });
    expect(s.galaxy.stars.length).toBe(STAR_COUNTS.large);
    expect(s.players.length).toBe(6);
    for (const p of s.players) {
      const home = Object.values(s.colonies).find((c) => c.ownerId === p.id)!;
      expect(colonyOutput(s, home).foodNet).toBeGreaterThanOrEqual(0);
    }
  });

  it("adds Orion, monster lairs and the raiders' hidden home", () => {
    const s = newGame({ seed: "npc" });
    expect(s.players.map((p) => p.kind)).toEqual(["empire", "empire", "empire", "empire", "monsters", "raiders"]);
    expect(s.galaxy.stars.filter((x) => x.special === "orion")).toHaveLength(1);
    expect(s.galaxy.stars.filter((x) => x.special === "raiderHome")).toHaveLength(1);
    const guardian = Object.values(s.fleets).find((f) => f.ships[0]!.designId === "guardian");
    expect(guardian).toBeDefined();
  });

  it("can seat every race", () => {
    const s = newGame({ seed: "all", galaxySize: "huge", races: RACES.map((r) => r.id) });
    expect(s.players.filter((p) => p.kind === "empire").map((p) => p.raceId)).toEqual(RACES.map((r) => r.id));
  });

  it("survives a JSON round trip, so saves are just JSON", () => {
    const s = newGame({ seed: 3 });
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(stateHash(processTurn(copy, {}))).toBe(stateHash(processTurn(s, {})));
  });
});

describe("turns", () => {
  it("does not mutate the previous state", () => {
    const s = newGame({ seed: 1 });
    const before = stateHash(s);
    processTurn(s, {});
    expect(stateHash(s)).toBe(before);
  });

  it("rejects invalid commands without throwing", () => {
    const s = newGame({ seed: 1 });
    const next = processTurn(s, { 0: [{ type: "setJobs", colonyId: "nope", farmers: 1, workers: 1, scientists: 1 }] });
    expect(next.events.some((e) => e.kind === "commandRejected")).toBe(true);
  });

  it("colonizes a free planet in the home system", () => {
    let s = newGame({ seed: "col", playerCount: 2, ...quiet });
    const fleet = Object.values(s.fleets).find((f) => f.ownerId === 0 && f.ships[0]!.designId === "colonyShip")!;
    const home = s.players[0]!.homeStarId;
    const target = Object.values(s.planets).find(
      (p) => p.starId === home && !p.colonyId && maxPopulation(p, getRace(s.players[0]!.raceId)) > 0 &&
        !["asteroids", "gasGiant"].includes(p.type),
    );
    if (!target) return; // seed-dependent: no free habitable planet at home
    s = processTurn(s, { 0: [{ type: "colonize", fleetId: fleet.id, planetId: target.id }] });
    expect(s.planets[target.id]!.colonyId).not.toBeNull();
    expect(s.fleets[fleet.id]).toBeUndefined();
  });

  it("hides unexplored planets from a player's view", () => {
    const s = newGame({ seed: "fog", playerCount: 2, races: ["terran", "kordex"], ...quiet });
    const view = playerView(s, 0);
    const starsWithPlanets = new Set(Object.values(view.planets).map((p) => p.starId));
    expect([...starsWithPlanets]).toEqual([s.players[0]!.homeStarId]);
  });

  it("learns the chosen tech when a tier completes", () => {
    let s = newGame({ seed: "tech", races: ["terran", "kordex"], ...quiet });
    s.players[0]!.research.progress = 1000;
    s = processTurn(s, { 0: [{ type: "setResearch", tierId: "astroBiology", techId: "biospheres" }] });
    expect(s.players[0]!.techs).toContain("biospheres");
    expect(s.players[0]!.techs).not.toContain("soilEnrichment");
  });

  it("gives creative races every tech in a tier", () => {
    let s = newGame({ seed: "tech", races: ["ythari", "kordex"], ...quiet });
    s.players[0]!.research.progress = 1000;
    s = processTurn(s, { 0: [{ type: "setResearch", tierId: "astroBiology", techId: "biospheres" }] });
    expect(s.players[0]!.techs).toEqual(expect.arrayContaining(["biospheres", "soilEnrichment"]));
  });

  it("builds a queued building", () => {
    let s = newGame({ seed: "build", races: ["terran", "kordex"], ...quiet });
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    s.players[0]!.techs.push("automatedFactory");
    s = processTurn(s, { 0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "building", id: "automatedFactory" }] }] });
    s.colonies[home.id]!.progress = 1000;
    s = processTurn(s, {});
    expect(s.colonies[home.id]!.buildings).toContain("automatedFactory");
  });
});
