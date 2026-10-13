import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newGame, processTurn, type GameState } from "@starlord/sim";
import { GameSession } from "../src/game/session";
import { SessionContext } from "../src/ui/hooks";
import { CouncilBallot, CouncilResult, castBallot, mayCastCouncilVote } from "../src/screens/CouncilPopup";

/** Turn 25, every system settled by empire 0, the human in seat 2: the council is called this turn. */
function called(): GameState {
  let s = newGame({ seed: "council-ui", races: ["terran", "felhari", "kordex"], monsters: false, raiders: false, randomEvents: false, humanPlayers: [2] });
  for (const p of s.players) if (p.kind === "empire") p.contacts = s.players.filter((q) => q.kind === "empire" && q.id !== p.id).map((q) => q.id);
  s.turn = 25;
  for (const star of s.galaxy.stars) {
    const pid = star.planetIds.find((id) => !s.planets[id]!.colonyId);
    if (!pid) continue;
    const id = `c${s.nextId++}`;
    const src = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    s.colonies[id] = { ...structuredClone(src), id, planetId: pid, name: id, buildings: [], queue: [], progress: 0 };
    s.planets[pid]!.colonyId = id;
  }
  s = processTurn(s, {});
  return s;
}

const render = (session: GameSession, el: JSX.Element) => renderToStaticMarkup(<SessionContext.Provider value={session}>{el}</SessionContext.Provider>);

describe("galactic council windows", () => {
  it("asks the human for their votes and counts the ballot", () => {
    const session = new GameSession(called(), 2);
    expect(mayCastCouncilVote(session.view, 2)).toBe(true);
    const html = render(session, <CouncilBallot />);
    expect(html).toContain("Vote for");
    expect(html).toContain("Abstain");
    expect(html).toMatch(/needs <b>\d+<\/b>, two thirds/);
    session.issue({ type: "castCouncilVote", vote: 1 });
    expect(castBallot(session)).toBe(1);
    const after = new GameSession(processTurn(session.state, { 2: session.pending }), 2);
    const r = after.state.council.lastResult!;
    expect(r.ballots![2]).toBe(1);
    const result = render(after, <CouncilResult />);
    expect(result).toContain("(candidate)");
    expect(result).toMatch(/two thirds\) needed/);
  });

  it("tells a candidate their votes go to themselves", () => {
    const session = new GameSession(called(), 0);
    expect(mayCastCouncilVote(session.view, 0)).toBe(false);
    expect(render(session, <CouncilBallot />)).toContain("You stand");
  });
});
