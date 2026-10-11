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
