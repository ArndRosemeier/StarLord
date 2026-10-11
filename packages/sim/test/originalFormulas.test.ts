import { describe, expect, it } from "vitest";
import { buyPrice, getRace, growthPerTurn, newGame, raceMaxPopulation, computeOutput, spyCountBonus, troopUnit, type Colony } from "@starlord/sim";

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
