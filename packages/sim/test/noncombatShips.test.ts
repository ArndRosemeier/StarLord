import { describe, expect, it } from "vitest";
import { newGame, processTurn, type Fleet, type GameState } from "@starlord/sim";

/** A game with lair monsters and no raiders or council; empire 0 is the one we watch. */
function game(): GameState {
  return newGame({ seed: "noncombat", races: ["terran", "felhari"], monsters: true, raiders: false, council: false });
}

function addFleet(s: GameState, ownerId: number, starId: string, ships: Fleet["ships"]): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance: "defend", name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

/** A star guarded by a lair monster that has no colony on it. */
function lair(s: GameState): string {
  const monsters = s.players.find((p) => p.kind === "monsters")!;
  const f = Object.values(s.fleets).find((x) => x.ownerId === monsters.id && x.starId
    && !Object.values(s.colonies).some((c) => s.planets[c.planetId]!.starId === x.starId))!;
  return f.starId!;
}

const ownShips = (s: GameState, owner: number, designId: string) =>
  Object.values(s.fleets).filter((f) => f.ownerId === owner).reduce((n, f) => n + (f.ships.find((x) => x.designId === designId)?.count ?? 0), 0);

describe("colony ships, outpost ships and transports in battle", () => {
  it("sit the battle out, and withdraw to the nearest colony when their escort is beaten", () => {
    const s = game();
    const star = lair(s);
    const before = ownShips(s, 0, "colonyShip");
    const f = addFleet(s, 0, star, [{ designId: "frigate", count: 1 }, { designId: "colonyShip", count: 1 }]);
    const next = processTurn(s, {});
    const report = next.combats.find((c) => c.starId === star && c.sides.includes(0))!;
    expect(report).toBeDefined();
    expect(report.winner).not.toBe(0);
    // Only the frigate was on the battlefield.
    expect(report.ships.filter((u) => u.ownerId === 0).map((u) => u.designId)).toEqual(["frigate"]);
    const fleet = next.fleets[f.id]!;
    expect(fleet.ships).toMatchObject([{ designId: "colonyShip", count: 1 }]);
    expect(fleet.ships).toHaveLength(1);
    expect(fleet.starId).toBeNull();
    expect(fleet.destStarId).toBe(next.players[0]!.homeStarId);
    expect(ownShips(next, 0, "colonyShip")).toBe(before + 1);
    expect(report.aftermath).toEqual([{ ownerId: 0, fate: "withdrew", toStarId: next.players[0]!.homeStarId, ships: [{ designId: "colonyShip", count: 1 }] }]);
  });

  it("are lost when no warship came with them", () => {
    const s = game();
    const star = lair(s);
    const f = addFleet(s, 0, star, [{ designId: "colonyShip", count: 1 }]);
    const next = processTurn(s, {});
    expect(next.fleets[f.id]).toBeUndefined();
    const report = next.combats.find((c) => c.starId === star && c.sides.includes(0))!;
    expect(report.aftermath?.[0]).toMatchObject({ ownerId: 0, fate: "lost", why: "unescorted" });
  });

  it("are lost in a hyperspace flux unless the race is Trans-dimensional", () => {
    const s = game();
    const star = lair(s);
    s.activeEvents = [...(s.activeEvents ?? []), { id: "flux", kind: "hyperspaceFlux", until: s.turn + 10 }];
    const f = addFleet(s, 0, star, [{ designId: "frigate", count: 1 }, { designId: "transport", count: 2 }]);
    const next = processTurn(s, {});
    expect(next.fleets[f.id]).toBeUndefined();
  });
});
