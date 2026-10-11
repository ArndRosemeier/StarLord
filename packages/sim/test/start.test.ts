import { describe, expect, it } from "vitest";
import { Rng, computeOutput, newColonistJob, newGame, seedRng, type Colony, type NewColonistContext } from "@starlord/sim";

describe("start conditions", () => {
  for (const techLevel of ["preWarp", "average", "advanced"] as const) {
    it(`every empire starts with 2 scouts, 1 colony ship and a star base (${techLevel})`, () => {
      const s = newGame({ seed: `start-${techLevel}`, races: ["terran", "felhari", "terran", "felhari"], techLevel });
      const empires = s.players.filter((p) => p.kind === "empire");
      expect(empires.length).toBe(4);
      for (const p of empires) {
        const ships: Record<string, number> = {};
        for (const f of Object.values(s.fleets).filter((f) => f.ownerId === p.id)) {
          for (const st of f.ships) ships[st.designId] = (ships[st.designId] ?? 0) + st.count;
        }
        expect(ships).toEqual({ scout: 2, colonyShip: 1 });
        const home = s.galaxy.stars.find((st) => st.id === p.homeStarId)!;
        const hw = Object.values(s.colonies).find((c) => c.ownerId === p.id && s.planets[c.planetId]!.starId === home.id)!;
        expect(hw.buildings.filter((b) => ["starBase", "battlestation", "starFortress"].includes(b))).toEqual(["starBase"]);
      }
    });
  }
});

describe("default jobs", () => {
  it("homeworlds start fed, with research staffed as well as industry", () => {
    const s = newGame({ seed: "default-jobs", races: ["terran", "felhari", "terran", "felhari"] });
    for (const c of Object.values(s.colonies)) {
      const p = s.players[c.ownerId]!;
      expect(computeOutput(s.planets[c.planetId]!, p, c).foodNet).toBeGreaterThanOrEqual(0);
      expect(c.scientists).toBeGreaterThan(0);
      expect(c.workers - c.scientists).toBeGreaterThanOrEqual(0);
      expect(c.workers - c.scientists).toBeLessThanOrEqual(1);
    }
  });

  const fed: NewColonistContext = { canFarm: true, foodNet: 2, foodNeed: 1, empireFoodNet: 3, industry: 10, upkeepAfter: 0 };
  const rng = () => new Rng(seedRng("jobs"));

  it("a newcomer farms when the colony or the empire would go hungry", () => {
    const c = { farmers: 2, workers: 3, scientists: 3 } as Colony;
    expect(newColonistJob(c, { ...fed, foodNet: 0.5 }, rng())).toBe("farmers");
    expect(newColonistJob(c, { ...fed, empireFoodNet: -1 }, rng())).toBe("farmers");
    expect(newColonistJob(c, { ...fed, empireFoodNet: 0 }, rng())).toBe("farmers");
    // Where nothing grows, food never decides.
    expect(newColonistJob(c, { ...fed, canFarm: false, foodNet: -3 }, rng())).not.toBe("farmers");
  });

  it("a newcomer works when industry can't cover cybernetic or android upkeep", () => {
    const c = { farmers: 2, workers: 0, scientists: 5 } as Colony;
    expect(newColonistJob(c, { ...fed, industry: 2, upkeepAfter: 3 }, rng())).toBe("workers");
  });

  it("otherwise newcomers follow the current mix of workers and scientists", () => {
    const r = rng();
    const count = { workers: 0, scientists: 0, farmers: 0 };
    for (let i = 0; i < 4000; i++) count[newColonistJob({ farmers: 2, workers: 1, scientists: 3 } as Colony, fed, r)]++;
    expect(count.farmers).toBe(0);
    expect(count.scientists / 4000).toBeGreaterThan(0.7);
    expect(count.scientists / 4000).toBeLessThan(0.8);
    expect(newColonistJob({ farmers: 4, workers: 0, scientists: 0 } as Colony, fed, rng())).toBe("workers");
  });
});
