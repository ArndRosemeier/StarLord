import { describe, expect, it } from "vitest";
import {
  ARMORS, BUILDINGS, COMPUTERS, HULLS, PROJECTS, RESEARCH, SHIELDS, SPECIALS, TECHS, TECH_FIELDS, TECH_TIERS, TIERS_BY_ID,
  WEAPONS, availableTiers, breakthroughChance, commandPointsAvailable, empireBonus, getRace, newGame, processTurn,
  researchOptions, score, validateCommand, type GameState,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

const game = (races = ["terran", "kordex"]): GameState => newGame({ seed: "research", races, ...quiet });

/** Finishes a field for player 0: enough points for a certain breakthrough. */
function research(s: GameState, tierId: string, techId?: string): GameState {
  s.players[0]!.research.progress = TIERS_BY_ID[tierId]!.cost * RESEARCH.maxCostMult;
  return processTurn(s, { 0: [{ type: "setResearch", tierId, techId }] });
}

describe("tech tree", () => {
  it("has the original fields, costs and chains", () => {
    const normal = TECH_TIERS.filter((t) => !t.hyper);
    expect(normal).toHaveLength(73);
    expect(normal.reduce((n, t) => n + t.cost, 0)).toBe(193290);
    expect(TECH_TIERS.filter((t) => t.hyper)).toHaveLength(8);
    expect(TECH_TIERS.filter((t) => t.general).map((t) => t.id).sort()).toEqual(
      ["chemistry", "coldFusion", "electronics", "engineering", "nuclearFission", "physics"],
    );
    expect(TIERS_BY_ID.cybertechnics!.prev).toBe("cybertronics");
    expect(TIERS_BY_ID.hyperDimensionalPhysics!.cost).toBe(6000);
    expect(TIERS_BY_ID.temporalFields!.techs).toContain("phasingCloak");
    expect(TIERS_BY_ID.molecularControl!.cost).toBe(10000);
  });

  it("links every requirement in the other tables to a known application", () => {
    const lists = [BUILDINGS, PROJECTS, HULLS, WEAPONS, ARMORS, SHIELDS, COMPUTERS, SPECIALS] as { id: string; requires: string | null }[][];
    for (const list of lists) for (const x of list) if (x.requires) expect(TECHS[x.requires], `${x.id} needs ${x.requires}`).toBeDefined();
  });

  it("starts with the general fields and the hulls up to battleship", () => {
    const p = game().players[0]!;
    expect(p.techs).toEqual(expect.arrayContaining(["capitol", "nuclearDrive", "standardFuelCells", "outpostShip", "laserCannon"]));
    expect(p.techs).not.toContain("hydroponicFarm");
    expect(HULLS.filter((h) => h.requires === null).map((h) => h.id)).toEqual(["frigate", "destroyer", "cruiser", "battleship"]);
  });
});

describe("research rules", () => {
  it("gives everyone every application of a general field", () => {
    let s = game();
    const p = s.players[0]!;
    p.tiers = p.tiers.filter((t) => t !== "coldFusion");
    p.techs = p.techs.filter((t) => !TIERS_BY_ID.coldFusion!.techs.includes(t));
    s = research(s, "coldFusion");
    expect(s.players[0]!.techs).toEqual(expect.arrayContaining(["colonyShip", "outpostShip", "transport"]));
  });

  it("rolls for a breakthrough between the base cost and twice the cost", () => {
    expect(breakthroughChance(99, 100)).toBe(0);
    expect(breakthroughChance(100, 100)).toBe(RESEARCH.breakthroughStartChance);
    expect(breakthroughChance(150, 100)).toBeGreaterThan(RESEARCH.breakthroughStartChance);
    expect(breakthroughChance(200, 100)).toBe(1);
    let s = game();
    s.players[0]!.research.progress = 1000;
    s = processTurn(s, { 0: [{ type: "setResearch", tierId: "astroBiology", techId: "biospheres" }] });
    expect(s.players[0]!.tiers).toContain("astroBiology");
    expect(s.players[0]!.research.progress).toBeGreaterThan(900);
  });

  it("opens a repeatable hyper-advanced field once a category is done", () => {
    let s = game();
    const p = s.players[0]!;
    const sociology = TECH_TIERS.filter((t) => t.field === "sociology" && !t.hyper);
    expect(availableTiers(s, 0)).not.toContain("hyperSociology");
    p.tiers.push(...sociology.map((t) => t.id));
    expect(availableTiers(s, 0)).toContain("hyperSociology");
    const before = score(s, 0);
    s = research(s, "hyperSociology");
    s = research(s, "hyperSociology");
    expect(s.players[0]!.hyperLevels.sociology).toBe(2);
    expect(availableTiers(s, 0)).toContain("hyperSociology");
    expect(TECH_FIELDS.every((f) => f === "sociology" || s.players[0]!.hyperLevels[f] === 0)).toBe(true);
    expect(score(s, 0)).toBeGreaterThanOrEqual(before);
  });

  it("offers only the player's own advanced government and switches to it", () => {
    let s = game();
    const p = s.players[0]!;
    expect(p.government).toBe("democracy");
    expect(researchOptions(p, TIERS_BY_ID.advancedGovernments!)).toEqual(["federation"]);
    expect(validateCommand(s, 0, { type: "setResearch", tierId: "advancedGovernments", techId: "imperium" }).ok).toBe(false);
    p.tiers.push("militaryTactics", "xenoRelations", "macroEconomics", "teachingMethods");
    s = research(s, "advancedGovernments", "federation");
    expect(s.players[0]!.government).toBe("federation");
  });

  it("grants race picks with Evolutionary Mutation", () => {
    let s = game();
    s.players[0]!.tiers.push(...TECH_TIERS.filter((t) => t.field === "biology" && t.id !== "transGenetics" && !t.hyper).map((t) => t.id));
    s = research(s, "transGenetics", "evolutionaryMutation");
    expect(s.players[0]!.mutationPoints).toBe(RESEARCH.mutationPicks);
    // Terrans start at +1 research; +2 costs 3 more points.
    const picks = { ...getRace(s.players[0]!.raceId).picks, science: 2 };
    s = processTurn(s, { 0: [{ type: "mutateRace", picks }] });
    const p = s.players[0]!;
    expect(getRace(p.raceId).picks.science).toBe(2);
    expect(p.mutationPoints).toBe(RESEARCH.mutationPicks - 3);
    expect(Object.values(s.colonies).filter((c) => c.ownerId === 0).every((c) => c.raceId === p.raceId)).toBe(true);
  });
});

describe("tech bonuses", () => {
  it("counts only the best rifle, suit and armor", () => {
    const p = game().players[0]!;
    p.techs.push("laserRifle", "fusionRifle", "plasmaRifle", "poweredArmor", "personalShield", "tritaniumArmor", "zortriumArmor");
    expect(empireBonus(p).groundCombat).toBe(3 + 2 + 1.5);
  });

  it("does not stack Microbiotics with Universal Antidote", () => {
    const p = game().players[0]!;
    p.techs.push("microbiotics");
    expect(empireBonus(p).growth).toBe(0.25);
    p.techs.push("universalAntidote");
    expect(empireBonus(p).growth).toBe(0.5);
  });

  it("adds command points per orbital base from the best communications", () => {
    const s = game();
    const p = s.players[0]!;
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    if (!home.buildings.includes("starBase")) home.buildings.push("starBase");
    const bases = Object.values(s.colonies).filter((c) => c.ownerId === 0 && c.buildings.includes("starBase")).length;
    const base = commandPointsAvailable(s, 0);
    p.techs.push("tachyonCommunications", "subspaceCommunications");
    expect(commandPointsAvailable(s, 0)).toBe(base + 2 * bases);
  });
});
