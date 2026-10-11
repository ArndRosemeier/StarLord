import { describe, expect, it } from "vitest";
import {
  CREW, Rng, buyPrice, crewLevel, crewTick, getRace, growthPerTurn, missileSpeed, newGame, raceMaxPopulation,
  computeOutput, planetDefense, resolveCombat, spyCountBonus, troopUnit, WEAPONS_BY_ID, type Colony, type Fleet, type GameState,
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
