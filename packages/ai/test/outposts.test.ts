import { describe, expect, it } from "vitest";
import { newGame, playerView, validateCommand } from "@starlord/sim";
import { colonizationOrders, outpostTargets } from "@starlord/ai";

const quiet = { monsters: false, raiders: false, council: false };

describe("AI outposts", () => {
  it("makes the AI send outpost ships to gas giants and asteroid belts", () => {
    for (let i = 0; i < 40; i++) {
      const s = newGame({ seed: `aiOutpost${i}`, playerCount: 2, ...quiet });
      const me = s.players[0]!;
      me.techs.push("outpostShip");
      const view = playerView(s, 0);
      const target = outpostTargets(view).find((t) => t.planet.type === "gasGiant" || t.planet.type === "asteroids");
      if (!target) continue;
      // Put an outpost-only fleet at that star.
      const fleet = Object.values(s.fleets).find((f) => f.ownerId === 0)!;
      const star = s.galaxy.stars.find((x) => x.id === target.planet.starId)!;
      Object.assign(fleet, { starId: star.id, destStarId: null, x: star.x, y: star.y, ships: [{ designId: "outpostShip", count: 1 }] });
      const orders = colonizationOrders(playerView(s, 0));
      const settle = orders.find((o) => o.type === "colonize" && o.fleetId === fleet.id);
      expect(settle).toBeDefined();
      if (settle?.type === "colonize") {
        expect(settle.module).toBe("outpost");
        expect(validateCommand(s, 0, settle).ok).toBe(true);
      }
      return;
    }
    throw new Error("no seed with an unsettleable outpost target in range");
  });
});
