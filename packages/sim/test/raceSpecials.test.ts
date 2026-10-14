import { describe, expect, it } from "vitest";
import { colonyOutput, designStats, foodPlan, giftProblem, newGame, treatyScore, type GameState, type ShipDesign } from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

function met(races: string[]): GameState {
  const s = newGame({ seed: "race-specials", races, humanPlayers: [0], ...quiet });
  for (const p of s.players) if (p.kind === "empire") p.contacts = s.players.filter((q) => q.kind === "empire" && q.id !== p.id).map((q) => q.id);
  return s;
}

const destroyer = (): ShipDesign => ({
  id: "w", name: "w", hull: "destroyer", armor: "titaniumArmor", shield: null, computer: "electronicComputer",
  weapons: [{ weaponId: "laserCannon", count: 1 }], specials: [], module: null, obsolete: false,
});

describe("race specials work as the original announces", () => {
  it("adds the ship defense pick to missile evasion too", () => {
    const s = met(["terran", "lysari"]);
    const d = destroyer();
    const plain = designStats(s.players[0]!, d);
    const evasive = designStats(s.players[1]!, d);
    expect(evasive.missileEvasion - plain.missileEvasion).toBe(25);
    expect(evasive.defense - plain.defense).toBe(25);
  });

  it("lets repulsive races give no gifts and costs them 50 points on peace offers", () => {
    const s = met(["petrani", "terran"]);
    expect(giftProblem(s, 0, 1, { bc: 1 })).toMatch(/repulsive/);
    expect(giftProblem(s, 1, 0, { bc: 1 })).toMatch(/repulsive/);
    const parts = treatyScore(s, 0, 1, "peace", null).parts;
    expect(parts.find((p) => p.why === "you are repulsive")?.value).toBe(-50);
  });

  it("rounds cybernetic food up per colony", () => {
    const s = met(["kordex", "terran"]);
    const colony = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    colony.workers += 1;
    const out = colonyOutput(s, colony);
    expect(out.population % 2).toBe(1);
    expect(out.foodEaten).toBe((out.population + 1) / 2);
  });

  it("sells the empire's net food surplus, rounded down, at ½ BC (1 BC for fantastic traders)", () => {
    const s = met(["terran", "quillan"]);
    for (const id of [0, 1]) {
      const colony = Object.values(s.colonies).find((c) => c.ownerId === id)!;
      const out = { ...colonyOutput(s, colony), foodNet: 3, blockaded: false };
      const hungry = { ...out, foodNet: -2 };
      const plan = foodPlan(s, id, [{ colony, out }, { colony: { ...colony, id: "hungry" }, out: hungry }]);
      expect(plan.sold).toBe(1);
      expect(plan.saleBC).toBe(id === 0 ? 0 : 1);
    }
  });
});
