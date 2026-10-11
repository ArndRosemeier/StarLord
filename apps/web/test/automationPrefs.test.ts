import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savedAutomationOrders } from "../src/game/automationPrefs";
import { GameSession } from "../src/game/session";

const opts = { seed: "prefs", galaxySize: "small" as const, races: ["terran", "kordex"] };

describe("automation preferences", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts with no orders before anything was chosen", () => {
    expect(savedAutomationOrders()).toEqual([]);
  });

  it("carries automated areas and strategies into the next game", () => {
    const first = GameSession.create(opts, 0);
    first.issue({ type: "setAutomation", domains: ["jobs", "research"] });
    first.issue({ type: "setAutomationStrategy", domain: "jobs", strategy: "research" });

    const next = GameSession.create({ ...opts, seed: "prefs-2" }, 0);
    next.issue(...savedAutomationOrders());
    expect(next.view.players[0]!.automation).toEqual(["jobs", "research"]);
    expect(next.view.players[0]!.automationStrategies).toEqual({ jobs: "research" });

    next.issue({ type: "setAutomation", domains: [] }, { type: "setAutomationStrategy", domain: "jobs", strategy: "balanced" });
    expect(savedAutomationOrders()).toEqual([]);
  });

  it("ignores unknown areas and strategies", () => {
    localStorage.setItem("starlord.automation", JSON.stringify({ domains: ["jobs", "bogus"], strategies: { jobs: "nope", military: "defensive" } }));
    expect(savedAutomationOrders()).toEqual([
      { type: "setAutomation", domains: ["jobs"] },
      { type: "setAutomationStrategy", domain: "military", strategy: "defensive" },
    ]);
  });
});
