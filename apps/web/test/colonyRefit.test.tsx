import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newGame } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { SessionContext } from "../src/ui/hooks";
import { ColonyDetail } from "../src/screens/ColoniesScreen";

describe("refit on the production screen", () => {
  it("offers a Refit button on any colony in a system holding your ships", () => {
    const s = newGame({ seed: "colony-refit", playerCount: 2, monsters: false, raiders: false, humanPlayers: [0] });
    const session = new GameSession(s, 0);
    const home = Object.values(session.view.colonies).find((c) => c.ownerId === 0)!;
    const html = renderToStaticMarkup(<SessionContext.Provider value={session}><ColonyDetail colony={home} /></SessionContext.Provider>);
    expect(html).toContain("Refit ships in orbit");
    // Away from your fleets there is nothing to refit.
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0) f.starId = "nowhere";
    const away = renderToStaticMarkup(<SessionContext.Provider value={new GameSession(s, 0)}><ColonyDetail colony={home} /></SessionContext.Provider>);
    expect(away).not.toContain("Refit ships in orbit");
  });
});
