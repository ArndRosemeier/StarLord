import { describe, expect, it } from "vitest";
import {
  BUILDINGS, FREIGHTERS, colonyDefenseStrength, defendingTroops, newGame, planetDefense, processTurn, type Colony, type GameState,
} from "@starlord/sim";

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

describe("finished buildings take effect", () => {
  /** Builds `id` at a home colony that doesn't have it yet (nor anything it replaces), with its tech known. */
  function buildBuilding(id: string): { before: GameState; after: GameState; home: Colony } {
    const { s, home } = setup();
    const def = BUILDINGS.find((b) => b.id === id)!;
    if (def.requires) s.players[0]!.techs.push(def.requires);
    home.buildings = home.buildings.filter((b) => b !== id && !def.replaces?.includes(b));
    // Make the colony one where the building does something, or it isn't offered.
    if (def.effects.gravityFix) s.planets[home.planetId]!.gravity = s.planets[home.planetId]!.gravity === "low" ? "heavy" : "low";
    if (def.effects.morale) s.players[0]!.government = "dictatorship";
    if (def.effects.alienManagement) home.aliens = 1;
    const before = structuredClone(s);
    const after = processTurn(s, {
      0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "building", id }] }, { type: "buy", colonyId: home.id }],
    });
    return { before, after, home };
  }

  // The Capitol can only be rebuilt after it is lost.
  it.each(BUILDINGS.filter((b) => b.id !== "capitol").map((b) => b.id))("%s stands on the colony once finished", (id) => {
    const { after, home } = buildBuilding(id);
    expect(after.colonies[home.id]!.buildings).toContain(id);
  });

  it.each(["marineBarracks", "armorBarracks"])("%s adds ground troops", (id) => {
    const { before, after, home } = buildBuilding(id);
    expect(defendingTroops(after, after.colonies[home.id]!)).toBeGreaterThan(defendingTroops(before, before.colonies[home.id]!));
  });

  it.each(["starBase", "battlestation", "starFortress", "missileBase", "groundBatteries", "planetaryStellarConverter"])("%s makes the colony stronger in battle", (id) => {
    const { before, after, home } = buildBuilding(id);
    expect(colonyDefenseStrength(after, after.colonies[home.id]!)).toBeGreaterThan(colonyDefenseStrength(before, before.colonies[home.id]!));
  });

  it("a Fighter Garrison launches fighters and planetary shields cut every hit", () => {
    const garrison = buildBuilding("fighterGarrison");
    expect(planetDefense(garrison.after.colonies[garrison.home.id]!).installations).toContain("fighterGarrison");
    for (const id of ["radiationShield", "fluxShield", "barrierShield"]) {
      const { after, home } = buildBuilding(id);
      expect(planetDefense(after.colonies[home.id]!).shield).toBeGreaterThan(0);
    }
  });
});

describe("repeat build", () => {
  it("keeps a repeated ship at the head and builds one every time it finishes", () => {
    let { s, home } = setup();
    const scout = s.players[0]!.designs.find((d) => d.name.toLowerCase().includes("scout"))!;
    const ships = (g: GameState) => Object.values(g.fleets).filter((f) => f.ownerId === 0)
      .reduce((n, f) => n + f.ships.filter((x) => x.designId === scout.id).reduce((m, x) => m + x.count, 0), 0);
    const before = ships(s);
    s = processTurn(s, {
      0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "ship", designId: scout.id, repeat: true }, { kind: "project", id: "spy" }] },
        { type: "buy", colonyId: home.id }],
    });
    s = processTurn(s, { 0: [{ type: "buy", colonyId: home.id }] });
    expect(ships(s)).toBe(before + 2);
    expect(s.colonies[home.id]!.queue[0]).toEqual({ kind: "ship", designId: scout.id, repeat: true });
    expect(s.players[0]!.spies.home).toBe(0);
  });

  it("drops a repeated project once the rules allow no more of it", () => {
    let { s, home } = setup();
    s = processTurn(s, {
      0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "project", id: "dimensionalPortal", repeat: true }] }, { type: "buy", colonyId: home.id }],
    });
    expect(s.colonies[home.id]!.portal).toBe(true);
    expect(s.colonies[home.id]!.queue).toEqual([]);
  });

  it("repeats a project such as Terraforming until the planet can't improve", () => {
    let { s, home } = setup();
    s.planets[home.planetId]!.type = "arid";
    s = processTurn(s, {
      0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "project", id: "terraform", repeat: true }] }, { type: "buy", colonyId: home.id }],
    });
    expect(s.planets[home.planetId]!.type).toBe("terran");
    expect(s.colonies[home.id]!.queue).toEqual([]);
  });
});
