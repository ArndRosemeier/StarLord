import { describe, expect, it } from "vitest";
import {
  GUARDIAN_RANDOM_XENON, RACES, Rng, STAR_COUNTS, XENON_FIELD_TECHS, guardianSlain, seedRng, availableProjects, canReach, colonyOutput, empires, getRace, maxPopulation, newGame, playerView, processTurn, stateHash, UNKNOWN_STAR_NAME,
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

  it("rewards the Guardian's slayer with the Death Ray and three more xenon techs", () => {
    const s = newGame({ seed: "npc" });
    const orion = s.galaxy.stars.find((x) => x.special === "orion")!;
    const before = s.players[0]!.techs.length;
    guardianSlain({ state: s, rng: new Rng(seedRng(1)), emit: () => {} }, 0, orion.id);
    const techs = s.players[0]!.techs;
    expect(techs).toContain("deathRay");
    expect(techs.filter((t) => XENON_FIELD_TECHS.includes(t) && t !== "deathRay")).toHaveLength(GUARDIAN_RANDOM_XENON);
    expect(techs.length).toBe(before + 1 + GUARDIAN_RANDOM_XENON);
    expect(techs).not.toContain("phaseShifter");
  });

  it("always gives every empire's first ships a system with a real planet in reach, as the original does", () => {
    for (const galaxySize of ["small", "medium", "large", "huge"] as const) {
      for (let i = 0; i < 40; i++) {
        const s = newGame({ seed: `reach${i}`, galaxySize, playerCount: 6 });
        for (const p of empires(s)) {
          const fleet = Object.values(s.fleets).find((f) => f.ownerId === p.id)!;
          const reachable = s.galaxy.stars.filter((st) => st.id !== fleet.starId && canReach(s, p.id, fleet, st.id)
            && st.planetIds.some((id) => !["asteroids", "gasGiant"].includes(s.planets[id]!.type)));
          expect(reachable.length, `${galaxySize} seed reach${i} player ${p.id}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
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

  it("keeps colony ships off asteroids and gas giants until an Artificial Planet converts them", () => {
    let s = newGame({ seed: "col", playerCount: 2, ...quiet });
    const fleet = Object.values(s.fleets).find((f) => f.ownerId === 0 && f.ships[0]!.designId === "colonyShip")!;
    const home = s.players[0]!.homeStarId;
    const free = Object.values(s.planets).filter((p) => p.starId === home && !p.colonyId);
    free.forEach((p, i) => (p.type = i % 2 ? "gasGiant" : "asteroids"));
    const target = free[0]!;
    s = processTurn(s, { 0: [{ type: "colonize", fleetId: fleet.id, planetId: target.id }] });
    expect(s.planets[target.id]!.colonyId).toBeNull();
    expect(s.events.some((e) => e.kind === "commandRejected")).toBe(true);

    s.players[0]!.techs.push("outpostShip", "artificialPlanet");
    const colony = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    const projects = availableProjects(s, 0, colony);
    expect(projects).not.toContain("outpostBase");
    expect(projects).toContain("artificialPlanet");
  });

  it("hides unexplored planets from a player's view", () => {
    const s = newGame({ seed: "fog", playerCount: 2, races: ["terran", "kordex"], ...quiet });
    const view = playerView(s, 0);
    const starsWithPlanets = new Set(Object.values(view.planets).map((p) => p.starId));
    expect([...starsWithPlanets]).toEqual([s.players[0]!.homeStarId]);
  });

  it("keeps a monster hidden, even within scanner range, until its system is explored", () => {
    const s = newGame({ seed: "fog", playerCount: 2, races: ["terran", "kordex"], monsters: true, raiders: false, council: false });
    const me = s.players[0]!;
    const lair = Object.values(s.fleets).find((f) => s.players[f.ownerId]!.kind === "monsters" && !me.explored.includes(f.starId!))!;
    // Park one of our scouts right next to the lair: close enough for any scanner.
    const scout = Object.values(s.fleets).find((f) => f.ownerId === 0)!;
    Object.assign(scout, { starId: null, destStarId: null, x: lair.x + 0.1, y: lair.y });
    expect(playerView(s, 0).fleets[lair.id]).toBeUndefined();
    me.explored.push(lair.starId!);
    expect(playerView(s, 0).fleets[lair.id]).toBeDefined();
  });

  it("learns the chosen tech when a tier completes", () => {
    let s = newGame({ seed: "tech", races: ["terran", "kordex"], ...quiet });
    s.players[0]!.research.progress = 1000;
    s = processTurn(s, { 0: [{ type: "setResearch", tierId: "astroBiology", techId: "biospheres" }] });
    expect(s.players[0]!.techs).toContain("biospheres");
    expect(s.players[0]!.techs).not.toContain("hydroponicFarm");
  });

  it("gives creative races every tech in a tier", () => {
    let s = newGame({ seed: "tech", races: ["ythari", "kordex"], ...quiet });
    s.players[0]!.research.progress = 1000;
    s = processTurn(s, { 0: [{ type: "setResearch", tierId: "astroBiology", techId: "biospheres" }] });
    expect(s.players[0]!.techs).toEqual(expect.arrayContaining(["biospheres", "hydroponicFarm"]));
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

describe("unexplored systems", () => {
  it("hide their names, Orion's included, until explored", () => {
    const s = newGame({ seed: "names", races: ["terran", "felhari"] });
    const v = playerView(s, 0);
    const me = v.players[0]!;
    for (const star of v.galaxy.stars) {
      const real = s.galaxy.stars.find((x) => x.id === star.id)!.name;
      expect(star.name).toBe(me.explored.includes(star.id) ? real : UNKNOWN_STAR_NAME);
    }
    expect(v.galaxy.stars.some((x) => x.name === "Orion")).toBe(false);
    expect(s.galaxy.stars.some((x) => x.name === "Orion")).toBe(true);
  });

  it("hide Orion's special until it is explored", () => {
    const s = newGame({ seed: "names", races: ["terran", "felhari"] });
    const orion = s.galaxy.stars.find((x) => x.special === "orion")!;
    expect(s.players[0]!.explored).not.toContain(orion.id);
    expect(playerView(s, 0).galaxy.stars.find((x) => x.id === orion.id)!.special).toBeNull();
    s.players[0]!.explored.push(orion.id);
    expect(playerView(s, 0).galaxy.stars.find((x) => x.id === orion.id)!.special).toBe("orion");
  });
});
