import { describe, expect, it } from "vitest";
import { canColonize, canOutpost, distance, fleetRange, newGame, playerView, scanRange, type GameState } from "@starlord/sim";
import { planetRows } from "../src/game/planets";
import { buildScene, unionArcs } from "../src/map/scene";
import { sortRows } from "../src/ui/sort";

const opts = { seed: "planets", galaxySize: "small" as const, races: ["terran", "kordex", "zhrikk"], monsters: false, raiders: false };

/** A new game where player 0 has also explored the stars within `reach` parsecs of home. */
function explored(reach: number): GameState {
  const s = newGame(opts);
  const me = s.players[0]!;
  const home = s.galaxy.stars.find((x) => x.id === me.homeStarId)!;
  for (const st of s.galaxy.stars) if (distance(st, home) <= reach && !me.explored.includes(st.id)) me.explored.push(st.id);
  return s;
}

describe("Planets screen rows", () => {
  it("lists every planet of explored systems with the sim's settle rules and distances", () => {
    const s = explored(12);
    const view = playerView(s, 0);
    const rows = planetRows(view);
    expect(rows.length).toBe(Object.keys(view.planets).length);
    for (const r of rows) {
      expect(r.colonizable).toBe(!r.planet.colonyId && canColonize(r.planet.type));
      expect(r.outpostable).toBe(!r.planet.colonyId && canOutpost(r.planet.type));
      if (!canColonize(r.planet.type)) expect(r.maxPop).toBe(0);
    }
    const home = rows.find((r) => r.colony?.ownerId === 0)!;
    expect(home.distance).toBe(0);
    expect(home.inRange).toBe(true);
    const far = rows.filter((r) => r.distance > fleetRange(view.players[0]!));
    for (const r of far) expect(r.inRange).toBe(false);
  });

  it("offers the starting colony ship, in orbit or sent, for free planets", () => {
    const s = explored(12);
    const view = playerView(s, 0);
    const rows = planetRows(view);
    const free = rows.filter((r) => r.colonizable && !r.guarded);
    const home = view.players[0]!.homeStarId;
    // Free planets at home can be settled right away; reachable ones elsewhere get a send button.
    for (const r of free.filter((x) => x.star.id === home)) expect(r.here?.outpost).toBe(false);
    const away = free.filter((r) => r.star.id !== home && r.inRange);
    expect(away.length).toBeGreaterThan(0);
    for (const r of away) {
      expect(r.sendColony).not.toBeNull();
      expect(r.sendColony!.turns).toBeGreaterThan(0);
    }
  });
});

describe("sortable tables", () => {
  it("sorts both ways and keeps rows without a value last", () => {
    const rows = [{ v: 2 }, { v: null }, { v: 5 }, { v: Infinity }, { v: 1 }];
    const get = (r: { v: number | null }) => r.v;
    expect(sortRows(rows, { key: "v", dir: "asc" }, get).map(get)).toEqual([1, 2, 5, null, Infinity]);
    expect(sortRows(rows, { key: "v", dir: "desc" }, get).map(get)).toEqual([5, 2, 1, null, Infinity]);
    const names = [{ n: "Sol 10" }, { n: "Sol 9" }, { n: "Ara" }];
    expect(sortRows(names, { key: "n", dir: "asc" }, (r) => r.n).map((r) => r.n)).toEqual(["Ara", "Sol 9", "Sol 10"]);
  });
});

describe("map range overlays", () => {
  it("draws fuel range around refuelling stars and scanner range around colonies and fleets only when switched on", () => {
    const view = playerView(newGame(opts), 0);
    const me = view.players[0]!;
    const off = buildScene(view, null, null);
    expect(off.fuelRange).toEqual([]);
    expect(off.scanRange).toEqual([]);
    const on = buildScene(view, null, null, true, { fuel: true, scan: true });
    const home = view.galaxy.stars.find((x) => x.id === me.homeStarId)!;
    expect(on.fuelRange).toEqual([{ x: home.x, y: home.y, r: fleetRange(me) }]);
    // Starting fleets sit at home, so their scanner circle merges with the colony's.
    expect(on.scanRange.some((c) => c.x === home.x && c.y === home.y && c.r === scanRange(me))).toBe(true);
  });

  it("outlines only the outer edge of overlapping circles", () => {
    const [a, b] = unionArcs([{ x: 0, y: 0, r: 2 }, { x: 2, y: 0, r: 2 }]);
    const length = (arcs: [number, number][]) => arcs.reduce((n, [s, e]) => n + e - s, 0);
    // Each circle loses the third of its rim inside the other.
    expect(length(a!.arcs)).toBeCloseTo((Math.PI * 4) / 3, 1);
    expect(length(b!.arcs)).toBeCloseTo((Math.PI * 4) / 3, 1);
    const [inner] = unionArcs([{ x: 0, y: 0, r: 1 }, { x: 0, y: 0, r: 3 }]);
    expect(inner!.arcs).toEqual([]);
    const [alone] = unionArcs([{ x: 0, y: 0, r: 1 }]);
    expect(length(alone!.arcs)).toBeCloseTo(Math.PI * 2, 5);
  });
});
