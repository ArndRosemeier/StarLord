import { describe, expect, it } from "vitest";
import {
  HULLS_BY_ID, Rng, canBuildShips, colonyDefenseStrength, commandPointsUsed, designStats, findDesign, newGame,
  processTurn, resolveCombat, validateDesign, weaponUnitCost,
  type CombatReport, type Fleet, type GameState, type ShipDesign,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

function twoEmpires(seed = "cmb"): GameState {
  const s = newGame({ seed, races: ["terran", "felhari"], ...quiet });
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  return s;
}

function addFleet(s: GameState, ownerId: number, starId: string, ships: Fleet["ships"], stance: Fleet["stance"] = "defend"): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance, name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

const home = (s: GameState, owner: number) => Object.values(s.colonies).find((c) => c.ownerId === owner)!;

function warship(id: string, hull: ShipDesign["hull"], weapons: ShipDesign["weapons"]): ShipDesign {
  return { id, name: id, hull, armor: "titaniumArmor", shield: null, computer: "electronicComputer", weapons, specials: [], module: null, obsolete: false };
}

describe("hulls and components", () => {
  it("uses the original hull numbers", () => {
    expect([HULLS_BY_ID.frigate.space, HULLS_BY_ID.frigate.cost]).toEqual([25, 20]);
    expect([HULLS_BY_ID.battleship.space, HULLS_BY_ID.battleship.cost]).toEqual([250, 600]);
    expect([HULLS_BY_ID.starBase.space, HULLS_BY_ID.battlestation.space, HULLS_BY_ID.starFortress.space]).toEqual([300, 600, 1200]);
  });

  it("multiplies armor and structure by the armor grade, for free", () => {
    const s = twoEmpires();
    const p = s.players[0]!;
    const d = warship("w", "destroyer", [{ weaponId: "laserCannon", count: 1 }]);
    const ti = designStats(p, d);
    const zo = designStats(p, { ...d, armor: "zortriumArmor" });
    expect(zo.armor).toBe(ti.armor * 4);
    expect(zo.structure).toBe(ti.structure * 4);
    expect(zo.spaceUsed).toBe(ti.spaceUsed);
  });

  it("charges heavy and point-defense mounts by base size and gates mods behind refinement", () => {
    const s = twoEmpires();
    const p = s.players[0]!;
    const plain = weaponUnitCost(p, { weaponId: "laserCannon", count: 1 }).space;
    expect(weaponUnitCost(p, { weaponId: "laserCannon", count: 1, mods: ["heavyMount"] }).space).toBe(plain * 2);
    expect(weaponUnitCost(p, { weaponId: "laserCannon", count: 1, mods: ["pointDefense"] }).space).toBeLessThan(plain);
    const af = warship("af", "destroyer", [{ weaponId: "laserCannon", count: 1, mods: ["autoFire"] }]);
    expect(validateDesign(p, af)).toMatch(/refinement/);
    expect(validateDesign(p, warship("hp", "destroyer", [{ weaponId: "laserCannon", count: 1, mods: ["heavyMount", "pointDefense"] }]))).toMatch(/combined/);
  });

  it("counts every warship and support ship against command points", () => {
    const s = twoEmpires();
    const before = commandPointsUsed(s, 0);
    addFleet(s, 0, s.players[0]!.homeStarId, [{ designId: "frigate", count: 2 }, { designId: "transport", count: 1 }]);
    expect(commandPointsUsed(s, 0) - before).toBe(3);
  });
});

describe("star docks", () => {
  it("needs an orbital station to build cruisers and larger", () => {
    const s = twoEmpires();
    const c = home(s, 0);
    const big = warship("big", "cruiser", [{ weaponId: "laserCannon", count: 4 }]);
    s.players[0]!.designs.push(big);
    expect(canBuildShips(c, big)).toBe(true);
    c.buildings = c.buildings.filter((b) => b !== "starBase");
    expect(canBuildShips(c, big)).toBe(false);
    expect(canBuildShips(c, findDesign(s.players[0]!, "frigate"))).toBe(true);
    const next = processTurn(s, { 0: [{ type: "setQueue", colonyId: c.id, queue: [{ kind: "ship", designId: "big" }] }] });
    expect(next.colonies[c.id]!.queue).toEqual([]);
  });
});

describe("stations and planets", () => {
  function battle(s: GameState, attackers: Fleet["ships"], seed = 7): { report: CombatReport; outcome: ReturnType<typeof resolveCombat> } {
    const star = s.players[1]!.homeStarId;
    const a = addFleet(s, 0, star, attackers, "attack");
    const outcome = resolveCombat(s, new Rng({ s: seed }), star, { ownerId: 0, fleets: [a], attacksPlanet: true }, { ownerId: 1, fleets: [], colony: home(s, 1), attacksPlanet: false }, "r");
    return { report: outcome.report, outcome };
  }

  it("fights a star base as an immobile unit with full snapshot data", () => {
    const s = twoEmpires();
    const { report } = battle(s, [{ designId: "frigate", count: 2 }]);
    const base = report.ships.find((x) => x.kind === "station")!;
    expect(base.hullId).toBe("starBase");
    expect(base.maxArmor).toBeGreaterThan(0);
    expect(base.maxStructure).toBeGreaterThan(0);
    const fires = report.rounds.flat().filter((e) => e.kind === "fire" && (e.damage ?? 0) > 0);
    expect(fires.length).toBeGreaterThan(0);
    for (const e of fires) expect((e.armorDamage ?? 0) + (e.structureDamage ?? 0)).toBeLessThanOrEqual(e.damage!);
  });

  it("adds a planet unit for ground batteries and rates the colony stronger", () => {
    const s = twoEmpires();
    const c = home(s, 1);
    const plain = colonyDefenseStrength(s, c);
    c.buildings.push("groundBatteries");
    expect(colonyDefenseStrength(s, c)).toBeGreaterThan(plain);
    const { report } = battle(s, [{ designId: "frigate", count: 1 }]);
    expect(report.ships.some((x) => x.kind === "planet" && x.isPlanet)).toBe(true);
  });

  it("removes the station building when the station is destroyed", () => {
    const s = twoEmpires();
    const p = s.players[0]!;
    p.designs.push(warship("gun", "battleship", [{ weaponId: "laserCannon", count: 20 }]));
    expect(validateDesign(p, findDesign(p, "gun")!)).toBe(null);
    const { outcome } = battle(s, [{ designId: "gun", count: 6 }]);
    expect(outcome.stationsLost.has(home(s, 1).id)).toBe(true);
  });

  it("is deterministic", () => {
    const run = () => battle(twoEmpires(), [{ designId: "frigate", count: 4 }], 3).report;
    expect(run()).toEqual(run());
  });
});
