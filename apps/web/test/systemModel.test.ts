import { describe, expect, it } from "vitest";
import { GameSession } from "../src/game/session";
import { buildSystemModel } from "../src/three/system/systemModel";
import { orbitRadius } from "../src/three/system/systemScene";

const opts = { seed: "system", galaxySize: "small" as const, races: ["terran", "kordex", "zhrikk"] };

describe("system view model", () => {
  it("describes the home system with its colony, star base and fleets", () => {
    const s = GameSession.create(opts, 0);
    const view = s.view;
    const me = view.players[0]!;
    const sys = buildSystemModel(view, me.homeStarId)!;
    const star = view.galaxy.stars.find((x) => x.id === me.homeStarId)!;
    expect(sys.explored).toBe(true);
    expect(sys.name).toBe(star.name);
    expect(sys.planets.map((p) => p.id).sort()).toEqual([...star.planetIds].sort());
    // Planets come innermost first.
    expect(sys.planets.map((p) => p.orbit)).toEqual([...sys.planets.map((p) => p.orbit)].sort((a, b) => a - b));
    const home = sys.planets.find((p) => p.colony?.mine)!;
    expect(home.colony!.population).toBeGreaterThan(0);
    expect(home.colony!.station).toBe("starBase");
    const mine = sys.fleets.filter((f) => f.mine);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((f) => f.hull !== null && f.ships > 0 && !f.leaving)).toBe(true);
  });

  it("shows no planets for a system the viewer has not explored", () => {
    const s = GameSession.create(opts, 0);
    const view = s.view;
    const explored = new Set(view.players[0]!.explored);
    const far = view.galaxy.stars.find((x) => !explored.has(x.id) && x.planetIds.length > 0)!;
    const sys = buildSystemModel(view, far.id)!;
    expect(sys.explored).toBe(false);
    expect(sys.planets).toEqual([]);
    expect(buildSystemModel(view, "nowhere")).toBeNull();
  });

  it("spaces orbits outward", () => {
    for (let o = 1; o < 5; o++) expect(orbitRadius(o + 1)).toBeGreaterThan(orbitRadius(o));
  });
});
