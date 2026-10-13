import { describe, expect, it } from "vitest";
import { newGame, processTurn, travelTurns, type Fleet, type GameState, type Leader } from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

function addFleet(s: GameState, starId: string, designId: string): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = {
    id: `t${s.nextId++}`, ownerId: 0, x: star.x, y: star.y, starId, destStarId: null,
    ships: [{ designId, count: 1 }], stance: "defend", name: designId,
  };
  s.fleets[f.id] = f;
  return f;
}

function navigator(s: GameState, fleetId: string): void {
  const l = {
    id: "nav", heroId: 0, name: "Nav", title: "Navigator", kind: "captain", xp: 0, level: 3,
    abilities: [{ skill: "navigator", improved: false }], techs: [], skills: { galaxySpeed: 2 }, hireCost: 0, salary: 0,
    status: "hired", offeredTo: null, ownerId: 0, assignedTo: fleetId, travel: null, availableUntil: 0,
  } as unknown as Leader;
  s.leaders[l.id] = l;
}

/** A star a few turns away from home, within fuel range. */
function target(s: GameState) {
  const home = s.galaxy.stars.find((x) => x.id === s.players[0]!.homeStarId)!;
  return s.galaxy.stars
    .filter((x) => x.color !== "blackHole" && x.id !== home.id)
    .map((x) => ({ x, d: Math.hypot(x.x - home.x, x.y - home.y) }))
    .filter((e) => e.d <= 4)
    .sort((a, b) => b.d - a.d)[0]!.x;
}

/** Whether two fleets are at different spots. */
function apart(s: GameState, a: Fleet, b: Fleet): boolean {
  return a.x !== b.x || a.y !== b.y;
}

describe("ships sent together", () => {
  it("travel together and arrive together, the group's Navigator speeding up every ship", () => {
    let s = newGame({ seed: "convoy", races: ["terran", "felhari"], ...quiet });
    const home = s.players[0]!.homeStarId;
    const dest = target(s);
    const fast = addFleet(s, home, "frigate");
    const slow = addFleet(s, home, s.players[0]!.designs.find((d) => d.module === "colony")!.id);
    navigator(s, fast.id);
    const alone = travelTurns(s, slow, dest.id);
    const planned = travelTurns(s, slow, dest.id, [fast]);
    expect(planned).toBe(travelTurns(s, fast, dest.id));
    expect(planned).toBeLessThan(alone);
    s = processTurn(s, { 0: [
      { type: "moveFleet", fleetId: fast.id, destStarId: dest.id },
      { type: "moveFleet", fleetId: slow.id, destStarId: dest.id },
    ] });
    expect(travelTurns(s, s.fleets[slow.id]!, dest.id)).toBe(planned - 1);
    let turns = 1;
    for (let i = 0; i < 20; i++) {
      const a = s.fleets[fast.id]!;
      const b = s.fleets[slow.id]!;
      expect([a.x, a.y, a.starId]).toEqual([b.x, b.y, b.starId]);
      if (a.starId === dest.id) break;
      s = processTurn(s, {});
      turns++;
    }
    expect(s.fleets[slow.id]!.starId).toBe(dest.id);
    expect(turns).toBe(planned);
  });
});

describe("a fleet sent alone", () => {
  it("leaves the fleets that stay behind", () => {
    let s = newGame({ seed: "convoy", races: ["terran", "felhari"], ...quiet });
    const home = s.players[0]!.homeStarId;
    const dest = target(s);
    const fast = addFleet(s, home, "frigate");
    const slow = addFleet(s, home, "frigate");
    navigator(s, fast.id);
    s = processTurn(s, { 0: [{ type: "moveFleet", fleetId: fast.id, destStarId: dest.id }] });
    expect(apart(s, s.fleets[fast.id]!, s.fleets[slow.id]!)).toBe(true);
  });
});
