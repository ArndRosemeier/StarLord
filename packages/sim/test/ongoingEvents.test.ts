import { describe, expect, it } from "vitest";
import { movementHalted, newGame, ongoingEvents, playerView, processTurn, type Fleet, type GameState } from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

function game(): GameState {
  return newGame({ seed: "ongoing", races: ["terran", "felhari"], ...quiet });
}

function scoutAt(s: GameState, starId: string): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `t${s.nextId++}`, ownerId: 0, x: star.x, y: star.y, starId, destStarId: null, ships: [{ designId: "scout", count: 1 }], stance: "defend", name: "Scout" };
  s.fleets[f.id] = f;
  return f;
}

describe("events in play", () => {
  it("hyperspace flux holds a fleet ordered through a wormhole, says so, and lets it jump once it ends", () => {
    let s = game();
    const home = s.players[0]!.homeStarId;
    const here = s.galaxy.stars.find((x) => x.id === home)!;
    const far = s.galaxy.stars.find((x) => x.id !== home && x.color !== "blackHole" && !x.wormholeTo)!;
    here.wormholeTo = far.id;
    far.wormholeTo = home;
    const f = scoutAt(s, home);
    s.activeEvents = [{ id: "ev1", kind: "hyperspaceFlux", until: s.turn + 22 }];

    const shown = ongoingEvents(playerView(s, 0), 0);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.title).toBe("Hyperspace flux");
    expect(shown[0]!.effect).toMatch(/cannot leave/);
    expect(shown[0]!.ends).toMatch(/over by turn/);

    s = processTurn(s, { 0: [{ type: "moveFleet", fleetId: f.id, destStarId: far.id }] });
    expect(movementHalted(s, s.fleets[f.id]!)).toBe(true);
    expect(s.fleets[f.id]!.starId).toBe(home);
    expect(s.fleets[f.id]!.destStarId).toBe(far.id);

    s.activeEvents = [];
    s = processTurn(s, {});
    expect(s.fleets[f.id]!.starId).toBe(far.id);
    expect(ongoingEvents(playerView(s, 0), 0)).toHaveLength(0);
  });

  it("shows colony events only to their owner", () => {
    const s = game();
    const mine = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    s.activeEvents = [{ id: "ev1", kind: "plague", playerId: 0, colonyId: mine.id, until: Number.MAX_SAFE_INTEGER, strength: 40, progress: 10 }];
    expect(ongoingEvents(playerView(s, 0), 0).map((e) => e.title)).toEqual([`Plague on ${mine.name}`]);
    expect(ongoingEvents(playerView(s, 1), 1)).toHaveLength(0);
  });
});
