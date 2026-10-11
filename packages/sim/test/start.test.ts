import { describe, expect, it } from "vitest";
import { computeOutput, newGame, newUnitJob, type Colony } from "@starlord/sim";

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

  it("grown units keep industry and research even", () => {
    const c = { workers: 3, scientists: 3 } as Colony;
    expect(newUnitJob(c)).toBe("workers");
    expect(newUnitJob({ ...c, workers: 4 })).toBe("scientists");
  });
});
