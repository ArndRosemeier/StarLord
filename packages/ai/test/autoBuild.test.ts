import { describe, expect, it } from "vitest";
import { newGame, playerView, processTurn, validateCommand, type Colony, type GameState } from "@starlord/sim";
import { autoBuildPick, automationOrders } from "@starlord/ai";

const quiet = { monsters: false, raiders: false, council: false };

function setup(): { s: GameState; home: Colony } {
  const s = newGame({ seed: "autobuild", playerCount: 2, humanPlayers: [0], ...quiet });
  const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
  return { s, home };
}

describe("auto build queue item", () => {
  it("is accepted once per queue, with a strategy", () => {
    const { s, home } = setup();
    const ok = validateCommand(s, 0, { type: "setQueue", colonyId: home.id, queue: [{ kind: "auto", strategy: "industry" }] });
    expect(ok.ok).toBe(true);
    const twice = validateCommand(s, 0, {
      type: "setQueue", colonyId: home.id, queue: [{ kind: "auto", strategy: "industry" }, { kind: "auto", strategy: "balanced" }],
    });
    expect(twice.ok).toBe(false);
  });

  it("puts its pick in front of itself when it comes up, and stays in the queue", () => {
    let { s, home } = setup();
    s = processTurn(s, { 0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "auto", strategy: "balanced" }] }] });
    const pick = autoBuildPick(playerView(s, 0), home.id, "balanced");
    expect(pick.item).not.toBeNull();
    const orders = automationOrders(playerView(s, 0));
    expect(orders).toContainEqual({ type: "setQueue", colonyId: home.id, queue: [pick.item, { kind: "auto", strategy: "balanced" }] });
    s = processTurn(s, { 0: orders });
    const q = s.colonies[home.id]!.queue;
    expect(q.at(-1)).toEqual({ kind: "auto", strategy: "balanced" });
    expect(q.length).toBeGreaterThanOrEqual(1);
  });

  it("waits behind other items until it is first", () => {
    let { s, home } = setup();
    s = processTurn(s, {
      0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "project", id: "spy" }, { kind: "auto", strategy: "balanced" }] }],
    });
    const orders = automationOrders(playerView(s, 0)).filter((o) => o.type === "setQueue" && o.colonyId === home.id);
    expect(orders).toEqual([]);
  });

  it("is passed over while idle: the items behind it are built", () => {
    let { s, home } = setup();
    s = processTurn(s, {
      0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "auto", strategy: "balanced" }, { kind: "project", id: "spy" }] }],
    });
    // Without the automation run, the auto item stays first; the colony works on the spy behind it.
    const progress = s.colonies[home.id]!.progress;
    expect(progress).toBeGreaterThan(0);
    s.players[0]!.bc = 50000;
    s = processTurn(s, { 0: [{ type: "buy", colonyId: home.id }] });
    expect(s.players[0]!.spies.home).toBeGreaterThan(0);
    expect(s.colonies[home.id]!.queue).toEqual([{ kind: "auto", strategy: "balanced" }]);
  });

  it("sells the industry as Trade Goods when nothing is behind an idle auto item", () => {
    let { s, home } = setup();
    s = processTurn(s, { 0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "auto", strategy: "balanced" }] }] });
    expect(s.colonies[home.id]!.progress).toBe(0);
  });
});
