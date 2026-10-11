import { describe, expect, it } from "vitest";
import {
  CREW, Rng, buyPrice, crewLevel, crewTick, getRace, growthPerTurn, missileSpeed, newGame, raceMaxPopulation,
  canBuildShips, computeOutput, fireEvent, population, processTurn, repairTick, revoltFight, findDesign, fleetFuelRange, fleetRange, levelFromXp, planetDefense, resolveCombat, spyCountBonus, troopUnit, WEAPONS_BY_ID, type Colony, type Fleet, type GameState,
} from "@starlord/sim";

/** Numbers recovered from the original program; each case was worked out by hand from the decoded formulas. */
describe("original colony formulas", () => {
  it("prices buying by how far the item is", () => {
    // 100-point item: 2 BC a point in the last half, 5 from 10% to half, 10 below 10%.
    expect(buyPrice(100, 0)).toBe(2 * 50 + 5 * 40 + 10 * 10);
    expect(buyPrice(100, 10)).toBe(2 * 50 + 5 * 40);
    expect(buyPrice(100, 30)).toBe(2 * 50 + 5 * 20);
    expect(buyPrice(100, 60)).toBe(2 * 40);
    expect(buyPrice(100, 100)).toBe(0);
  });

  it("gives each climate its share of the size's population, rounded half up", () => {
    const human = getRace("terran");
    expect(raceMaxPopulation(human, "gaia", "huge")).toBe(25);
    expect(raceMaxPopulation(human, "terran", "large")).toBe(16);
    expect(raceMaxPopulation(human, "ocean", "medium")).toBe(4);
    expect(raceMaxPopulation(human, "barren", "small")).toBe(3);
    expect(raceMaxPopulation(human, "arid", "medium")).toBe(9);
  });

  it("grows by the truncated square root and the growth percent", () => {
    const human = getRace("terran");
    // isqrt(floor(2000 * 4 * 8 / 12)) = isqrt(5333) = 73.
    expect(growthPerTurn(4, 4, 12, human, [])).toBe(73);
    // +50% from Universal Antidote: trunc(73 * 150 / 100) = 109; a Cloning Center adds 100k unmultiplied.
    expect(growthPerTurn(4, 4, 12, human, [], 50)).toBe(109);
    expect(growthPerTurn(4, 4, 12, human, ["cloningCenter"], 50)).toBe(209);
    // A plague (-200%) turns growth negative.
    expect(growthPerTurn(4, 4, 12, human, [], -200)).toBe(-73);
    expect(growthPerTurn(12, 12, 12, human, [])).toBe(0);
  });

  it("pays 1 BC per colonist and converts taxed industry 1:1", () => {
    const s = newGame({ seed: "tax", races: ["terran", "felhari"], monsters: false, raiders: false, council: false });
    const player = s.players[0]!;
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    const colony: Colony = { ...home, buildings: [], farmers: 0, workers: 4, scientists: 0 };
    player.isHuman = true;
    player.government = "dictatorship";
    s.planets[colony.planetId]!.special = "none";
    player.taxRate = 0;
    const untaxed = computeOutput(s.planets[colony.planetId]!, player, colony);
    // Morale moves the population tax (no barracks here: -20%).
    expect(untaxed.bc).toBe(4 + Math.round((4 * untaxed.morale) / 100));
    player.taxRate = 0.5;
    const taxed = computeOutput(s.planets[colony.planetId]!, player, colony);
    expect(taxed.taxes).toBe(Math.floor(untaxed.industry * 0.5));
    expect(taxed.bc).toBe(untaxed.bc + taxed.taxes);
  });
});

describe("original turn rules", () => {
  it("counts spies 2 each up to 5, 1 each up to 10, half each beyond", () => {
    expect([0, 5, 6, 10, 12, 13].map(spyCountBonus)).toEqual([0, 10, 11, 15, 16, 16]);
  });

  it("rates troops by kind with basic armor", () => {
    const s = newGame({ seed: "troops", races: ["terran", "felhari"], monsters: false, raiders: false, council: false });
    s.players[0]!.isHuman = true;
    s.players[0]!.techs = s.players[0]!.techs.filter((t) => !t.endsWith("Rifle") && !t.endsWith("Armor"));
    const rating = (kind: "militia" | "marines" | "armor") => troopUnit(s, 0, "terran", kind, false).rating;
    expect(rating("marines") - rating("militia")).toBe(10);
    expect(rating("armor") - rating("marines")).toBe(10);
  });
});

describe("original crews and space combat", () => {
  const twoEmpires = () => {
    const s = newGame({ seed: "crew", races: ["terran", "felhari"], monsters: false, raiders: false, council: false });
    s.players[0]!.contacts = [1];
    s.players[1]!.contacts = [0];
    return s;
  };
  const addFleet = (s: GameState, ownerId: number, starId: string, ships: Fleet["ships"], stance: Fleet["stance"] = "defend") => {
    const star = s.galaxy.stars.find((x) => x.id === starId)!;
    const f: Fleet = { id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance, name: "Test" };
    s.fleets[f.id] = f;
    return f;
  };

  it("ranks crews by experience, warlords one level higher", () => {
    const s = twoEmpires();
    const human = s.players[0]!;
    const warlord = s.players[1]!;
    expect([0, 49, 50, 149, 150, 500].map((xp) => crewLevel(xp, human))).toEqual([0, 0, 1, 1, 2, 3]);
    expect([0, 50, 150, 500].map((xp) => crewLevel(xp, warlord))).toEqual([1, 2, 3, 4]);
  });

  it("trains crews every turn, more at a Space Academy, and caps experience at Elite", () => {
    const s = twoEmpires();
    const home = s.players[0]!.homeStarId;
    const colony = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    const f = addFleet(s, 0, home, [{ designId: "frigate", count: 1, xp: 10 }]);
    crewTick(s);
    expect(f.ships[0]!.xp).toBe(11);
    colony.buildings.push("spaceAcademy");
    crewTick(s);
    expect(f.ships[0]!.xp).toBe(13);
    f.ships[0]!.xp = 499;
    crewTick(s);
    expect(f.ships[0]!.xp).toBe(CREW.xpCap);
  });

  it("speeds missiles up with better drives", () => {
    const s = twoEmpires();
    const p = s.players[0]!;
    expect(missileSpeed(p, WEAPONS_BY_ID.nuclearMissile!)).toBe(12);
    p.techs.push("fusionDrive", "ionDrive");
    expect(missileSpeed(p, WEAPONS_BY_ID.zeonMissile!)).toBe(16);
    expect(missileSpeed(p, WEAPONS_BY_ID.plasmaTorpedo!)).toBe(24);
  });

  it("gives the winner half the hull sizes it destroyed as experience", () => {
    const s = twoEmpires();
    const star = s.players[1]!.homeStarId;
    const a = addFleet(s, 0, star, [{ designId: "frigate", count: 12 }], "attack");
    const b = addFleet(s, 1, star, [{ designId: "frigate", count: 2 }]);
    const out = resolveCombat(s, new Rng({ s: 7 }), star, { ownerId: 0, fleets: [a], attacksPlanet: false }, { ownerId: 1, fleets: [b], attacksPlanet: false }, "cb");
    expect(out.report.winner).toBe(0);
    // Two frigates (size 0 + 1 each) destroyed: max(1, 2 / 2).
    expect(out.crewXp).toEqual({ ownerId: 0, amount: 1 });
  });

  it("hands the field to the defender when nothing can be decided", () => {
    const s = twoEmpires();
    const star = s.players[1]!.homeStarId;
    const colony = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
    colony.buildings = [];
    const a = addFleet(s, 0, star, [{ designId: "scout", count: 1 }]);
    const b = addFleet(s, 1, star, [{ designId: "scout", count: 1 }]);
    let checked = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const out = resolveCombat(s, new Rng({ s: seed }), star, { ownerId: 0, fleets: [a], attacksPlanet: false }, { ownerId: 1, fleets: [b], attacksPlanet: false, colony }, "cb");
      expect(out.attacker).toBe(0);
      // Unarmed ships may slip away; when both stay, nobody can win and the defender keeps the field.
      if (out.report.rounds.flat().some((e) => e.kind === "retreat")) continue;
      expect(out.report.winner).toBe(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("arms planets with a stellar converter and a fighter garrison", () => {
    const s = twoEmpires();
    const star = s.players[1]!.homeStarId;
    const colony = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
    colony.buildings = ["planetaryStellarConverter", "fighterGarrison"];
    expect(planetDefense(colony).installations).toEqual(["stellarConverter", "fighterGarrison"]);
    const a = addFleet(s, 0, star, [{ designId: "frigate", count: 6 }], "attack");
    const out = resolveCombat(s, new Rng({ s: 5 }), star, { ownerId: 0, fleets: [a], attacksPlanet: true }, { ownerId: 1, fleets: [], attacksPlanet: false, colony }, "cb");
    const planetKey = `planet:${colony.id}`;
    const events = out.report.rounds.flat().filter((e) => e.ship === planetKey);
    expect(events.some((e) => e.weapon === "stellarConverter")).toBe(true);
    expect(events.some((e) => e.kind === "launch" && e.weapon === "fighterBays")).toBe(true);
  });
});

describe("original details", () => {
  it("lets troop ships be built only at a Marine Barracks", () => {
    const s = newGame({ seed: "det", races: ["terran", "felhari"], monsters: false, raiders: false, council: false });
    const p = s.players[0]!;
    const c = Object.values(s.colonies).find((x) => x.ownerId === 0)!;
    const transport = findDesign(p, "transport")!;
    c.buildings = c.buildings.filter((b) => b !== "marineBarracks");
    expect(canBuildShips(c, transport)).toBe(false);
    c.buildings.push("marineBarracks");
    expect(canBuildShips(c, transport)).toBe(true);
  });

  it("serves warlike leaders one level higher", () => {
    expect(levelFromXp(0, false)).toBe(1);
    expect(levelFromXp(0, true)).toBe(2);
  });

  it("extends a fleet's range only when every ship carries fuel tanks", () => {
    const s = newGame({ seed: "det", races: ["terran", "felhari"], monsters: false, raiders: false, council: false });
    const p = s.players[0]!;
    const f = Object.values(s.fleets).find((x) => x.ownerId === 0)!;
    expect(fleetFuelRange(s, f)).toBe(fleetRange(p));
    p.designs.push({ ...findDesign(p, "scout")!, id: "longScout", specials: ["extendedFuelTanks"] });
    f.ships = [{ designId: "longScout", count: 1 }];
    expect(fleetFuelRange(s, f)).toBe(fleetRange(p) * 1.5);
  });
});

describe("original random events", () => {
  const setup = () => {
    const s = newGame({ seed: "ev", races: ["terran", "felhari"], monsters: false, raiders: false, council: false, randomEvents: false });
    const events: unknown[] = [];
    return { s, ctx: { state: s, rng: new Rng({ s: 7 }), emit: (e: unknown) => events.push(e) } as Parameters<typeof fireEvent>[0] };
  };

  it("grows donations with the turn", () => {
    const { s, ctx } = setup();
    s.turn = 65;
    const before = s.players[0]!.bc;
    fireEvent(ctx, "donation", s.players[0]!);
    expect(s.players[0]!.bc - before).toBe(100 + 100 * 3);
  });

  it("needs 10 stored research for a virus and takes at most 100", () => {
    const { s, ctx } = setup();
    const p = s.players[0]!;
    p.research.progress = 9;
    expect(fireEvent(ctx, "computerVirus", p)).toBe(false);
    p.research.progress = 500;
    fireEvent(ctx, "computerVirus", p);
    expect(p.research.progress).toBeGreaterThanOrEqual(400);
    expect(p.research.progress).toBeLessThanOrEqual(449);
  });

  it("lets pirates take 30 to 50 percent of a treasury of at least 100 BC", () => {
    const { s, ctx } = setup();
    const p = s.players[0]!;
    p.bc = 99;
    expect(fireEvent(ctx, "pirates", p)).toBe(false);
    p.bc = 1000;
    fireEvent(ctx, "pirates", p);
    expect(p.bc).toBeGreaterThanOrEqual(500);
    expect(p.bc).toBeLessThanOrEqual(700);
  });

  it("spares tolerant races industrial accidents", () => {
    const s = newGame({ seed: "ev", races: ["petrani", "terran"], monsters: false, raiders: false, council: false, randomEvents: false });
    const ctx = { state: s, rng: new Rng({ s: 7 }), emit: () => {} };
    expect(fireEvent(ctx, "industrialAccident", s.players[0]!)).toBe(false);
    expect(fireEvent(ctx, "industrialAccident", s.players[1]!)).toBe(true);
  });

  it("ends lasting events by 20 turns", () => {
    let { s, ctx } = setup();
    fireEvent(ctx, "hyperspaceFlux");
    expect(s.activeEvents!.some((e) => e.kind === "hyperspaceFlux")).toBe(true);
    for (let i = 0; i < 4; i++) s = processTurn(s, {});
    expect(s.activeEvents!.some((e) => e.kind === "hyperspaceFlux")).toBe(true);
    for (let i = 0; i < 17; i++) s = processTurn(s, {});
    expect(s.activeEvents!.some((e) => e.kind === "hyperspaceFlux")).toBe(false);
  });
});

describe("ship damage and repair", () => {
  const battle = () => {
    const s = newGame({ seed: "dmg", races: ["terran", "felhari"], monsters: false, raiders: false, council: false, randomEvents: false });
    s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
    const star = s.galaxy.stars.find((x) => x.id !== s.players[0]!.homeStarId && x.id !== s.players[1]!.homeStarId)!;
    const mk = (ownerId: number, count: number, stance: Fleet["stance"]): Fleet => {
      const f: Fleet = { id: `d${s.nextId++}`, ownerId, x: star.x, y: star.y, starId: star.id, destStarId: null, ships: [{ designId: "frigate", count }], stance, name: "D" };
      s.fleets[f.id] = f;
      return f;
    };
    return { s, star, a: mk(0, 8, "attack"), b: mk(1, 1, "defend") };
  };

  it("keeps the damage survivors took", () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const { s, star, a, b } = battle();
      const out = resolveCombat(s, new Rng({ s: seed }), star.id, { ownerId: 0, fleets: [a], attacksPlanet: false }, { ownerId: 1, fleets: [b], attacksPlanet: false }, "r");
      const left = out.survivors.get(a.id)!;
      found = left.some((x) => (x.damage?.length ?? 0) > 0 && x.damage!.length <= x.count);
    }
    expect(found).toBe(true);
  });

  it("starts damaged ships with less armor and repairs them fully with Advanced Damage Control", () => {
    const { s, star, a, b } = battle();
    a.ships = [{ designId: "frigate", count: 2, damage: [5] }];
    const out = resolveCombat(s, new Rng({ s: 3 }), star.id, { ownerId: 0, fleets: [a], attacksPlanet: false }, { ownerId: 1, fleets: [b], attacksPlanet: false }, "r");
    const snap = out.report.ships.filter((x) => x.ownerId === 0);
    expect(snap.filter((x) => x.armor !== undefined)).toHaveLength(1);
    s.players[0]!.techs.push("advancedDamageControl");
    const again = resolveCombat(s, new Rng({ s: 3 }), star.id, { ownerId: 0, fleets: [a], attacksPlanet: false }, { ownerId: 1, fleets: [b], attacksPlanet: false }, "r");
    expect(again.survivors.get(a.id)!.every((x) => !x.damage)).toBe(true);
  });

  it("repairs ships at a system with their own colony", () => {
    const s = newGame({ seed: "dock", races: ["terran", "felhari"], monsters: false, raiders: false, council: false, randomEvents: false });
    const home = s.players[0]!.homeStarId;
    const f = Object.values(s.fleets).find((x) => x.ownerId === 0 && x.starId === home)!;
    f.ships[0]!.damage = [3];
    repairTick(s);
    expect(f.ships[0]!.damage).toBeUndefined();
  });
});

describe("industry upkeep shortfall", () => {
  it("starves cybernetic colonists and shuts down androids the colony's industry can't keep", () => {
    const s = newGame({ seed: "cyb", races: ["kordex", "terran"], monsters: false, raiders: false, council: false });
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    const planet = s.planets[home.planetId]!;
    // Nobody works: no industry at all for 6 cybernetic colonists (3 upkeep) and 2 androids.
    const colony: Colony = { ...home, buildings: [], farmers: 0, workers: 0, scientists: 6, androids: { farmers: 0, workers: 0, scientists: 2 } };
    const out = computeOutput(planet, s.players[0]!, colony);
    expect(out.cyberShortHalf).toBe(6);
    expect(out.androidsUnfed).toBe(2);
    const human = computeOutput(planet, s.players[1]!, { ...colony, ownerId: 1, raceId: "terran", androids: undefined });
    expect(human.cyberShortHalf).toBe(0);
  });
});

describe("revolts", () => {
  it("lets a strong garrison put rebels down and lets rebels take an empty one", () => {
    const s = newGame({ seed: "rev", races: ["terran", "felhari"], monsters: false, raiders: false, council: false });
    const c = Object.values(s.colonies).find((x) => x.ownerId === 0)!;
    const ctx = { state: s, rng: new Rng({ s: 5 }), emit: () => {} };
    c.aliens = 0;
    c.tanksTrained = 30;
    expect(revoltFight(ctx, c, 3).won).toBe(false);
    c.tanksTrained = 0;
    c.buildings = [];
    c.aliens = population(c);
    expect(revoltFight(ctx, c, 3)).toEqual({ won: true, killed: 0 });
  });
});
