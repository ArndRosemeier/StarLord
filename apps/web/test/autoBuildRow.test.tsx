import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newGame } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { SessionContext } from "../src/ui/hooks";
import { ColonyDetail } from "../src/screens/ColoniesScreen";

describe("auto build on the production screen", () => {
  it("offers Auto build, and shows its strategy and next pick once queued", () => {
    const s = newGame({ seed: "auto-row", playerCount: 2, monsters: false, raiders: false, humanPlayers: [0] });
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    const render = () => {
      const session = new GameSession(s, 0);
      return renderToStaticMarkup(<SessionContext.Provider value={session}><ColonyDetail colony={session.view.colonies[home.id]!} /></SessionContext.Provider>);
    };
    expect(render()).toContain("Auto build");
    s.colonies[home.id]!.queue = [{ kind: "auto", strategy: "industry" }];
    const html = render();
    expect(html).toContain("Auto build strategy");
    expect(html).toMatch(/Puts .+ in front of itself|Idle:/);
  });
});
