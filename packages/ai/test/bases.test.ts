import { describe, expect, it } from "vitest";
import { newGame, playerView, processTurn, type Colony, type GameState, type Planet } from "@starlord/sim";
import { automationOrders } from "../src/index.js";

const quiet = { monsters: false, raiders: false, council: false };

/** A finished Colony Base waiting at the first empire's home for one of several free planets. */
function waitingBase(): { s: GameState; home: Colony; free: Planet[] } {
  for (let i = 0; ; i++) {
    let s = newGame({ seed: `bases${i}`, playerCount: 2, ...quiet });
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    const starId = s.planets[home.planetId]!.starId;
    const free = Object.values(s.planets).filter((p) => p.starId === starId && !p.colonyId);
    if (free.length < 2) continue;
    free.forEach((p, k) => {
      p.type = "terran";
      p.size = (["tiny", "small", "medium", "large", "huge"] as const)[Math.min(4, k)]!;
    });
    s.players[0]!.techs.push("colonyBase");
    s.players[0]!.bc = 5000;
    s = processTurn(s, {
      0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "project", id: "colonyBase" }] }, { type: "buy", colonyId: home.id }],
    });
    return { s, home, free };
  }
}

describe("finished bases", () => {
  it("lets automation place a waiting base on the roomiest planet", () => {
    let { s, home, free } = waitingBase();
    expect(s.colonies[home.id]!.readyBases).toEqual(["colonyBase"]);
    s.players[0]!.isHuman = false;
    const orders = automationOrders(playerView(s, 0)).filter((c) => c.type === "placeBase");
    expect(orders).toEqual([{ type: "placeBase", colonyId: home.id, projectId: "colonyBase", planetId: free[free.length - 1]!.id }]);
    s = processTurn(s, { 0: orders });
    expect(s.colonies[s.planets[free[free.length - 1]!.id]!.colonyId!]?.ownerId).toBe(0);
  });
});
