import { describe, expect, it } from "vitest";
import { BUILDINGS, DIFFICULTY_ORDER, GOVERNMENTS, PROJECTS, TECHS, TRAIT_COSTS, colonyOutput, spyOdds, type RaceTrait } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import {
  buildingTip, difficultyText, galaxyAgeText, governmentTip, moraleTip, projectTip, techLevelText, techTip, tradeGoodsBC, traitTip,
} from "../src/ui/explain";

describe("effect explanations", () => {
  it("explains every tech, building, government, trait and option", () => {
    for (const id of Object.keys(TECHS)) expect(techTip(id).text?.join(" ").length).toBeGreaterThan(0);
    for (const b of BUILDINGS) expect(buildingTip(b.id).rows?.length).toBe(2);
    for (const g of Object.keys(GOVERNMENTS) as (keyof typeof GOVERNMENTS)[]) expect(governmentTip(g).rows?.length).toBeGreaterThan(5);
    for (const t of Object.keys(TRAIT_COSTS) as RaceTrait[]) expect(traitTip(t).text?.[0]).toBeTruthy();
    for (const d of DIFFICULTY_ORDER) expect(difficultyText(d)).toMatch(/computer empires/);
    for (const a of ["young", "average", "old"] as const) expect(galaxyAgeText(a)).toMatch(/%/);
    for (const t of ["preWarp", "average", "advanced"] as const) expect(techLevelText(t)).toMatch(/BC/);
  });

  it("shows this colony's own numbers for morale, projects and trade goods", () => {
    const s = GameSession.create({ seed: "explain", galaxySize: "small", races: ["terran", "kordex"] }, 0);
    const view = s.view;
    const colony = Object.values(view.colonies).find((c) => c.ownerId === 0)!;
    const o = colonyOutput(view, colony);
    expect(moraleTip(view, colony).title).toMatch(/morale/i);
    for (const p of PROJECTS) expect(projectTip(p.id, colony, view.planets[colony.planetId]!, o.industry).text?.[0]).toBeTruthy();
    expect(tradeGoodsBC("terran", 7)).toBe(4);
  });

  it("gives spy odds that grow with the edge", () => {
    const low = spyOdds(-20, "steal");
    const high = spyOdds(40, "steal");
    expect(high.success).toBeGreaterThan(low.success);
    expect(high.blame).toBeLessThanOrEqual(high.success);
    expect(spyOdds(0, "idle").success).toBe(0);
    expect(spyOdds(0, "steal").lost).toBeGreaterThan(spyOdds(0, "idle").lost);
  });
});
