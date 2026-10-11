import { describe, expect, it } from "vitest";
import type { GameEvent } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { turnReport } from "../src/ui/turnReport";

const opts = { seed: "report", galaxySize: "small" as const, races: ["terran", "kordex", "zhrikk"] };

describe("turnReport", () => {
  it("sorts our events into sections with click targets and folds exploration", () => {
    const s = GameSession.create(opts, 0);
    const view = s.view;
    const home = Object.values(view.colonies).find((c) => c.ownerId === 0)!;
    const stars = view.galaxy.stars.slice(0, 3).map((x) => x.id);
    const events: GameEvent[] = [
      { turn: 1, kind: "built", playerId: 0, colonyId: home.id, item: { kind: "building", id: "automatedFactory" } },
      { turn: 1, kind: "techLearned", playerId: 0, techId: "x", tierId: "y" },
      { turn: 1, kind: "explored", playerId: 0, starId: stars[0]! },
      { turn: 1, kind: "explored", playerId: 0, starId: stars[1]! },
      { turn: 1, kind: "raid", playerId: 0, starId: stars[2]! },
      { turn: 1, kind: "built", playerId: 1, colonyId: home.id, item: { kind: "tradeGoods" } },
    ];
    const groups = turnReport(view, events);
    expect(groups.map((g) => g.section)).toEqual(["military", "production", "research", "exploration"]);
    expect(groups[0]!.lines[0]!.target).toEqual({ kind: "star", starId: stars[2] });
    expect(groups[1]!.lines).toHaveLength(1);
    expect(groups[1]!.lines[0]!.target).toEqual({ kind: "colony", colonyId: home.id });
    expect(groups[2]!.lines[0]!.target).toEqual({ kind: "research" });
    expect(groups[3]!.lines).toHaveLength(1);
    expect(groups[3]!.lines[0]!.text).toMatch(/^Explored 2 systems/);
  });

  it("reports real turn events after ending a turn", () => {
    const s = GameSession.create(opts, 0);
    let seen = 0;
    for (let i = 0; i < 15; i++) {
      s.endTurn();
      const groups = turnReport(s.view, s.lastTurnEvents(0));
      expect(groups.every((g) => g.lines.length > 0)).toBe(true);
      seen += groups.length;
    }
    // The view itself carries no events, so the report must come from the session.
    expect(s.view.events).toEqual([]);
    expect(seen).toBeGreaterThan(0);
  });
});
