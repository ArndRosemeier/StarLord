import { describe, expect, it } from "vitest";
import {
  BLACK_HOLE_TURNS, GOVERNMENTS, Rng, designStats, newGame, prepareBattle,
  type CombatSide, type Fleet, type GameState, type ShipDesign,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

function twoEmpires(seed = "cw"): GameState {
  const s = newGame({ seed, races: ["terran", "felhari"], ...quiet });
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  return s;
}

function addFleet(s: GameState, ownerId: number, starId: string, ships: Fleet["ships"]): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance: "defend", name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

function design(id: string, hull: ShipDesign["hull"], weapons: ShipDesign["weapons"], specials: string[] = []): ShipDesign {
  return { id, name: id, hull, armor: "titaniumArmor", shield: null, computer: null, weapons, specials, module: null, obsolete: false };
}

const away = (s: GameState) => s.galaxy.stars.find((x) => x.id !== s.players[0]!.homeStarId && x.id !== s.players[1]!.homeStarId)!.id;
const side = (ownerId: number, fleets: Fleet[]): CombatSide => ({ ownerId, fleets, attacksPlanet: false });

/** A battle between one ship of each design, the two units returned. */
function duel(a: ShipDesign, b: ShipDesign, seed = 1) {
  const s = twoEmpires();
  s.players[0]!.designs.push(a);
  s.players[1]!.designs.push(b);
  const star = away(s);
  const fa = addFleet(s, 0, star, [{ designId: a.id, count: 1 }]);
  const fb = addFleet(s, 1, star, [{ designId: b.id, count: 1 }]);
  const battle = prepareBattle(s, new Rng({ s: seed }), side(0, [fa]), side(1, [fb]));
  const [x, y] = battle.units as [typeof battle.units[number], typeof battle.units[number]];
  return { s, battle, x, y };
}

describe("original combat weapons and damage", () => {
  it("measures range between the nearest squares of the footprints", () => {
    const { battle, x, y } = duel(design("f", "frigate", []), design("b", "battleship", []));
    Object.assign(x, { x: 10, y: 30 });
    Object.assign(y, { x: 16, y: 30 });
    // A frigate is one square, a battleship 3x3: from the frigate to the battleship's nearest square is 5.
    expect(battle.edge(x, y)).toBe(5);
    Object.assign(y, { x: 16, y: 34 });
    // 5 across and 3 down: the longer leg plus half the shorter.
    expect(battle.edge(x, y)).toBe(6.5);
  });

  it("lets the Energy Absorber take its share before the Damper Field cuts the rest", () => {
    const { battle, x, y } = duel(design("a", "cruiser", []), design("d", "cruiser", [], ["energyAbsorber", "damperField"]));
    const before = y.armor;
    battle.hit(x, y, 40, { facing: 0 });
    // The absorber keeps a quarter (10); the damper lets a quarter of the other 30 through (7).
    expect(y.absorbed).toBe(10);
    expect(before - y.armor).toBe(7);
    // The stored energy goes out with the ship's next shot.
    Object.assign(x, { x: 30, y: 30 });
    Object.assign(y, { x: 32, y: 30 });
    const armor = x.armor;
    expect(battle.discharge(y, x)).toBe(true);
    expect(y.absorbed).toBe(0);
    expect(x.armor).toBeLessThan(armor);
  });

  it("tears graviton damage out of the structure before armor", () => {
    const { battle, x, y } = duel(design("a", "cruiser", []), design("d", "cruiser", []));
    const armor = y.armor;
    const structure = y.structure;
    battle.hit(x, y, 10, { facing: 0, extraStructural: true });
    // Half the damage twice (5 + 5) into the structure, the 10 itself on the armor.
    expect(structure - y.structure).toBe(10);
    expect(armor - y.armor).toBe(10);
  });

  it("rolls the Gyro Destabilizer per hull size straight into the structure", () => {
    const { battle, x, y } = duel(design("g", "battleship", [{ weaponId: "gyroDestabilizer", count: 1 }]), design("d", "cruiser", []));
    Object.assign(x, { x: 30, y: 30 });
    Object.assign(y, { x: 34, y: 30 });
    const armor = y.armor;
    const structure = y.structure;
    expect(battle.fireSpecial(x, x.mounts[0]!, y)).toBe(true);
    const lost = structure - y.structure;
    // A cruiser is hull size 2: three rolls of 1-4.
    expect(lost).toBeGreaterThanOrEqual(3);
    expect(lost).toBeLessThanOrEqual(12);
    expect(y.armor).toBe(armor);
  });

  it("destroys a ship caught by a black hole at the end of the second turn after, and frees it if the generator is lost", () => {
    const { battle, x, y } = duel(design("bh", "titan", [{ weaponId: "blackHoleGenerator", count: 1 }]), design("d", "cruiser", []));
    Object.assign(x, { x: 30, y: 30 });
    Object.assign(y, { x: 36, y: 30 });
    expect(battle.fireSpecial(x, x.mounts[0]!, y)).toBe(true);
    expect(battle.currentSpeed(y)).toBe(0);
    for (let turn = 1; turn < BLACK_HOLE_TURNS - 1; turn++) battle.endRound([0, 1]);
    expect(y.alive).toBe(true);
    battle.endRound([0, 1]);
    expect(y.alive).toBe(false);

    const again = duel(design("bh", "titan", [{ weaponId: "blackHoleGenerator", count: 1 }]), design("d", "cruiser", []));
    Object.assign(again.x, { x: 30, y: 30 });
    Object.assign(again.y, { x: 36, y: 30 });
    again.battle.fireSpecial(again.x, again.x.mounts[0]!, again.y);
    again.x.mounts[0]!.count = 0;
    again.battle.endRound([0, 1]);
    again.battle.endRound([0, 1]);
    expect(again.y.alive).toBe(true);
    expect(again.y.blackHole).toBe(null);
  });

  it("holds a ship in stasis until its holder is gone, or lets the last free enemy go", () => {
    const { battle, x, y } = duel(design("st", "battleship", [{ weaponId: "stasisField", count: 1 }]), design("d", "cruiser", []));
    Object.assign(x, { x: 30, y: 30 });
    Object.assign(y, { x: 33, y: 30 });
    expect(battle.fireSpecial(x, x.mounts[0]!, y)).toBe(true);
    expect(battle.untouchable(y)).toBe(true);
    expect(battle.act(y)).toBe(false);
    // Every enemy left is held: the holder lets the smallest go.
    battle.endRound([0, 1]);
    expect(y.held).toBe(null);
    battle.fireSpecial(x, x.mounts[0]!, y);
    expect(y.held).toBe(x);
    x.mounts[0]!.count = 0;
    battle.checkStasis();
    expect(y.held).toBe(null);
  });

  it("fires Hyper-X beams twice after a rest and once while firing every turn", () => {
    const { battle, x, y } = duel(design("hx", "cruiser", [{ weaponId: "laserCannon", count: 1 }], ["hyperXCapacitors"]), design("d", "titan", []));
    Object.assign(x, { x: 30, y: 30, heading: 0 });
    Object.assign(y, { x: 33, y: 30 });
    const shots = () => battle.log.filter((e) => e.kind === "fire" && e.ship === x.key).length;
    battle.startRound();
    battle.fire(x, y);
    expect(shots()).toBe(2);
    battle.log = [];
    battle.startRound();
    battle.fire(x, y);
    expect(shots()).toBe(1);
    battle.log = [];
    battle.startRound();
    battle.startRound();
    battle.fire(x, y);
    expect(shots()).toBe(2);
  });

  it("keeps ion weapons off raiders and monsters, and special weapons other than the Stellar Converter off planets", () => {
    const { battle, x, y } = duel(design("ion", "cruiser", [{ weaponId: "ionPulseCannon", count: 1 }, { weaponId: "gyroDestabilizer", count: 1 }]), design("d", "cruiser", []));
    expect(battle.canAim(x.mounts[0]!, y)).toBe(true);
    y.kind = "monster";
    expect(battle.canAim(x.mounts[0]!, y)).toBe(false);
    y.kind = "planet";
    expect(battle.canAim(x.mounts[1]!, y)).toBe(false);
  });

  it("kills marines with some of the damage that gets past armor", () => {
    let lost = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { battle, x, y } = duel(design("a", "cruiser", []), design("d", "titan", []), seed);
      y.armor = 0;
      const before = y.marines;
      battle.hit(x, y, 200, { facing: 0 });
      lost += before - y.marines;
    }
    // About 1% of 2000 points.
    expect(lost).toBeGreaterThan(5);
    expect(lost).toBeLessThan(45);
  });

  it("prices support ships at the original's fixed costs", () => {
    const s = twoEmpires();
    const p = s.players[0]!;
    const mult = GOVERNMENTS[p.government].shipCostMult;
    const colony = { ...design("c", "cruiser", []), module: "colony" as const };
    const outpost = { ...design("o", "destroyer", []), module: "outpost" as const };
    expect(designStats(p, colony).cost).toBe(Math.round(500 * mult));
    expect(designStats(p, outpost).cost).toBe(Math.round(100 * mult));
  });
});

describe("point defense firing arcs", () => {
  /** Point-defense shots the defender fires at one missile volley, facing it head on or turned away. */
  const pdShots = (heading: number, arc: "forward" | "full") => {
    const { battle, x, y } = duel(
      design("m", "cruiser", [{ weaponId: "nuclearMissile", count: 1 }]),
      design("pd", "cruiser", [{ weaponId: "laserCannon", count: 2, mods: ["pointDefense"], arc }]),
    );
    Object.assign(x, { x: 10, y: 30, heading: 0 });
    Object.assign(y, { x: 30, y: 30, heading });
    battle.launch(x, 0, x.mounts[0]!, y);
    for (let i = 0; i < 20 && battle.projectiles.length > 0; i++) battle.moveProjectiles(0);
    return battle.log.filter((e) => e.kind === "intercept" && e.ship === y.key && e.weapon === "laserCannon").length;
  };

  it("fires a forward point-defense mount only at missiles coming in inside its arc", () => {
    expect(pdShots(Math.PI, "forward")).toBe(1);
    expect(pdShots(0, "forward")).toBe(0);
  });

  it("covers every side with a 360 degree arc", () => {
    expect(pdShots(0, "full")).toBe(1);
    expect(pdShots(Math.PI / 2, "full")).toBe(1);
  });
});

describe("shooting at missiles in flight", () => {
  /** A missile frigate's volley flying at a cruiser, and a defender armed with the given weapons nearby. */
  const salvo = (weapons: ShipDesign["weapons"], count = 6, seed = 1) => {
    const { battle, x, y } = duel(
      design("m", "cruiser", [{ weaponId: "nuclearMissile", count }]),
      design("d", "cruiser", weapons),
      seed,
    );
    Object.assign(x, { x: 4, y: 30, heading: 0 });
    Object.assign(y, { x: 40, y: 30, heading: Math.PI });
    battle.launch(x, 0, x.mounts[0]!, y);
    const p = battle.projectiles[0]!;
    Object.assign(p, { x: 34, y: 30 });
    return { battle, x, y, p };
  };

  it("lets beams and anti-missile rockets fire at missiles, but not heavy mounts, and nothing hits torpedoes", () => {
    const { battle, y, p } = salvo([
      { weaponId: "laserCannon", count: 2, arc: "forward" },
      { weaponId: "laserCannon", count: 1, mods: ["heavyMount"], arc: "forward" },
      { weaponId: "antiMissileRockets", count: 1 },
      { weaponId: "nuclearMissile", count: 1 },
    ]);
    expect(battle.flightBlocked(y, y.mounts[0]!, p)).toBeNull();
    expect(battle.flightBlocked(y, y.mounts[1]!, p)).toMatch(/heavy/);
    expect(battle.flightBlocked(y, y.mounts[2]!, p)).toBeNull();
    expect(battle.flightBlocked(y, y.mounts[3]!, p)).toMatch(/cannot hit missiles/);
    p.weapon = { ...p.weapon, kind: "torpedo" };
    expect(battle.flightBlocked(y, y.mounts[0]!, p)).toMatch(/torpedoes/);
  });

  it("shows the commanded unit every enemy volley with its odds, and fires at it on order", () => {
    const { battle, y, p } = salvo([{ weaponId: "laserCannon", count: 4, arc: "forward" }]);
    const o = battle.options(y.key)!;
    expect(o.flights.map((f) => f.id)).toEqual([p.id]);
    expect(o.flights[0]!.inRange).toBe(true);
    const v = o.weapons[0]!.vs[p.id]!;
    expect(v.ok).toBe(true);
    expect(v.hitPct).toBeGreaterThan(0);
    expect(v.downed).toBeGreaterThan(0);
    const before = p.count;
    expect(battle.fireAtFlight(y, p, [0])).toBe(true);
    const ev = battle.log.find((e) => e.kind === "intercept" && e.projectile === p.id)!;
    expect(ev.ship).toBe(y.key);
    expect(ev.downed).toBe(before - p.count);
    expect(y.mounts[0]!.firedThisRound).toBe(true);
  });

  it("downs about as many missiles as the preview says", () => {
    let downed = 0;
    let expected = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { battle, y, p } = salvo([{ weaponId: "laserCannon", count: 4, arc: "forward" }], 6, seed);
      expected += battle.previewFlight(y, 0, p).downed!;
      const before = p.count;
      battle.fireAtFlight(y, p, [0]);
      downed += before - p.count;
    }
    expect(downed).toBeGreaterThan(expected * 0.7);
    expect(downed).toBeLessThan(expected * 1.3);
  });

  it("has the computer shoot down a volley worth more than its target", () => {
    const { battle, x, y, p } = salvo([{ weaponId: "laserCannon", count: 6, arc: "full" }], 10);
    // Out of beam range of the launcher, the volley is the only thing worth a shot.
    expect(battle.flightWorthShooting(y, 0, y.mounts[0]!, x)).toBe(p);
  });
});
