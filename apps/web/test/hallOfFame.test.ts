import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HALL_OF_FAME_SIZE, newGame, score } from "@starlord/sim";
import { enterHallOfFame, hallEntryFor, loadHallOfFame, type HallEntry } from "../src/game/hallOfFame";

const entry = (id: string, s: number): HallEntry => ({
  id, empire: "Test", race: "Testers", score: s, won: true, victory: "conquest", turn: 100,
  difficulty: "average", galaxySize: "small", date: "2026-01-01T00:00:00.000Z",
});

describe("hall of fame", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps only the best scores, best first, and each game once", () => {
    for (let i = 0; i < HALL_OF_FAME_SIZE + 3; i++) enterHallOfFame(entry(`g${i}`, i * 10));
    const list = loadHallOfFame();
    expect(list).toHaveLength(HALL_OF_FAME_SIZE);
    expect(list[0]!.score).toBe((HALL_OF_FAME_SIZE + 2) * 10);
    expect(enterHallOfFame(entry("low", -5)).place).toBeNull();
    const again = enterHallOfFame({ ...entry("g12", 999) });
    expect(again.place).toBe(0);
    expect(loadHallOfFame()[0]!.score).toBe(120);
  });

  it("enters only finished games without the debug menu", () => {
    const s = newGame({ seed: "hof", galaxySize: "small", races: ["terran", "kordex"] });
    expect(hallEntryFor(s, 0, new Date())).toBeNull();
    s.over = true;
    s.winner = 0;
    s.victory = "conquest";
    const e = hallEntryFor(s, 0, new Date("2026-02-03T00:00:00Z"))!;
    expect(e.score).toBe(score(s, 0));
    expect(e.won).toBe(true);
    s.settings.debug = true;
    expect(hallEntryFor(s, 0, new Date())).toBeNull();
  });
});
