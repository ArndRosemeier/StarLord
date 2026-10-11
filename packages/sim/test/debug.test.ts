import { describe, expect, it } from "vitest";
import {
  TECH_TIERS, availableBuildings, newGame, population, previewOrders, processTurn, validateCommand, type Command, type DebugAction, type GameState,
} from "@starlord/sim";

function game(debug = true): GameState {
  return newGame({ seed: "dbg", races: ["terran", "felhari", "gorvath"], monsters: false, council: false, humanPlayers: [0], debug });
}

const cmd = (action: DebugAction): Command => ({ type: "debug", action });
const home = (s: GameState) => Object.values(s.colonies).find((c) => c.ownerId === 0 && s.planets[c.planetId]!.starId === s.players[0]!.homeStarId)!;

describe("debug menu commands", () => {
  it("are refused unless the game was started in debug mode", () => {
    const s = game(false);
    expect(validateCommand(s, 0, cmd({ kind: "addBc", amount: 100 }))).toEqual({ ok: false, reason: "debug mode is off" });
    expect(validateCommand(game(), 0, cmd({ kind: "addBc", amount: 100 })).ok).toBe(true);
  });

  it("unlock the whole research tree", () => {
    const { state } = previewOrders(game(), 0, [cmd({ kind: "unlockTechs" })]);
    const p = state.players[0]!;
    for (const t of TECH_TIERS.filter((x) => !x.hyper)) {
      expect(p.tiers).toContain(t.id);
      for (const app of t.techs) expect(p.techs).toContain(app);
    }
  });

  it("add BC, reveal the map and meet every empire", () => {
    const s = game();
    expect(previewOrders(s, 0, [cmd({ kind: "addBc", amount: 1000 })]).state.players[0]!.bc).toBe(s.players[0]!.bc + 1000);
    // Exploring can turn up caches, so the treasury is checked first.
    const { state } = previewOrders(s, 0, [cmd({ kind: "revealMap" }), cmd({ kind: "meetAll" })]);
    const p = state.players[0]!;
    expect(p.explored.length).toBe(state.galaxy.stars.filter((x) => x.special !== "raiderHome").length);
    expect(p.contacts.sort()).toEqual([1, 2]);
  });

  it("finish builds and research at the end of the turn", () => {
    const s = game();
    const c = home(s);
    // An average start has every building its six fields allow; learn one more to build.
    s.players[0]!.techs.push("hydroponicFarm");
    const tier = TECH_TIERS.find((t) => !s.players[0]!.tiers.includes(t.id) && t.prev && s.players[0]!.tiers.includes(t.prev))!;
    const before = c.buildings.length;
    const next = processTurn(s, {
      0: [
        { type: "setQueue", colonyId: c.id, queue: [{ kind: "building", id: availableBuildings(s, 0, c)[0]! }] },
        { type: "setResearch", tierId: tier.id },
        cmd({ kind: "finishBuilds" }),
        cmd({ kind: "finishResearch" }),
      ],
    });
    expect(next.colonies[c.id]!.buildings.length).toBe(before + 1);
    expect(next.players[0]!.tiers).toContain(tier.id);
  });

  it("spawn ships and set a colony's population", () => {
    const s = game();
    const c = home(s);
    const design = s.players[0]!.designs.find((d) => !d.fixed)!;
    const { state } = previewOrders(s, 0, [
      cmd({ kind: "spawnShips", designId: design.id, count: 5, starId: s.players[0]!.homeStarId }),
      cmd({ kind: "setPopulation", colonyId: c.id, population: 3 }),
    ]);
    const ships = Object.values(state.fleets).filter((f) => f.ownerId === 0).flatMap((f) => f.ships).filter((x) => x.designId === design.id);
    const had = Object.values(s.fleets).filter((f) => f.ownerId === 0).flatMap((f) => f.ships).filter((x) => x.designId === design.id);
    expect(ships.reduce((n, x) => n + x.count, 0)).toBe(had.reduce((n, x) => n + x.count, 0) + 5);
    expect(population(state.colonies[c.id]!)).toBe(3);
  });

  it("send a Vexari raid at the player at once", () => {
    const next = processTurn(game(), { 0: [cmd({ kind: "raid" })] });
    expect(next.events.some((e) => e.kind === "raid" && e.playerId === 0)).toBe(true);
  });

  it("replay the same way twice", () => {
    const s = game();
    const orders = { 0: [cmd({ kind: "event", event: "populationBoom" }), cmd({ kind: "revealMap" })] };
    expect(JSON.stringify(processTurn(s, orders))).toBe(JSON.stringify(processTurn(s, orders)));
  });
});
