import { describe, expect, it } from "vitest";
import { newGame, previewOrders, processTurn, type Command, type GameState } from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

/** Both empires land their colony ship at home this turn; empire 1's orders run first. */
function setup(): { s: GameState; orders: Record<number, Command[]>; planetId: string } {
  const s = newGame({ seed: "new-colony-orders", playerCount: 2, ...quiet });
  s.turn = 1;
  const orders: Record<number, Command[]> = {};
  let planetId = "";
  for (const pid of [0, 1]) {
    const free = Object.values(s.planets).find((p) => p.starId === s.players[pid]!.homeStarId && !p.colonyId)!;
    free.type = "terran";
    const fleet = Object.values(s.fleets).find((f) => f.ownerId === pid && f.ships.some((x) => x.designId === "colonyShip"))!;
    orders[pid] = [{ type: "colonize", fleetId: fleet.id, planetId: free.id }];
    if (pid === 0) planetId = free.id;
  }
  return { s, orders, planetId };
}

describe("orders for a colony settled this turn", () => {
  it("reach it even when another empire settles first in the turn", () => {
    const { s, orders, planetId } = setup();
    // The player sees the new colony at once and queues a build there.
    const preview = previewOrders(s, 0, orders[0]!).state;
    const colonyId = preview.planets[planetId]!.colonyId!;
    orders[0]!.push(
      { type: "setQueue", colonyId, queue: [{ kind: "tradeGoods" }] },
      { type: "setJobs", colonyId, farmers: 1, workers: 0, scientists: 0 },
    );
    const after = processTurn(s, orders);
    const colony = after.colonies[after.planets[planetId]!.colonyId!]!;
    expect(colony.id).toBe(colonyId);
    expect(colony.ownerId).toBe(0);
    expect(colony.queue).toEqual([{ kind: "tradeGoods" }]);
    expect(after.events.filter((e) => e.kind === "commandRejected")).toEqual([]);
  });
});
