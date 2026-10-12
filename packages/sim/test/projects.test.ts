import { describe, expect, it } from "vitest";
import { FREIGHTERS, newGame, processTurn, type Colony, type GameState } from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

/** A fresh game where the first empire knows every project tech and can buy anything. */
function setup(): { s: GameState; home: Colony } {
  const s = newGame({ seed: "projects", playerCount: 2, ...quiet });
  const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
  s.players[0]!.techs.push("freighters", "terraforming", "gaiaTransformation", "dimensionalPortal");
  s.players[0]!.bc = 50000;
  return { s, home };
}

/** Queues a project at the home colony and buys it, so it finishes this turn. */
function buildNow(s: GameState, home: Colony, id: string): GameState {
  return processTurn(s, {
    0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "project", id }] }, { type: "buy", colonyId: home.id }],
  });
}

const built = (s: GameState, id: string) => s.events.some((e) => e.kind === "built" && e.playerId === 0 && e.item.kind === "project" && e.item.id === id);

describe("finished projects take effect", () => {
  it("a Freighter Fleet adds freighters", () => {
    const { s: s0, home } = setup();
    const before = s0.players[0]!.freighters ?? 0;
    const s = buildNow(s0, home, "freighterFleet");
    expect(built(s, "freighterFleet")).toBe(true);
    expect(s.players[0]!.freighters).toBe(before + FREIGHTERS.perFleet);
  });

  it("Terraforming improves the climate one step and raises the next cost", () => {
    const { s: s0, home } = setup();
    s0.planets[home.planetId]!.type = "arid";
    const s = buildNow(s0, home, "terraform");
    expect(built(s, "terraform")).toBe(true);
    expect(s.planets[home.planetId]!.type).toBe("terran");
    expect(s.colonies[home.id]!.terraformed).toBe(1);
  });

  it("Gaia Transformation turns a terran world into Gaia", () => {
    const { s: s0, home } = setup();
    s0.planets[home.planetId]!.type = "terran";
    const s = buildNow(s0, home, "gaiaTransform");
    expect(built(s, "gaiaTransform")).toBe(true);
    expect(s.planets[home.planetId]!.type).toBe("gaia");
  });

  it("a spy joins the home pool", () => {
    const { s: s0, home } = setup();
    const before = s0.players[0]!.spies.home;
    const s = buildNow(s0, home, "spy");
    expect(s.players[0]!.spies.home).toBe(before + 1);
  });

  it("a Dimensional Portal opens the portal", () => {
    const { s: s0, home } = setup();
    const s = buildNow(s0, home, "dimensionalPortal");
    expect(built(s, "dimensionalPortal")).toBe(true);
    expect(s.colonies[home.id]!.portal).toBe(true);
    expect(s.players[0]!.hasPortal).toBe(true);
  });
});
