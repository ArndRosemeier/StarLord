import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { HEROES, HERO_SKILLS, LEADER_RULES, abilityValue, administratorGain, heroLeaderId, newGame, refreshLeaders, type GameState } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { SessionContext } from "../src/ui/hooks";
import { HERO_INTROS } from "../src/leaders/intros";
import { LeaderOfferPopup, newLeaderOffers } from "../src/screens/LeaderOfferPopup";
import { leaderPortraitUrl } from "../src/ui/panels";

function offered(heroName: string): { state: GameState; id: string } {
  const state = newGame({ seed: "intro", races: ["terran", "felhari"], humanPlayers: [0] });
  const id = heroLeaderId(HEROES.findIndex((h) => h.name === heroName));
  const l = state.leaders[id]!;
  l.status = "offered";
  l.offeredTo = 0;
  l.availableUntil = state.turn + LEADER_RULES.queueTurns;
  refreshLeaders(state);
  return { state, id };
}

function render(state: GameState, id: string): string {
  const session = new GameSession(state, 0);
  return renderToStaticMarkup(
    <SessionContext.Provider value={session}>
      <LeaderOfferPopup leaderId={id} onClose={() => {}} onLeaders={() => {}} />
    </SessionContext.Provider>,
  );
}

describe("leader introduction", () => {
  it("has a greeting of their own for every hero", () => {
    for (const h of HEROES) expect(HERO_INTROS[h.name], h.name).toBeTruthy();
  });

  it("gives every hero a portrait of their own", () => {
    const urls = HEROES.map((_, i) => leaderPortraitUrl(i));
    expect(new Set(urls).size).toBe(HEROES.length);
    for (const [i, url] of urls.entries()) expect(existsSync(join(__dirname, "../../../public", url)), HEROES[i]!.name).toBe(true);
  });

  it("opens only for last turn's offers that still wait for an answer", () => {
    const { state, id } = offered("Iselle Marr");
    const other = heroLeaderId(0);
    const events = [
      { turn: 1, kind: "leader" as const, playerId: 0, leaderId: id, what: "offers", offer: true as const },
      { turn: 1, kind: "leader" as const, playerId: 0, leaderId: other, what: "offers", offer: true as const },
      { turn: 1, kind: "leader" as const, playerId: 0, leaderId: id, what: "reached level 2" },
    ];
    // Hero 0 was not left waiting (already hired elsewhere, say), so only one introduction.
    expect(newLeaderOffers(events, state as never, 0)).toEqual([id]);
    expect(newLeaderOffers(events, state as never, 1)).toEqual([]);
  });

  it("introduces the hero with their skills, real numbers and the terms", () => {
    const { state, id } = offered("Iselle Marr");
    const l = state.leaders[id]!;
    const html = render(state, id);
    expect(html).toContain("Iselle Marr");
    expect(html).toContain(HERO_INTROS["Iselle Marr"]!.replace(/'/g, "&#x27;"));
    const a = l.abilities[0]!;
    expect(html).toContain(HERO_SKILLS[a.skill].text.replace("{v}", String(abilityValue(a, l.level))));
    expect(html).toContain(`Hire for ${l.hireCost} BC`);
    expect(html).toContain(`until turn ${l.availableUntil}`);
    // A science leader at the home system would raise its research right now.
    const home = state.planets[Object.values(state.colonies).find((c) => c.ownerId === 0)!.planetId]!.starId;
    const gain = administratorGain(state, 0, home, l.skills);
    expect(gain.research).toBeGreaterThan(0);
    expect(html).toContain("Governing");
    expect(html).toContain("research per turn");
  });

  it("explains why hiring is not possible", () => {
    const { state, id } = offered("Tavik Orrun");
    state.players[0]!.bc = 0;
    expect(render(state, id)).toContain("BC more");
  });
});
