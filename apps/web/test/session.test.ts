import { describe, expect, it } from "vitest";
import { TIERS_BY_ID, availableTiers } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { buildScene } from "../src/map/scene";

const opts = { seed: "ui", galaxySize: "small" as const, races: ["terran", "kordex", "zhrikk"] };

describe("GameSession", () => {
  it("shows orders in the view before the turn ends", () => {
    const s = GameSession.create(opts, 0);
    const tier = availableTiers(s.state, 0).find((t) => TIERS_BY_ID[t]!.techs.length > 1)!;
    s.issue({ type: "setResearch", tierId: tier, techId: TIERS_BY_ID[tier]!.techs[0]! });
    expect(s.view.players[0]!.research.tierId).toBe(tier);
    expect(s.state.players[0]!.research.tierId).toBeNull();
    s.endTurn();
    expect(s.state.turn).toBe(2);
    expect(s.state.players[0]!.research.tierId).toBe(tier);
    expect(s.pending).toEqual([]);
  });

  it("replaces superseded orders and lets a split fleet move the same turn", () => {
    const s = GameSession.create(opts, 0);
    s.issue({ type: "setTaxRate", rate: 0.2 }, { type: "setTaxRate", rate: 0.3 });
    expect(s.pending).toHaveLength(1);
    const scouts = Object.values(s.state.fleets).filter((f) => f.ownerId === 0 && f.ships.some((x) => x.designId === "scout"));
    s.issue({ type: "mergeFleets", fleetIds: scouts.map((f) => f.id) });
    const guard = Object.values(s.view.fleets).find((f) => f.ownerId === 0 && f.ships.some((x) => x.designId === "scout" && x.count === 2))!;
    s.issue({ type: "splitFleet", fleetId: guard.id, ships: [{ designId: "scout", count: 1 }] });
    const split = Object.values(s.view.fleets).find((f) => f.id !== guard.id && f.id.startsWith(guard.id))!;
    const dest = s.view.galaxy.stars.find((st) => st.id !== guard.starId && Math.hypot(st.x - guard.x, st.y - guard.y) < 4)!;
    s.issue({ type: "moveFleet", fleetId: split.id, destStarId: dest.id });
    expect(s.rejected).toEqual([]);
    s.endTurn();
    expect(s.state.fleets[split.id]!.destStarId ?? s.state.fleets[split.id]!.starId).toBe(dest.id);
    expect(s.state.events.filter((e) => e.kind === "commandRejected" && e.playerId === 0)).toEqual([]);
  });

  it("round-trips through a save", () => {
    const s = GameSession.create(opts, 0);
    s.issue({ type: "setTaxRate", rate: 0.4 });
    const copy = GameSession.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(copy.view.players[0]!.taxRate).toBe(0.4);
    copy.endTurn();
    s.endTurn();
    expect(copy.state).toEqual(s.state);
  });

  it("runs an all-AI game for spectators", () => {
    const s = GameSession.create(opts, null);
    for (let i = 0; i < 5; i++) s.endTurn();
    expect(s.state.turn).toBe(6);
    expect(s.history).toHaveLength(5);
  });
});

describe("GameSession records", () => {
  it("records every turn so the game can be replayed and verified", () => {
    const s = GameSession.create(opts, 0);
    s.issue({ type: "setTaxRate", rate: 0.3 });
    for (let i = 0; i < 4; i++) s.endTurn();
    expect(s.record!.turns).toHaveLength(4);
    expect(s.verifyRecord().ok).toBe(true);
    const watched = GameSession.fromJSON(JSON.parse(JSON.stringify(s.record)));
    expect(watched.spectator).toBe(true);
    expect(watched.state).toEqual(s.state);
  });
});

describe("map routes", () => {
  it("predicts arrival turns that match movement, and explains out-of-range stars", () => {
    const s = GameSession.create(opts, 0);
    const fleet = Object.values(s.view.fleets).find((f) => f.ownerId === 0 && f.starId)!;
    const routes = buildScene(s.view, null, fleet.id, true).routes;
    const far = [...routes].find(([, r]) => !r.ok);
    expect(far?.[1]).toMatchObject({ ok: false, reason: expect.stringContaining("out of range") });
    const [destId, route] = [...routes]
      .filter(([id, r]) => r.ok && id !== fleet.starId)
      .sort(([, a], [, b]) => (b.ok ? b.turns : 0) - (a.ok ? a.turns : 0))[0]!;
    if (!route.ok) throw new Error("unreachable");
    s.issue({ type: "moveFleet", fleetId: fleet.id, destStarId: destId });
    for (let i = 0; i < route.turns; i++) {
      expect(s.state.fleets[fleet.id]!.starId).not.toBe(destId);
      s.endTurn();
    }
    expect(s.state.fleets[fleet.id]!.starId).toBe(destId);
  });
});
