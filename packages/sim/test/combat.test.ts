import { describe, expect, it } from "vitest";
import {
  EXPLOSION, HULLS_BY_ID, Rng, bestBeam, bestMissile, bestPointDefenseBeam, canBuildShips, colonyDefenseStrength,
  commandPointsUsed, designStats, findDesign, newGame, prepareBattle, processTurn, resolveCombat, stationWeapons,
  validateDesign, weaponUnitCost,
  type CombatReport, type CombatSide, type Fleet, type GameState, type ShipDesign,
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

describe("original station, retreat, boarding and explosion rules", () => {
  const away = (s: GameState) => s.galaxy.stars.find((x) => x.id !== s.players[0]!.homeStarId && x.id !== s.players[1]!.homeStarId)!.id;
  const side = (ownerId: number, fleets: Fleet[], colony?: CombatSide["colony"]): CombatSide => ({ ownerId, fleets, colony, attacksPlanet: false });

  it("arms a station as the original: heavy, plain and point-defense beams and 20-shot missile racks", () => {
    const s = twoEmpires();
    const p = s.players[0]!;
    const hull = HULLS_BY_ID.starBase;
    const beam = bestBeam(p);
    const pd = bestPointDefenseBeam(p)!;
    const missile = bestMissile(p);
    const unit = (id: string, mods: ("heavyMount" | "pointDefense")[]) => weaponUnitCost(p, { weaponId: id, count: 1, mods, arc: "forwardExtended" }).space;
    const w = stationWeapons(p, hull);
    const heavy = w.find((m) => m.weaponId === beam.id && m.mods?.includes("heavyMount"))!;
    const plain = w.find((m) => m.weaponId === beam.id && !m.mods)!;
    const point = w.find((m) => m.weaponId === pd.id && m.mods?.includes("pointDefense"))!;
    const racks = w.find((m) => m.weaponId === missile.id)!;
    expect(heavy.count).toBe(Math.floor(hull.space / 4 / unit(beam.id, ["heavyMount"])));
    expect(plain.count).toBe(Math.floor(hull.space / 8 / unit(beam.id, [])));
    expect(point.count).toBe(Math.floor(hull.space / 8 / unit(pd.id, ["pointDefense"])));
    expect(racks.ammo).toBe(20);
    expect(racks.mods).toContain("eccm");
    expect(racks.count).toBe(Math.floor(hull.space / 2 / weaponUnitCost(p, { weaponId: missile.id, count: 1, ammo: 20 }).space));
    for (const m of [heavy, plain, point]) expect(m.arc).toBe("full");
    // Megafluxers give stations a quarter more space.
    p.techs.push("megafluxers");
    const more = stationWeapons(p, hull).find((m) => m.weaponId === beam.id && m.mods?.includes("heavyMount"))!;
    expect(more.count).toBe(Math.floor((hull.space * 1.25) / 4 / unit(beam.id, ["heavyMount"])));
  });

  it("fights a station as a ship hull of its size with a Regular crew and free specials", () => {
    const s = twoEmpires();
    const c = home(s, 1);
    s.players[1]!.techs.push("heavyArmor", "battleScanner");
    const a = addFleet(s, 0, s.players[1]!.homeStarId, [{ designId: "frigate", count: 1 }], "attack");
    const battle = prepareBattle(s, new Rng({ s: 1 }), side(0, [a]), side(1, [], c));
    const st = battle.units.find((u) => u.kind === "station")!;
    expect([st.sizeClass, st.hullRank, st.crew, st.marines]).toEqual([3, 2, 1, 20]);
    // -20 for not moving, +15 for the Regular crew; no race ship defense without a drive.
    expect(battle.defenseOf(st)).toBe(-5);
    expect(st.maxArmor).toBe(HULLS_BY_ID.starBase.armor * 3);
    expect(st.fx.beamAttack).toBe(50);
    expect(st.computer?.max).toBe(5);
  });

  it("gives a side flat beam attack from its battlestation, star fortress or defended planet", () => {
    const s = twoEmpires();
    const c = home(s, 1);
    const a = addFleet(s, 0, s.players[1]!.homeStarId, [{ designId: "frigate", count: 1 }], "attack");
    const bonus = (buildings: string[]) => {
      c.buildings = [...c.buildings.filter((b) => !["starBase", "battlestation", "starFortress", "groundBatteries"].includes(b)), ...buildings];
      const battle = prepareBattle(s, new Rng({ s: 1 }), side(0, [a]), side(1, [], c));
      battle.updateSideAttack();
      return battle.sideAttack;
    };
    expect(bonus(["starBase"])).toEqual([0, 0]);
    expect(bonus(["battlestation"])).toEqual([0, 10]);
    expect(bonus(["starFortress"])).toEqual([0, 20]);
    // An armed planet alone counts as size 3; a star base deployed after it resets that.
    expect(bonus(["groundBatteries"])).toEqual([0, 10]);
    expect(bonus(["groundBatteries", "starBase"])).toEqual([0, 0]);
  });

  it("lets a ship ordered to retreat escape only at its next turn, and not past a warp dissipator", () => {
    const s = twoEmpires();
    const star = away(s);
    s.players[0]!.isHuman = true;
    s.players[0]!.doctrine = { retreatBelow: 1, focus: "nearest" };
    // A tough ship, so it lives to see its second turn.
    s.players[0]!.designs.push({ ...warship("tank", "cruiser", [{ weaponId: "laserCannon", count: 1 }]), armor: "zortriumArmor" });
    const run = (enemy: string) => {
      const a = addFleet(s, 0, star, [{ designId: "tank", count: 1 }]);
      const b = addFleet(s, 1, star, [{ designId: enemy, count: 12 }]);
      const out = resolveCombat(s, new Rng({ s: 4 }), star, side(0, [a]), side(1, [b]), "r");
      delete s.fleets[a.id];
      delete s.fleets[b.id];
      return { out, key: `${a.id}:tank:0`, fleet: a.id };
    };
    const { out, key, fleet } = run("frigate");
    const at = out.report.rounds.findIndex((r) => r.some((e) => e.kind === "retreat" && e.ship === key));
    // Ordered on its first turn, which it spends doing nothing else; it escapes as its second turn begins.
    expect(at).toBe(1);
    expect(out.report.rounds[0]!.some((e) => e.ship === key)).toBe(false);
    expect(out.fled.has(fleet)).toBe(true);

    s.players[1]!.designs.push({ ...warship("wd", "destroyer", [{ weaponId: "laserCannon", count: 1 }]), specials: ["warpDissipator"] });
    const held = run("wd");
    expect(held.out.report.rounds.flat().some((e) => e.kind === "retreat")).toBe(false);
  });

  it("picks capture or hit-and-run from the boarding odds, and boards only what it can reach", () => {
    const s = twoEmpires();
    const star = away(s);
    const a = addFleet(s, 0, star, [{ designId: "frigate", count: 1 }]);
    const b = addFleet(s, 1, star, [{ designId: "frigate", count: 1 }]);
    const battle = prepareBattle(s, new Rng({ s: 1 }), side(0, [a]), side(1, [b]));
    const x = battle.units[0]!;
    const y = battle.units[1]!;
    y.marines = x.marines;
    y.fx.boardingDefense = -1000;
    expect(battle.boardingMode(x, y)).toBe(2);
    y.marines = x.marines + 1;
    expect(battle.boardingMode(x, y)).toBe(1);
    y.fx.boardingDefense = 1000;
    expect(battle.boardingMode(x, y)).toBe(0);
    // Without transporters, marines cross only to an adjacent ship that cannot move.
    x.x = 40;
    x.y = 34;
    y.x = 41.5;
    y.y = 34;
    expect(battle.boardingReach(x, y)).toBe(null);
    y.drive!.hp = 0;
    expect(battle.boardingReach(x, y)).toEqual({ transporters: false });
    y.x = 50;
    expect(battle.boardingReach(x, y)).toBe(null);
  });

  it("splashes the drive explosion over nearby ships, and a quantum detonator goes off however the ship dies", () => {
    const s = twoEmpires();
    const star = away(s);
    s.players[0]!.designs.push({ ...warship("cr", "cruiser", [{ weaponId: "laserCannon", count: 2 }]), armor: "zortriumArmor" });
    s.players[1]!.designs.push({ ...warship("cr", "cruiser", [{ weaponId: "laserCannon", count: 2 }]), armor: "zortriumArmor" });
    const a = addFleet(s, 0, star, [{ designId: "cr", count: 3 }]);
    const b = addFleet(s, 1, star, [{ designId: "cr", count: 1 }]);
    const battle = prepareBattle(s, new Rng({ s: 1 }), side(0, [a]), side(1, [b]));
    const [boom, near, alsoNear, far] = battle.units as [typeof battle.units[number], typeof battle.units[number], typeof battle.units[number], typeof battle.units[number]];
    Object.assign(boom, { x: 40, y: 34 });
    Object.assign(near, { x: 42, y: 34 });
    Object.assign(alsoNear, { x: 40, y: 38 });
    Object.assign(far, { x: 70, y: 34 });
    battle.damageSystem(boom, boom.drive!, boom.drive!.hp, { absorbed: 0, armor: 0, structure: 0 });
    expect(boom.alive).toBe(false);
    const blast = battle.log.filter((e) => e.kind === "fire" && e.weapon === "explosion" && e.ship === boom.key);
    expect(blast.map((e) => e.target).sort()).toEqual([near.key, alsoNear.key].sort());
    const peak = EXPLOSION.perDriveHP * HULLS_BY_ID.cruiser.driveHP;
    // A cruiser is struck three times (size 2, plus 1) for 1 to the damage left at its distance.
    for (const e of blast) expect((e.absorbed ?? 0) + (e.damage ?? 0)).toBeLessThanOrEqual(3 * peak);
    // Losing its structure does not blow a ship up, unless it carries a quantum detonator.
    battle.log = [];
    battle.destroy(near);
    expect(battle.log.some((e) => e.weapon === "explosion")).toBe(false);
    alsoNear.fx.detonator = 3;
    Object.assign(far, { x: 40, y: 36 });
    battle.destroy(alsoNear);
    expect(battle.log.some((e) => e.weapon === "explosion" && e.target === far.key)).toBe(true);
  });
});
