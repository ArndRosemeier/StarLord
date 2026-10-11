import { describe, expect, it } from "vitest";
import { RACES, relation } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { VOICES, speak, type Moment } from "../src/diplomacy/voices";

const opts = { seed: "audience", galaxySize: "small" as const, races: ["terran", "kordex", "zhrikk"] };

function metSession(): GameSession {
  const s = GameSession.create(opts, 0);
  s.state.players[0]!.contacts = [1];
  s.state.players[1]!.contacts = [0];
  s.state.attitude[1] = { 0: 30 };
  s.clearOrders();
  return s;
}

describe("audiences", () => {
  it("a computer empire answers at once and the deal holds when the turn ends", () => {
    const s = metSession();
    const answer = s.audience({ type: "propose", to: 1, kind: "trade" });
    expect(answer).toBe(true);
    expect(relation(s.view, 0, 1).trade).toBe(true);
    s.endTurn();
    expect(relation(s.state, 0, 1).trade).toBe(true);
  });

  it("a refusal is final for the turn and nothing is signed", () => {
    const s = metSession();
    s.state.attitude[1] = { 0: -90 };
    s.clearOrders();
    expect(s.audience({ type: "propose", to: 1, kind: "nonAggression" })).toBe(false);
    s.endTurn();
    expect(relation(s.state, 0, 1).status).not.toBe("nonAggression");
  });

  // Regression: right after first contact every treaty used to be accepted at once.
  it("at first contact most rulers turn most treaties down", () => {
    let asked = 0;
    let yes = 0;
    for (let i = 0; i < 20; i++) {
      // Kordex proposers have no charisma or telepathy to help them.
      const s = GameSession.create({ ...opts, races: ["kordex", "terran", "zhrikk"], seed: `contact${i}` }, 0);
      s.state.players[0]!.contacts = [1];
      s.state.players[1]!.contacts = [0];
      s.state.attitude[1] = { 0: 0 };
      s.clearOrders();
      for (const kind of ["nonAggression", "trade", "research"] as const) {
        const a = s.audience({ type: "propose", to: 1, kind });
        if (a === null) continue;
        asked++;
        if (a) yes++;
      }
      expect(s.audience({ type: "propose", to: 1, kind: "alliance" })).toBeNull();
    }
    expect(asked).toBeGreaterThan(40);
    expect(yes / asked).toBeLessThan(0.5);
    expect(yes).toBeGreaterThan(0);
  });

  it("every built-in race has its own voice for every moment", () => {
    const moments = Object.keys(VOICES.terran!) as Moment[];
    for (const race of RACES) {
      const voice = VOICES[race.id];
      expect(voice, race.id).toBeDefined();
      for (const m of moments) expect(voice![m]?.length ?? 0, `${race.id} ${m}`).toBeGreaterThan(0);
    }
    expect(speak("terran", "greet", 3, { you: "Kordex", us: "Terrans" })).not.toMatch(/[{}]/);
  });
});

describe("diplomatic effects", () => {
  it("spells out treaties with the sim's numbers", async () => {
    const { proposalEffect, warEffect, activeEffects } = await import("../src/diplomacy/effects");
    const s = metSession();
    expect(proposalEffect(s.view, 0, 1, "alliance")).toMatch(/refuel/);
    expect(proposalEffect(s.view, 0, 1, "trade")).toMatch(/0\.25 per population/);
    expect(warEffect(s.view, 0, 1)).toMatch(/fight on sight/);
    s.audience({ type: "propose", to: 1, kind: "trade" });
    expect(activeEffects(s.view, 0, 1).map((e) => e.label)).toContain("Trade");
  });
});
