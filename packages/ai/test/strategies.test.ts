import { describe, expect, it } from "vitest";
import { TIER_OF_TECH, newGame, playerView, processTurn, type Command, type GameEvent, type GameState, type TurnOrders } from "@starlord/sim";
import { ALL_DOMAINS, STRATEGIES, automationOrders, createController, strategyOf } from "@starlord/ai";
import { RESEARCH_FOCUS } from "../src/research.js";

function play(state: GameState, turns: number, onTurn?: (s: GameState) => void): GameState {
  for (let i = 0; i < turns && !state.over; i++) {
    const orders: TurnOrders = {};
    for (const p of state.players) if (p.alive && p.kind === "empire") orders[p.id] = automationOrders(playerView(state, p.id));
    state = processTurn(state, orders);
    onTurn?.(state);
  }
  return state;
}

const CONTESTED = ["already colonized", "no longer possible"];

describe("automation strategies", () => {
  it("offers Balanced first in every area", () => {
    for (const d of ALL_DOMAINS) {
      expect(STRATEGIES[d][0]!.id).toBe("balanced");
      expect(STRATEGIES[d].length).toBeGreaterThan(1);
      expect(new Set(STRATEGIES[d].map((s) => s.id)).size).toBe(STRATEGIES[d].length);
    }
  });

  it("only names real technologies in research focus lists", () => {
    for (const list of Object.values(RESEARCH_FOCUS)) for (const t of list) expect(TIER_OF_TECH[t], t).toBeDefined();
  });

  it("stores a strategy by command and forgets it when set back to Balanced", () => {
    let state = newGame({ seed: "strat", playerCount: 2, humanPlayers: [0] });
    const set = (strategy: string): Command => ({ type: "setAutomationStrategy", domain: "jobs", strategy });
    state = processTurn(state, { 0: [set("research")] });
    expect(state.players[0]!.automationStrategies).toEqual({ jobs: "research" });
    expect(strategyOf(playerView(state, 0), "jobs")).toBe("research");
    state = processTurn(state, { 0: [set("balanced")] });
    expect(state.players[0]!.automationStrategies).toBeUndefined();
    expect(strategyOf(playerView(state, 0), "jobs")).toBe("balanced");
  });

  it("treats saves without strategies, unknown strategies and computer empires as Balanced", () => {
    const state = newGame({ seed: "strat", playerCount: 2, humanPlayers: [0] });
    expect(strategyOf(playerView(state, 0), "production")).toBe("balanced");
    state.players[0]!.automationStrategies = { production: "nonsense" };
    expect(strategyOf(playerView(state, 0), "production")).toBe("balanced");
    state.players[1]!.automationStrategies = { production: "military" };
    expect(strategyOf(playerView(state, 1), "production")).toBe("balanced");
  });

  it("changes what the automation does", () => {
    const start = play(newGame({ seed: "jobs", playerCount: 2, humanPlayers: [0] }), 30);
    const scientists = (strategy: string) => {
      const state = structuredClone(start);
      state.players[0]!.automationStrategies = { jobs: strategy };
      const next = processTurn(state, { 0: createController(["jobs"]).orders(playerView(state, 0)) });
      return Object.values(next.colonies).filter((c) => c.ownerId === 0).reduce((n, c) => n + c.scientists, 0);
    };
    expect(scientists("research")).toBeGreaterThan(scientists("balanced"));
    expect(scientists("balanced")).toBeGreaterThan(scientists("industry"));
  });

  it("plays whole games on every strategy with few rejected orders", () => {
    const most = Math.max(...ALL_DOMAINS.map((d) => STRATEGIES[d].length));
    for (let i = 1; i < most; i++) {
      const state = newGame({ seed: `strategy-${i}`, playerCount: 3, maxTurns: 120, humanPlayers: [0] });
      state.players[0]!.automation = [...ALL_DOMAINS];
      state.players[0]!.automationStrategies = Object.fromEntries(
        ALL_DOMAINS.map((d) => [d, STRATEGIES[d][Math.min(i, STRATEGIES[d].length - 1)]!.id]),
      );
      const rejected: GameEvent[] = [];
      const end = play(state, 120, (s) =>
        rejected.push(...s.events.filter((e) => e.kind === "commandRejected" && e.playerId === 0 && !CONTESTED.some((c) => e.reason.includes(c)))),
      );
      expect(rejected.length, JSON.stringify(rejected.slice(0, 3))).toBeLessThanOrEqual(3);
      expect(Object.values(end.colonies).filter((c) => c.ownerId === 0 && !c.outpost).length).toBeGreaterThan(1);
    }
  });
});
