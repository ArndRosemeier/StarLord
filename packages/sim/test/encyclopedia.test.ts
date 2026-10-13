import { describe, expect, it } from "vitest";
import {
  BUILDINGS, HULLS, PROJECTS, SPECIALS, TECHS, TECH_TIERS, WEAPONS, cumulativeTierCost, techHasEffect, techInfo, techUnlocks,
} from "@starlord/sim";

describe("encyclopedia cross-references", () => {
  it("finds what a tech unlocks across the tables", () => {
    expect(techUnlocks("laserCannon").map((u) => u.kind)).toContain("weapon");
    expect(techUnlocks("titanHull")).toEqual([{ kind: "hull", id: "titan", name: "Titan hull" }]);
    expect(techUnlocks("outpostShip").map((u) => u.kind).sort()).toEqual(["module"]);
    expect(techUnlocks("ionDrive")[0]!.kind).toBe("drive");
  });

  it("links every researchable component back to a tech that unlocks it", () => {
    for (const list of [BUILDINGS, PROJECTS, HULLS, WEAPONS, SPECIALS] as { id: string; requires: string | null }[][]) {
      for (const x of list) {
        if (!x.requires || !TECHS[x.requires]) continue;
        expect(techUnlocks(x.requires).some((u) => u.id === x.id), x.id).toBe(true);
      }
    }
  });

  it("describes a tech's place in its field", () => {
    const info = techInfo("fusionBeam")!;
    expect(info.tier.id).toBe("fusionPhysics");
    expect(info.prerequisite?.id).toBe("physics");
    expect(info.leadsTo?.id).toBe("tachyonPhysics");
    expect(info.alternatives).toEqual(["fusionRifle"]);
    expect(cumulativeTierCost(info.tier)).toBe(50 + 150);
  });

  it("knows which techs do something", () => {
    expect(techHasEffect("laserCannon")).toBe(true);
    expect(techHasEffect("microbiotics")).toBe(true);
    const all = TECH_TIERS.flatMap((t) => t.techs);
    expect(all.filter((t) => !techHasEffect(t))).toEqual([]);
  });
});
