import { describe, expect, it } from "vitest";
import { assignJobsForFood, farmerFood, newGame, population, processTurn, type GameState } from "@starlord/sim";

/** A game whose first homeworld sits on a barren world, where farmers grow nothing. */
function barrenHome(): { s: GameState; colonyId: string } {
  const s = newGame({ seed: "zero-farming", races: ["terran", "felhari"] });
  const c = Object.values(s.colonies).find((x) => x.ownerId === s.players[0]!.id)!;
  s.planets[c.planetId]!.type = "barren";
  return { s, colonyId: c.id };
}

describe("no farmers where farming grows no food", () => {
  it("farmerFood is 0 on a barren world and positive on the terran homeworld", () => {
    const s = newGame({ seed: "zero-farming", races: ["terran", "felhari"] });
    const c = Object.values(s.colonies).find((x) => x.ownerId === s.players[0]!.id)!;
    expect(farmerFood(s, c)).toBeGreaterThan(0);
    s.planets[c.planetId]!.type = "barren";
    expect(farmerFood(s, c)).toBe(0);
  });

  it("assigning jobs for food leaves a hungry barren colony without farmers", () => {
    const { s, colonyId } = barrenHome();
    const c = s.colonies[colonyId]!;
    assignJobsForFood(s, c, 0);
    expect(c.farmers).toBe(0);
    expect(c.workers).toBe(population(c));
  });

  it("new colonists on a barren world never become farmers", () => {
    let { s, colonyId } = barrenHome();
    const c = s.colonies[colonyId]!;
    c.workers += c.farmers;
    c.farmers = 0;
    // The colony is short of food, so the original rule would make every newcomer a farmer.
    for (let i = 0; i < 6; i++) {
      s.colonies[colonyId]!.growthK = 999.9;
      s = processTurn(s, {});
      expect(s.colonies[colonyId]?.farmers ?? 0).toBe(0);
    }
  });
});
