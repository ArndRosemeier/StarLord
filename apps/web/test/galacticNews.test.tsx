import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newGame, type GameEvent } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { SessionContext } from "../src/ui/hooks";
import { NewsPopup, newsOf } from "../src/screens/NewsPopup";

const handed = { colonies: 3, population: 17, ships: 9, techs: 4, bc: 250, freighters: 2, spies: 6 };

function render(news: ReturnType<typeof newsOf>, me = 0) {
  const session = new GameSession(newGame({ seed: "gnn", races: ["terran", "felhari", "kordex"], humanPlayers: [me] }), me);
  return renderToStaticMarkup(
    <SessionContext.Provider value={session}>
      <NewsPopup news={news} onClose={() => {}} onShowStar={() => {}} />
    </SessionContext.Provider>,
  );
}

describe("Galactic News front page", () => {
  it("puts an empire's fall before the random events", () => {
    const events: GameEvent[] = [
      { turn: 9, kind: "random", playerId: 0, what: "A comet passes." },
      { turn: 9, kind: "empireFell", playerId: 0, fallen: 1, how: "destroyed", by: 2 },
    ];
    expect(newsOf(events).map((e) => e.kind)).toEqual(["empireFell", "random"]);
  });

  it("a surrender shows both rulers, the headline and what passed over in numbers", () => {
    const html = render([{ turn: 9, kind: "empireFell", playerId: 0, fallen: 1, how: "surrendered", to: 2, handed }]);
    expect(html).toContain("Empire surrenders");
    expect(html.match(/news-front-envoy/g)?.length).toBe(2);
    expect(html).toMatch(/surrender/i);
    expect(html).toContain("3 colonies (17 pop), 9 ships, 4 new technologies, 250 BC, 2 freighters, 6 spies");
  });

  it("a destruction names who is credited and how many empires are left", () => {
    const html = render([{ turn: 9, kind: "empireFell", playerId: 0, fallen: 1, how: "destroyed", by: 0 }]);
    expect(html).toContain("Empire destroyed");
    expect(html).toContain("Your empire is credited with their destruction.");
    expect(html).toMatch(/\d empires remain in the galaxy/);
  });
});
