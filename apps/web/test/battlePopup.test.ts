import { describe, expect, it } from "vitest";
import { GameSession } from "../src/game/session";
import { battlesOfLastTurn } from "../src/game/battles";

describe("battles after a turn", () => {
  it("brings up the battle in which the Guardian destroyed our scout", () => {
    const s = GameSession.create({ seed: "orion", races: ["terran", "terran"], monsters: true, raiders: false, council: false }, 0);
    const guardian = Object.values(s.state.fleets).find((f) => f.ships[0]!.designId === "guardian")!;
    const scout = Object.values(s.state.fleets).find((f) => f.ownerId === 0 && f.ships.some((x) => x.designId === "scout"))!;
    Object.assign(scout, { starId: null, x: guardian.x + 0.5, y: guardian.y, destStarId: guardian.starId });
    expect(battlesOfLastTurn(s.history, 0, s.state.turn)).toEqual([]);
    s.endTurn({ commandBattles: false });
    expect(s.state.fleets[scout.id]).toBeUndefined();
    const battles = battlesOfLastTurn(s.history, 0, s.state.turn);
    expect(battles).toHaveLength(1);
    expect(battles[0]!.starId).toBe(guardian.starId);
    expect(battles[0]!.winner).not.toBe(0);
    // A turn later they are old news and don't open again.
    s.endTurn({ commandBattles: false });
    expect(battlesOfLastTurn(s.history, 0, s.state.turn).some((b) => b.id === battles[0]!.id)).toBe(false);
  });

  it("stops the turn at a battle the player commands, and goes on once they hand in orders", () => {
    const s = GameSession.create({ seed: "orion", races: ["terran", "terran"], monsters: true, raiders: false, council: false }, 0);
    const guardian = Object.values(s.state.fleets).find((f) => f.ships[0]!.designId === "guardian")!;
    const scout = Object.values(s.state.fleets).find((f) => f.ownerId === 0 && f.ships.some((x) => x.designId === "scout"))!;
    Object.assign(scout, { starId: null, x: guardian.x + 0.5, y: guardian.y, destStarId: guardian.starId });
    const turn = s.state.turn;
    s.endTurn();
    expect(s.state.turn).toBe(turn);
    expect(s.battle?.pending.starId).toBe(guardian.starId);
    s.finishBattle("auto");
    expect(s.battle).toBeNull();
    expect(s.state.turn).toBe(turn + 1);
    expect(s.state.fleets[scout.id]).toBeUndefined();
    // Auto-resolved battles still pop up; commanded ones were watched as they were fought.
    expect(s.commandedBattles.size).toBe(0);
    expect(s.record?.turns.at(-1)?.orders[0]?.some((c) => c.type === "battleOrders")).toBe(true);
  });

  it("lets every battle resolve by itself when the player turned commanding off", () => {
    const s = GameSession.create({ seed: "orion", races: ["terran", "terran"], monsters: true, raiders: false, council: false }, 0);
    const guardian = Object.values(s.state.fleets).find((f) => f.ships[0]!.designId === "guardian")!;
    const scout = Object.values(s.state.fleets).find((f) => f.ownerId === 0 && f.ships.some((x) => x.designId === "scout"))!;
    Object.assign(scout, { starId: null, x: guardian.x + 0.5, y: guardian.y, destStarId: guardian.starId });
    s.issue({ type: "setAutoBattles", on: true });
    const turn = s.state.turn;
    s.endTurn();
    expect(s.battle).toBeNull();
    expect(s.state.turn).toBe(turn + 1);
    expect(s.state.players[0]!.autoBattles).toBe(true);
  });
});
