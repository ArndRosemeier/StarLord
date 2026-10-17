import { describe, expect, it } from "vitest";
import {
  blockadeLoss, blockadersOf, colonyOutput, computeBlockades, newGame, playerView, processTurn,
  type Colony, type Fleet, type GameState,
} from "@starlord/sim";

/** Player 0 and player 1 at war; player 0 has a fleet of `designId` in orbit at player 1's home. */
function setup(designId = "scout", monsters = false) {
  const s = newGame({ seed: "blockade", races: ["lysari", "felhari"], monsters, raiders: false, council: false, randomEvents: false });
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  const home = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
  const starId = s.planets[home.planetId]!.starId;
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `b${s.nextId++}`, ownerId: 0, x: star.x, y: star.y, starId, destStarId: null, ships: [{ designId, count: 1 }], stance: "attack", name: "Blockaders" };
  s.fleets[f.id] = f;
  return { s, home, starId, f };
}

const run = (s: GameState) => processTurn(s, {});
const homeOf = (s: GameState, id: string): Colony => s.colonies[id]!;

describe("blockades as in the original (FUN_000e507b)", () => {
  it("are set by any warship at war in orbit, even an unarmed scout", () => {
    const { s, home } = setup("scout");
    expect(blockadersOf(s, home, computeBlockades(s))).toEqual([0]);
  });

  it("need a war: no blockade without one", () => {
    const { s, home } = setup("scout");
    s.relations["0-1"] = { status: "none", trade: false, research: false, since: 1 };
    expect(blockadersOf(s, home, computeBlockades(s))).toEqual([]);
  });

  it("are not set by colony, outpost or troop ships", () => {
    for (const designId of ["colonyShip", "outpostShip", "transport"]) {
      const { s, home } = setup(designId);
      expect(blockadersOf(s, home, computeBlockades(s))).toEqual([]);
    }
  });

  it("are not lifted by the owner's own warships in the system", () => {
    const { s, home } = setup("scout");
    const own = Object.values(s.fleets).find((f) => f.ownerId === 1 && f.ships.some((x) => x.designId === "scout"))!;
    own.starId = s.planets[home.planetId]!.starId;
    expect(blockadersOf(s, home, computeBlockades(s))).toEqual([0]);
  });

  it("start counting for production at the end of the turn and say so", () => {
    const { s, home } = setup("scout");
    // The fleet only just arrived: this turn's production is untouched.
    expect(colonyOutput(s, home).blockaded).toBe(false);
    const next = run(s);
    const h = homeOf(next, home.id);
    expect(colonyOutput(next, h).blockaded).toBe(true);
    expect(next.events.some((e) => e.kind === "blockade" && e.playerId === 1 && e.victim === 1 && e.by.includes(0))).toBe(true);
    expect(next.events.some((e) => e.kind === "blockade" && e.playerId === 0 && e.victim === 1)).toBe(true);
    // Only farmers' and workers' output is halved.
    const loss = blockadeLoss(next, h);
    expect(loss.food + loss.industry).toBeGreaterThan(0);
    expect(colonyOutput(next, h).research).toBe(colonyOutput({ ...next, blockades: {} }, h).research);
    // The blockaded empire and the blockader see it; nobody else would.
    expect(playerView(next, 1).blockades).toEqual(next.blockades);
    expect(playerView(next, 0).blockades).toEqual(next.blockades);
  });

  it("end once the warships leave, with a report", () => {
    const { s, home, f } = setup("scout");
    const next = run(s);
    delete next.fleets[f.id];
    const after = run(next);
    expect(colonyOutput(after, homeOf(after, home.id)).blockaded).toBe(false);
    expect(after.events.some((e) => e.kind === "blockade" && e.playerId === 1 && e.lifted)).toBe(true);
  });

  it("lose colonists freighted into a blockaded system", () => {
    const { s, home } = setup("scout");
    const from = { ...structuredClone(home), id: "other", planetId: Object.keys(s.planets).find((id) => !s.planets[id]!.colonyId)!, name: "Other" };
    s.colonies[from.id] = from;
    s.planets[from.planetId]!.colonyId = from.id;
    s.players[1]!.transfers = [{ fromColonyId: from.id, toColonyId: home.id, raceId: home.raceId, count: 1, arrives: s.turn }];
    const before = home.farmers + home.workers + home.scientists;
    const next = run(s);
    const h = homeOf(next, home.id);
    expect(h.farmers + h.workers + h.scientists).toBeLessThanOrEqual(before);
    expect(next.events.some((e) => e.kind === "random" && e.playerId === 1 && /blockaded/.test(e.what))).toBe(true);
  });

  it("are set by monsters at every empire's colonies", () => {
    const { s, home, f } = setup("scout", true);
    s.relations["0-1"] = { status: "none", trade: false, research: false, since: 1 };
    const monsters = s.players.find((p) => p.kind === "monsters");
    expect(monsters).toBeDefined();
    const d = monsters!.designs[0]!;
    f.ownerId = monsters!.id;
    f.ships = [{ designId: d.id, count: 1 }];
    expect(blockadersOf(s, home, computeBlockades(s))).toEqual([monsters!.id]);
  });

  it("never count ships of an empire not at war, even when peace comes after the blockade was set", () => {
    const { s, home } = setup("scout");
    const next = run(s);
    const h = homeOf(next, home.id);
    expect(colonyOutput(next, h).blockaded).toBe(true);
    next.relations["0-1"] = { status: "peace", trade: false, research: false, since: next.turn };
    expect(blockadersOf(next, h)).toEqual([]);
    expect(colonyOutput(next, h).blockaded).toBe(false);
    expect(colonyOutput(playerView(next, 1), h).blockaded).toBe(false);
    const after = run(next);
    expect(after.blockades?.[next.planets[h.planetId]!.starId]).toBeUndefined();
  });
});
