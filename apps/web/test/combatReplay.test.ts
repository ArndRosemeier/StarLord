import { describe as group, expect, it } from "vitest";
import { newGame, playerView, processTurn, raiderDesignId, type CombatReport, type Fleet } from "@starlord/sim";
import { describe, framesAt, replaySteps, unitInfo, type CombatEvent, type UnitSnapshot } from "../src/screens/combat/replayModel";

const state = newGame({ seed: "replay-model", playerCount: 2, monsters: true });
const view = playerView(state, 0);
const colony = Object.values(view.colonies).find((c) => c.ownerId === 0)!;
const monsters = Object.values(view.players).find((p) => p.kind === "monsters")!.id;

function report(ships: UnitSnapshot[], rounds: CombatEvent[][], sides: [number, number] = [1, 0]): CombatReport {
  return {
    id: "r", turn: 1, starId: view.planets[colony.planetId]!.starId, sides, winner: null, losses: {},
    ships: ships as CombatReport["ships"], rounds: rounds as CombatReport["rounds"],
  };
}

const ship = (key: string, ownerId: number, extra: Partial<UnitSnapshot> = {}): UnitSnapshot =>
  ({ key, ownerId, designId: "frigate", name: key, maxHits: 10, x: 5, y: 5, isPlanet: false, ...extra });

group("combat replay model", () => {
  it("shows the raiders' citadel as a fortress and their ships on their real hulls", () => {
    let s = newGame({ seed: "replay-raiders", playerCount: 2, council: false });
    const home = s.galaxy.stars.find((x) => x.special === "raiderHome")!;
    const capital = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    capital.portal = true;
    s.players[0]!.hasPortal = true;
    const start = s.galaxy.stars.find((x) => x.id === s.players[0]!.homeStarId)!;
    const f: Fleet = { id: "strike", ownerId: 0, x: start.x, y: start.y, starId: start.id, destStarId: null, ships: [{ designId: "frigate", count: 3 }], stance: "attack", name: "Strike" };
    s.fleets[f.id] = f;
    s = processTurn(s, { 0: [{ type: "moveFleet", fleetId: f.id, destStarId: home.id }] });
    const r = s.combats.find((c) => c.starId === home.id)!;
    const units = unitInfo(r, playerView(s, 0));
    const citadel = units.find((u) => u.snap.designId === "vexariCitadel")!;
    expect(citadel.kind).toBe("station");
    expect(citadel.station).toBe("starFortress");
    const cruiser = units.find((u) => u.snap.designId === raiderDesignId("cruiser"))!;
    expect(cruiser.kind).toBe("ship");
    expect(cruiser.hull).toBe("cruiser");
  });

  it("reads old reports: isPlanet, ship hulls from designs, monsters by owner", () => {
    const r = report([
      ship(`planet:${colony.id}`, 0, { isPlanet: true, designId: "planet", x: 29.5 }),
      ship("a", 0, { designId: "colonyShip" }),
      ship("m", monsters, { designId: "starWyrm", maxHits: 800 }),
    ], []);
    const [planet, a, m] = unitInfo(r, view);
    expect(planet!.kind).toBe("planet");
    expect(planet!.planetType).toBe(view.planets[colony.planetId]!.type);
    expect(a!.kind).toBe("ship");
    expect(a!.hull).toBe("cruiser");
    expect(m!.kind).toBe("monster");
    // Monster designs all sit on titan hulls; they are sized by their hit points instead.
    expect(m!.hull).toBe("doomStar");
  });

  it("reads new reports: kinds, hull ids, size classes and station tiers", () => {
    const r = report([
      ship("s", 0, { kind: "station", hullId: "starFortress", sizeClass: 10 }),
      ship("b", 0, { kind: "station", designId: "battlestation" }),
      ship("t", 1, { kind: "ship", hullId: "titan" }),
      ship("c", 1, { kind: "ship", designId: "unknown", sizeClass: 3 }),
      ship("x", 1, { kind: "ship", designId: "unknown", maxHits: 5 }),
    ], []);
    const units = unitInfo(r, view);
    expect(units.map((u) => [u.kind, u.station ?? u.hull])).toEqual([
      ["station", "starFortress"], ["station", "battlestation"], ["ship", "titan"], ["ship", "cruiser"], ["ship", "frigate"],
    ]);
  });

  it("tracks damage layers and repairs, and ignores unknown events", () => {
    const r = report([
      ship("a", 1),
      ship("b", 0, { maxHits: 30, maxArmor: 20, maxStructure: 10 }),
    ], [[
      { kind: "move", ship: "a", x: 8, y: 5 },
      { kind: "fire", ship: "a", target: "b", hit: true, damage: 12, absorbed: 3, armorDamage: 10, structureDamage: 2, systemHit: "drive" },
      { kind: "launch", ship: "a" },
      { kind: "warp", ship: "a" },
      { kind: "repair", ship: "b", damage: 5 },
      { kind: "board", ship: "a", target: "b" },
    ]]);
    const steps = replaySteps(r);
    const f = framesAt(r, steps, steps.length);
    expect(f.now.get("a")).toMatchObject({ x: 8, y: 5, heading: 0 });
    expect(f.now.get("b")).toMatchObject({ hits: 23, armor: 10, structure: 8, alive: true });
    expect(describe(r, steps[1]!.e)).toBe("a hits b for 12 (3 absorbed by shields), drive knocked out");
    expect(describe(r, steps[2]!.e)).toBe("a launches");
    expect(describe(r, steps[3]!.e)).toBe("");
    expect(describe(r, steps[4]!.e)).toBe("b repairs 5");
    expect(describe(r, steps[5]!.e)).toBe("a boards b");
  });

  it("turns ships toward their moves", () => {
    const r = report([ship("a", 1, { x: 5, y: 5 })], [[{ kind: "move", ship: "a", x: 5, y: 9 }]]);
    const f = framesAt(r, replaySteps(r), 1);
    expect(f.prev.get("a")!.heading).toBe(0);
    expect(f.now.get("a")!.heading).toBeCloseTo(Math.PI / 2);
  });
});
