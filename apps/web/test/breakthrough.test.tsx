import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newGame, TECHS, type GameEvent } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { SessionContext } from "../src/ui/hooks";
import { BREAKTHROUGH_LOOKS, BreakthroughPopup, breakthroughNews, breakthroughSeed } from "../src/screens/BreakthroughPopup";

const learned = (techId: string, tierId: string, source?: "research" | "stolen" | "trade", playerId = 0): GameEvent =>
  ({ turn: 5, kind: "techLearned", playerId, techId, tierId, source });

describe("research breakthrough popup", () => {
  it("groups last turn's research by field and lists other gains in passing", () => {
    const news = breakthroughNews([
      learned("colonyBase", "engineering", "research"),
      learned("marineBarracks", "engineering", "research"),
      learned("starBase", "engineering", "research", 1),
      learned("fighterBays", "advancedEngineering", "stolen"),
      { turn: 5, kind: "hyperAdvance", playerId: 0, field: "physics", level: 2 },
    ], 0)!;
    expect(news.breakthroughs).toEqual([
      { kind: "tier", tierId: "engineering", field: "construction", techIds: ["colonyBase", "marineBarracks"] },
      { kind: "hyper", field: "physics", level: 2 },
    ]);
    expect(news.alsoGained).toEqual([{ techId: "fighterBays", how: "stolen by our spies" }]);
  });

  it("does not open for techs that only came from spies or treaties", () => {
    expect(breakthroughNews([learned("fighterBays", "advancedEngineering", "trade")], 0)).toBeNull();
    expect(breakthroughNews([], 0)).toBeNull();
  });

  it("varies its look between breakthroughs", () => {
    const looks = new Set<number>();
    for (let turn = 1; turn < 40; turn++) {
      looks.add(breakthroughSeed(turn, breakthroughNews([learned("colonyBase", "engineering")], 0)!) % BREAKTHROUGH_LOOKS);
    }
    expect(looks.size).toBe(BREAKTHROUGH_LOOKS);
  });

  it("shows what the new tech does and the button to choose the next field", () => {
    const session = new GameSession(newGame({ seed: "bt", races: ["terran", "felhari"], humanPlayers: [0] }), 0);
    const news = breakthroughNews([learned("starBase", "engineering")], 0)!;
    const html = renderToStaticMarkup(
      <SessionContext.Provider value={session}>
        <BreakthroughPopup news={news} onClose={() => {}} nextLabel="Choose the next research" />
      </SessionContext.Provider>,
    );
    expect(html).toContain(TECHS.starBase!.name);
    expect(html).toContain("Engineering");
    expect(html).toContain("Choose the next research");
    expect(html).toMatch(/bt-look-\d/);
  });
});
