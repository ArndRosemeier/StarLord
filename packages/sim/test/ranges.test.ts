import { describe, expect, it } from "vitest";
import {
  CLIMATES, canColonize, canOutpost, newGame, playerView, refuelStars, scanRange, scannerEyes, validateCommand,
  type PlanetType,
} from "@starlord/sim";

const opts = { seed: "ranges", races: ["terran", "felhari"], monsters: false, raiders: false, council: false };

describe("settle predicates", () => {
  it("agree with what the colonize order accepts today", () => {
    for (const t of Object.keys(CLIMATES) as PlanetType[]) {
      expect(canColonize(t)).toBe(CLIMATES[t].habitable);
      expect(canOutpost(t)).toBe(true);
    }
    const s = newGame(opts);
    const me = s.players[0]!;
    const fleet = Object.values(s.fleets).find((f) => f.ownerId === 0 && f.ships.some((x) => me.designs.find((d) => d.id === x.designId)?.module === "colony"))!;
    for (const pid of s.galaxy.stars.find((x) => x.id === fleet.starId)!.planetIds) {
      const p = s.planets[pid]!;
      if (p.colonyId) continue;
      const ok = validateCommand(s, 0, { type: "colonize", fleetId: fleet.id, planetId: pid }).ok;
      // The starting fleet carries a colony ship only, which needs a habitable world.
      expect(ok).toBe(canColonize(p.type));
    }
  });
});

describe("empire ranges", () => {
  it("refuels at own colonies and scans from colonies and fleets, the same on the full state and the view", () => {
    const s = newGame(opts);
    const me = s.players[0]!;
    const home = s.galaxy.stars.find((x) => x.id === me.homeStarId)!;
    expect(refuelStars(s, 0).map((x) => x.id)).toEqual([home.id]);
    const eyes = scannerEyes(s, 0);
    expect(eyes.filter((e) => e.source === "colony")).toHaveLength(Object.values(s.colonies).filter((c) => c.ownerId === 0).length);
    expect(eyes.filter((e) => e.source === "fleet")).toHaveLength(Object.values(s.fleets).filter((f) => f.ownerId === 0).length);
    for (const e of eyes) expect(e.range).toBeGreaterThanOrEqual(scanRange(me));
    expect(scannerEyes(playerView(s, 0), 0)).toEqual(eyes);
    expect(refuelStars(playerView(s, 0), 0).map((x) => x.id)).toEqual([home.id]);
  });
});
