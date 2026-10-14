import { describe, expect, it } from "vitest";
import { newGame, raceShipStyle } from "@starlord/sim";
import { endingFor, previewEnding } from "../src/ending/endings";

const game = () => newGame({ seed: "endings", galaxySize: "small", races: ["terran", "kordex", "felhari"] });

describe("end sequences", () => {
  it("plays nothing while the game runs and the player's empire stands", () => {
    expect(endingFor(game(), 0)).toBeNull();
  });

  it("plays each victory path for the winner and for spectators, starring the winner", () => {
    for (const how of ["conquest", "council", "raiders", "score"] as const) {
      const s = game();
      s.over = true;
      s.winner = 1;
      s.victory = how;
      const mine = endingFor(s, 1)!;
      expect(mine.won).toBe(true);
      expect(mine.spec.kind).toBe(how);
      expect(mine.spec.hero.color).toBe(s.players[1]!.color);
      expect(mine.spec.hero.style).toBe(raceShipStyle("kordex"));
      const watched = endingFor(s, null)!;
      expect(watched.won).toBe(false);
      expect(watched.spec.kind).toBe(how);
    }
  });

  it("shows the losers a defeat over their own homeworld, with the winner's fleet", () => {
    const s = game();
    s.over = true;
    s.winner = 2;
    s.victory = "conquest";
    const e = endingFor(s, 0)!;
    expect(e.won).toBe(false);
    expect(e.spec.kind).toBe("defeat");
    expect(e.spec.hero.color).toBe(s.players[0]!.color);
    expect(e.spec.foe!.color).toBe(s.players[2]!.color);
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    expect(e.spec.hero.planet).toBe(s.planets[home.planetId]!.type);
  });

  it("names the council vote in the caption", () => {
    const s = game();
    s.over = true;
    s.winner = 0;
    s.victory = "council";
    s.council.lastResult = { turn: 80, candidates: [0, 1], votes: { 0: 14, 1: 5 }, winner: 0, total: 21, needed: 14, weights: {}, ballots: {} } as never;
    const e = endingFor(s, 0)!;
    expect(e.text.lines.join(" ")).toContain("14 of 21 votes, 14 needed to win");
    // Envoys come from the surviving rivals only.
    s.players[2]!.alive = false;
    expect(endingFor(s, 0)!.spec.others).toHaveLength(1);
  });

  it("gives an eliminated player a defeat while the others play on, naming who struck the last blow", () => {
    const s = game();
    s.players[0]!.alive = false;
    s.players[0]!.eliminatedTurn = 42;
    s.players[2]!.eliminated = [0];
    const e = endingFor(s, 0)!;
    expect(e.spec.kind).toBe("defeat");
    expect(e.spec.foe!.color).toBe(s.players[2]!.color);
    expect(e.text.title).toBe("Your empire has fallen");
    expect(e.text.lines[0]).toContain("turn 42");
  });

  it("previews any ending starring the player", () => {
    const s = game();
    for (const kind of ["conquest", "council", "raiders", "score", "defeat"] as const) {
      const e = previewEnding(s, 0, kind);
      expect(e.spec.kind).toBe(kind);
      expect(e.spec.hero.color).toBe(s.players[0]!.color);
    }
  });
});
