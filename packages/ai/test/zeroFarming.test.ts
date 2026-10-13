import { describe, expect, it } from "vitest";
import { newGame, playerView } from "@starlord/sim";
import { jobOrders } from "../src/jobs.js";

describe("jobs automation", () => {
  it("never puts farmers on a world where farming grows no food", () => {
    const s = newGame({ seed: "zero-farming-ai", races: ["terran", "felhari"] });
    const me = s.players[0]!;
    const c = Object.values(s.colonies).find((x) => x.ownerId === me.id)!;
    s.planets[c.planetId]!.type = "toxic";
    for (const strategy of ["balanced", "industry", "research"]) {
      me.automationStrategies = { ...me.automationStrategies, jobs: strategy };
      const set = jobOrders(playerView(s, me.id)).find((o) => o.type === "setJobs" && o.colonyId === c.id);
      const farmers = set && set.type === "setJobs" ? set.farmers : c.farmers;
      expect(farmers).toBe(0);
    }
  });
});
