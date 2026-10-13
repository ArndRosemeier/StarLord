import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameSession } from "../src/game/session";
import { AUTOSAVES_KEPT, latestSave, listSaves, readSave, writeAutosave, writeSave } from "../src/game/saves";
import { autosave } from "../src/game/autosave";
import { getPrefs, resetPrefsCache, updatePrefs } from "../src/game/prefs";
import { isTyping, shortcutFor } from "../src/ui/shortcuts";

const opts = { seed: "autosave", galaxySize: "small" as const, races: ["terran", "kordex"] };

let store: Map<string, string>;
let limit = Infinity;

function quotaError(): Error {
  const e = new Error("quota");
  e.name = "QuotaExceededError";
  return e;
}

describe("autosave", () => {
  beforeEach(() => {
    store = new Map();
    limit = Infinity;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        const used = [...store].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0);
        if (used + v.length > limit) throw quotaError();
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
    });
    resetPrefsCache();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps only the newest autosaves and never touches manual saves", () => {
    const session = GameSession.create(opts, 0);
    writeSave("Mine", session.toJSON());
    for (let i = 0; i < AUTOSAVES_KEPT + 2; i++) {
      session.endTurn({ commandBattles: false });
      expect(writeAutosave(session.toJSON()).ok).toBe(true);
    }
    const autos = listSaves().filter((s) => s.auto);
    expect(autos).toHaveLength(AUTOSAVES_KEPT);
    expect(autos.map((s) => s.turn)).toContain(session.state.turn);
    expect(listSaves().some((s) => s.name === "Mine" && !s.auto)).toBe(true);
    // Only the kept saves are left in storage.
    expect([...store.keys()].filter((k) => k.startsWith("starlord.save.")).length).toBe(AUTOSAVES_KEPT + 1);
    expect(latestSave()?.turn).toBe(session.state.turn);
    const loaded = GameSession.fromJSON(readSave(latestSave()!.name));
    expect(loaded.state.turn).toBe(session.state.turn);
  });

  it("frees room by dropping older autosaves when storage is full, and reports when even that is not enough", () => {
    const session = GameSession.create(opts, 0);
    const size = JSON.stringify(session.toJSON()).length;
    expect(writeAutosave(session.toJSON()).ok).toBe(true);
    session.endTurn({ commandBattles: false });
    // Room for one save and its index only.
    limit = size * 1.5;
    const second = writeAutosave(session.toJSON());
    expect(second.ok).toBe(true);
    expect(listSaves().filter((s) => s.auto).map((s) => s.turn)).toEqual([session.state.turn]);

    limit = 10;
    session.endTurn({ commandBattles: false });
    const third = writeAutosave(session.toJSON());
    expect(third).toEqual({ ok: false, reason: "browser storage is full" });
  });

  it("follows the setting and skips spectators", () => {
    expect(getPrefs().autosave).toBe(true);
    updatePrefs({ autosave: false });
    expect(autosave(GameSession.create(opts, 0))).toBeNull();
    resetPrefsCache();
    expect(getPrefs().autosave).toBe(false);
    updatePrefs({ autosave: true });
    expect(autosave(GameSession.create(opts, null))).toBeNull();
    expect(autosave(GameSession.create(opts, 0))?.ok).toBe(true);
  });

  it("ignores bad stored settings", () => {
    localStorage.setItem("starlord.prefs", JSON.stringify({ autosave: "yes", replaySpeed: 7, mapFlashes: "sparkle" }));
    resetPrefsCache();
    expect(getPrefs()).toEqual({ autosave: true, replaySpeed: 1, mapFlashes: "burst" });
  });
});

describe("shortcuts", () => {
  const key = (k: string, target: unknown = null, mods: Partial<KeyboardEvent> = {}) =>
    shortcutFor({ key: k, ctrlKey: false, altKey: false, metaKey: false, target: target as EventTarget, ...mods });

  it("maps letters to screens and map cycling", () => {
    expect(key("c")?.action).toEqual({ kind: "tab", tab: "colonies" });
    expect(key("C")?.action).toEqual({ kind: "tab", tab: "colonies" });
    expect(key("n")?.action).toEqual({ kind: "nextIdleFleet" });
    expect(key(".")?.action).toEqual({ kind: "nextColony" });
    expect(key("c", null, { ctrlKey: true })).toBeUndefined();
  });

  it("stays quiet while typing", () => {
    expect(isTyping({ tagName: "INPUT", type: "text" } as unknown as EventTarget)).toBe(true);
    expect(isTyping({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTyping({ tagName: "INPUT", type: "checkbox" } as unknown as EventTarget)).toBe(false);
    expect(key("c", { tagName: "INPUT", type: "text" })).toBeUndefined();
    expect(key("c", { tagName: "BUTTON" })?.action.kind).toBe("tab");
  });
});
