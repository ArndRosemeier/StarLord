import { describe, expect, it } from "vitest";
import { newGame, playerView, processTurn, type Fleet, type ShipDesign } from "@starlord/sim";
import { automationOrders } from "../src/index.js";
import { refitOrders } from "../src/refit.js";

const quiet = { monsters: false, raiders: false, council: false };

function setup() {
  const s = newGame({ seed: "airefit", playerCount: 2, ...quiet });
  const p = s.players[0]!;
  p.isHuman = false;
  p.techs.push("tritaniumArmor");
  const old = p.designs.find((d) => d.id === "frigate")!;
  old.obsolete = true;
  // Same weapons, better armor: much stronger for the hull's minimum refit price.
  const mk2: ShipDesign = { ...structuredClone(old), id: "mk2", name: "Frigate Mk 2", armor: "tritaniumArmor", obsolete: false };
  p.designs.push(mk2);
  const star = s.galaxy.stars.find((x) => x.id === p.homeStarId)!;
  const fleet: Fleet = {
    id: "old", ownerId: 0, x: star.x, y: star.y, starId: star.id, destStarId: null,
    ships: [{ designId: "frigate", count: 2 }], stance: "defend", name: "Old",
  };
  s.fleets[fleet.id] = fleet;
  return s;
}

describe("AI refits", () => {
  it("refits obsolete warships idle at a capable colony", () => {
    const s = setup();
    const orders = refitOrders(playerView(s, 0));
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0]).toMatchObject({ type: "refitShips", fleetId: "old", designId: "frigate", toDesignId: "mk2" });
  });

  it("issues orders the turn accepts, and the ships come back refitted", () => {
    let s = setup();
    for (let t = 0; t < 8; t++) {
      const orders = automationOrders(playerView(s, 0));
      s = processTurn(s, { 0: orders });
      expect(s.events.filter((e) => e.kind === "commandRejected" && e.playerId === 0 && e.reason.includes("refit"))).toEqual([]);
    }
    const ships = Object.values(s.fleets).filter((f) => f.ownerId === 0).flatMap((f) => f.ships);
    expect(ships.some((x) => x.designId === "mk2")).toBe(true);
  });

  it("leaves current designs alone", () => {
    const s = setup();
    s.players[0]!.designs.find((d) => d.id === "frigate")!.obsolete = false;
    expect(refitOrders(playerView(s, 0))).toEqual([]);
  });
});
