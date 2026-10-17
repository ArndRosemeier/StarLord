import { describe, expect, it } from "vitest";
import { attitude, fleetPower, newGame, processTurn, relation, setRelation, type Difficulty, type Fleet, type GameState } from "@starlord/sim";

/** Human player 0 parks `count` frigates (set to attack) at computer player 1's home; the two are not at war. */
function parked(difficulty: Difficulty = "average", count = 100): { s: GameState; starId: string } {
  const s = newGame({ seed: "peaceful", races: ["terran", "felhari"], humanPlayers: [0], difficulty, monsters: false, raiders: false, council: false, randomEvents: false });
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  const home = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
  const starId = s.planets[home.planetId]!.starId;
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `p${s.nextId++}`, ownerId: 0, x: star.x, y: star.y, starId, destStarId: null, ships: [{ designId: "frigate", count }], stance: "attack", name: "Visitors" };
  s.fleets[f.id] = f;
  setRelation(s, 0, 1, 0);
  return { s, starId };
}

describe("ships at another empire's star without a war (the original's FUN_0004dd66 reason 5)", () => {
  it("start no battle and no war, even set to attack", () => {
    const { s } = parked();
    let next = s;
    for (let i = 0; i < 3; i++) next = processTurn(next, {});
    expect(next.events.some((e) => e.kind === "combat")).toBe(false);
    expect(relation(next, 0, 1).status).not.toBe("war");
    expect(Object.values(next.fleets).find((f) => f.name === "Visitors")?.ships[0]?.count).toBe(100);
  });

  it("sour a computer ruler by (pop - 4) + strength / 50 each turn while the fleet is strong enough", () => {
    const { s, starId } = parked();
    expect(fleetPower(s, 0, starId)).toBeGreaterThan(100);
    const next = processTurn(s, {});
    expect(attitude(next, 1, 0)).toBeLessThan(0);
  });

  it("leave allies alone, and on Tutor and Easy nobody minds", () => {
    const allied = parked();
    allied.s.relations["0-1"] = { status: "alliance", trade: false, research: false, since: 1 };
    expect(attitude(processTurn(allied.s, {}), 1, 0)).toBeGreaterThanOrEqual(0);
    for (const d of ["tutor", "easy"] as const) {
      const { s } = parked(d);
      expect(attitude(processTurn(s, {}), 1, 0)).toBeGreaterThanOrEqual(0);
    }
  });
});
