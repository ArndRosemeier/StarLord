import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEW_GAME_DEFAULTS, loadNewGamePrefs, saveNewGamePrefs } from "../src/game/newGamePrefs";

describe("new game options", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts with the defaults when nothing was saved", () => {
    expect(loadNewGamePrefs()).toEqual(NEW_GAME_DEFAULTS);
  });

  it("brings back the last game's options", () => {
    const last = {
      ...NEW_GAME_DEFAULTS, raceId: "custom-x", opponents: 6, galaxy: "huge" as const, galaxyAge: "old" as const, difficulty: "impossible" as const,
      techLevel: "preWarp" as const, turnLimit: true, maxTurns: 250, monsters: false, raiders: false, council: false, randomEvents: false, shipInitiative: true,
    };
    saveNewGamePrefs(last);
    expect(loadNewGamePrefs()).toEqual(last);
  });

  it("falls back to the default for values that are no longer valid", () => {
    store.set("starlord.newGame", JSON.stringify({ galaxy: "gigantic", opponents: 12, difficulty: "hard", maxTurns: "x", council: "yes" }));
    expect(loadNewGamePrefs()).toEqual({ ...NEW_GAME_DEFAULTS, difficulty: "hard" });
    store.set("starlord.newGame", "{broken");
    expect(loadNewGamePrefs()).toEqual(NEW_GAME_DEFAULTS);
  });
});
