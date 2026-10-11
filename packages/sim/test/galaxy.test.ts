import { describe, expect, it } from "vitest";
import {
  BLACK_HOLE_CLEARANCE, FIRST_FIELDS, PLANETS_PER_STAR_D10, Rng, STAR_COUNTS, TECH_TIERS, distance, empires, generateGalaxy,
  getRace, gravityOf, mapSize, meanPlanets, monstersId, newGame, seedRng, type GalaxySize, type Planet, type StarColor,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };
const SIZES: GalaxySize[] = ["small", "medium", "large", "huge"];
const real = (p: Planet) => p.type !== "asteroids" && p.type !== "gasGiant";

function galaxies(size: GalaxySize, n: number, age: "young" | "average" | "old" = "average") {
  const out = [];
  for (let i = 0; out.length < n; i++) {
    const rng = new Rng(seedRng(`gal-${size}-${age}-${i}`));
    let id = 0;
    const g = generateGalaxy(rng, size, (p) => `${p}${id++}`, age);
    if (g) out.push(g);
  }
  return out;
}

describe("decoded galaxy tables", () => {
  it("has the original's star counts and map sizes", () => {
    expect(STAR_COUNTS).toEqual({ small: 20, medium: 36, large: 54, huge: 71 });
    expect(mapSize("small")).toEqual({ width: 16.87, height: 13.33 });
    expect(mapSize("huge")).toEqual({ width: 50.6, height: 40 });
    for (const galaxySize of SIZES) {
      const s = newGame({ seed: `count-${galaxySize}`, galaxySize, ...quiet });
      expect(s.galaxy.stars.length).toBe(STAR_COUNTS[galaxySize]);
      expect(s.galaxy).toMatchObject(mapSize(galaxySize));
    }
  });

  it("rolls planets per star on the d10 table by colour", () => {
    expect(PLANETS_PER_STAR_D10.brown.filter((n) => n === 1)).toHaveLength(3);
    expect(PLANETS_PER_STAR_D10.blackHole.every((n) => n === 0)).toBe(true);
    expect(meanPlanets("blue")).toBeCloseTo(2.8);
    expect(meanPlanets("white")).toBeCloseTo(2.1);
    expect(meanPlanets("yellow")).toBeCloseTo(3.1);
    expect(meanPlanets("orange")).toBeCloseTo(3.5);
    expect(meanPlanets("red")).toBeCloseTo(1.9);
    expect(meanPlanets("brown")).toBeCloseTo(0.3);

    const counts: Partial<Record<StarColor, number[]>> = {};
    for (const g of galaxies("huge", 60, "old")) {
      for (const s of g.stars) (counts[s.color] ??= []).push(s.planetIds.length);
    }
    for (const [color, list] of Object.entries(counts) as [StarColor, number[]][]) {
      const allowed = new Set(PLANETS_PER_STAR_D10[color]);
      expect(list.every((n) => allowed.has(n)), color).toBe(true);
    }
    const mean = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;
    expect(mean(counts.yellow!)).toBeGreaterThan(2.9);
    expect(mean(counts.yellow!)).toBeLessThan(3.3);
    expect(mean(counts.red!)).toBeGreaterThan(1.7);
    expect(mean(counts.red!)).toBeLessThan(2.1);
    const brownWithPlanet = counts.brown!.filter((n) => n === 1).length / counts.brown!.length;
    expect(brownWithPlanet).toBeGreaterThan(0.15);
    expect(brownWithPlanet).toBeLessThan(0.45);
  });

  it("derives gravity from minerals and size", () => {
    expect(["tiny", "small", "medium", "large", "huge"].map((s) => gravityOf(s as never, "ultraPoor"))).toEqual(["low", "low", "low", "normal", "normal"]);
    expect(["tiny", "small", "medium", "large", "huge"].map((s) => gravityOf(s as never, "poor"))).toEqual(["low", "low", "normal", "normal", "normal"]);
    expect(["tiny", "small", "medium", "large", "huge"].map((s) => gravityOf(s as never, "abundant"))).toEqual(["low", "normal", "normal", "normal", "heavy"]);
    expect(["tiny", "small", "medium", "large", "huge"].map((s) => gravityOf(s as never, "rich"))).toEqual(["normal", "normal", "normal", "heavy", "heavy"]);
    expect(["tiny", "small", "medium", "large", "huge"].map((s) => gravityOf(s as never, "ultraRich"))).toEqual(["normal", "normal", "heavy", "heavy", "heavy"]);
  });

  it("keeps black holes clear of every star, never makes inferno worlds and puts no gas giant in orbit 1", () => {
    for (const size of SIZES) {
      for (const g of galaxies(size, 15, "old")) {
        for (const bh of g.stars.filter((s) => s.color === "blackHole")) {
          for (const s of g.stars) if (s !== bh) expect(distance(s, bh)).toBeGreaterThanOrEqual(BLACK_HOLE_CLEARANCE);
        }
        const planets = Object.values(g.planets);
        expect(planets.some((p) => p.type === "inferno")).toBe(false);
        expect(planets.some((p) => p.type === "gasGiant" && p.orbit === 1)).toBe(false);
        for (const s of g.stars) expect(s.x >= 0 && s.x <= g.width && s.y >= 0 && s.y <= g.height).toBe(true);
      }
    }
  });
});

describe("home systems and starts", () => {
  it("generates every galaxy size for every player count", () => {
    for (const galaxySize of SIZES) {
      for (const playerCount of [2, 4, 6, 8]) {
        for (const galaxyAge of ["young", "old"] as const) {
          const s = newGame({ seed: `all-${galaxySize}-${playerCount}-${galaxyAge}`, galaxySize, playerCount, galaxyAge });
          expect(empires(s)).toHaveLength(playerCount);
        }
      }
    }
  });

  it("gives every home three real planets, a classic homeworld and the guaranteed neighbours", () => {
    for (let i = 0; i < 12; i++) {
      const s = newGame({ seed: `homes${i}`, galaxySize: SIZES[i % 4]!, playerCount: 6 });
      const homes = empires(s).map((p) => s.galaxy.stars.find((x) => x.id === p.homeStarId)!);
      for (const [k, p] of empires(s).entries()) {
        const home = homes[k]!;
        const planets = home.planetIds.map((id) => s.planets[id]!);
        expect(home.color).not.toBe("blackHole");
        // Specials are cleared; a wormhole may still end here (the far end may be a home, as in the original).
        expect([undefined, "wormhole"]).toContain(home.feature);
        expect(planets.filter(real).length).toBeGreaterThanOrEqual(3);
        expect(planets.every((pl) => pl.special === "none" || pl.colonyId)).toBe(true);
        const hw = planets.find((pl) => pl.colonyId)!;
        const race = getRace(p.raceId);
        expect(hw.type).toBe(race.picks.traits.includes("aquatic") ? "ocean" : "terran");
        const near = s.galaxy.stars.filter((x) => x !== home && distance(x, home) <= 4);
        expect(near.some((x) => x.planetIds.some((id) => real(s.planets[id]!)))).toBe(true);
        if (!race.picks.traits.includes("lithovore")) {
          const food = s.galaxy.stars.filter((x) => distance(x, home) <= 6).flatMap((x) => x.planetIds.map((id) => s.planets[id]!))
            .filter((pl) => pl !== hw && real(pl) && ["desert", "tundra", "ocean", "swamp", "arid", "terran", "gaia"].includes(pl.type));
          expect(food.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("places Orion near the centre with its huge Gaia world and the lairs away from homes", () => {
    for (let i = 0; i < 8; i++) {
      const s = newGame({ seed: `orion${i}`, galaxySize: SIZES[i % 4]!, difficulty: "impossible" });
      const orion = s.galaxy.stars.find((x) => x.special === "orion")!;
      expect(distance(orion, { x: s.galaxy.width / 2, y: s.galaxy.height / 2 })).toBeLessThanOrEqual(8);
      const planets = orion.planetIds.map((id) => s.planets[id]!);
      expect(planets.filter((p) => p.type === "gaia")).toHaveLength(1);
      expect(planets.find((p) => p.type === "gaia")).toMatchObject({ size: "huge", minerals: "ultraRich", gravity: "normal" });
      expect(planets.filter((p) => p.type !== "gaia").every((p) => p.type === "asteroids")).toBe(true);
      const lairs = Object.values(s.fleets).filter((f) => f.ownerId === monstersId(s) && f.starId !== orion.id);
      expect(lairs.length).toBeLessThanOrEqual(20);
      const homeIds = empires(s).map((p) => p.homeStarId);
      expect(lairs.some((f) => homeIds.includes(f.starId!))).toBe(false);
    }
  });

  it("starts with the original's fields and money", () => {
    const fields = (techLevel: "preWarp" | "average" | "advanced") =>
      newGame({ seed: "fields", races: ["terran", "quillan"], techLevel, ...quiet }).players[0]!.tiers;
    expect(fields("preWarp")).toEqual(["engineering"]);
    expect(fields("average")).toEqual(FIRST_FIELDS);
    const advanced = fields("advanced");
    expect(advanced).toHaveLength(25);
    for (const id of advanced) {
      const t = TECH_TIERS.find((x) => x.id === id)!;
      expect(t.prev === null || advanced.includes(t.prev)).toBe(true);
    }
    const s = newGame({ seed: "money", races: ["terran", "quillan"], techLevel: "advanced", ...quiet });
    // Quillan have the +1 BC money pick (level 2): (2 + 2) x 100.
    expect(getRace("quillan").picks.money).toBe(1);
    expect(s.players[1]!.bc).toBe(400);
    expect(s.players[0]!.bc).toBe(200);
  });
});
