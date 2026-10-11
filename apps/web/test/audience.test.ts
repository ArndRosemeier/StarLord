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
    s.state.attitude[1] = { 0: -60 };
    s.clearOrders();
    expect(s.audience({ type: "propose", to: 1, kind: "alliance" })).toBe(false);
    s.endTurn();
    expect(relation(s.state, 0, 1).status).not.toBe("alliance");
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
