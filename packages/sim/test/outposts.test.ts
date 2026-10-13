import { describe, expect, it } from "vitest";
import {
  BUILDINGS_BY_ID, BUILDING_SCRAP, availableProjects, baseTargets, buildingScrapRefund, newGame, previewOrders, processTurn,
  suggestedBaseTarget, validateCommand, type GameState, type Planet,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

/** A game whose first empire's colony ship fleet also carries an outpost ship, with free bodies at home. */
function setup(): { s: GameState; fleetId: string; free: Planet[] } {
  for (let i = 0; ; i++) {
    const s = newGame({ seed: `outposts${i}`, playerCount: 2, ...quiet });
    const home = s.players[0]!.homeStarId;
    const free = Object.values(s.planets).filter((p) => p.starId === home && !p.colonyId);
    if (free.length < 2) continue;
    const fleet = Object.values(s.fleets).find((f) => f.ownerId === 0 && f.ships.some((x) => x.designId === "colonyShip"))!;
    fleet.ships.push({ designId: "outpostShip", count: 1 });
    s.players[0]!.techs.push("outpostShip");
    return { s, fleetId: fleet.id, free };
  }
}

describe("outposts on asteroids and gas giants", () => {
  it("lets an outpost ship claim a gas giant, while a colony ship can't", () => {
    const { s: s0, fleetId, free } = setup();
    const giant = free[0]!;
    giant.type = "gasGiant";
    expect(validateCommand(s0, 0, { type: "colonize", fleetId, planetId: giant.id, module: "colony" }).ok).toBe(false);
    expect(validateCommand(s0, 0, { type: "colonize", fleetId, planetId: giant.id, module: "outpost" }).ok).toBe(true);
    // Without a pick, the outpost ship goes: the colony ship can't land there.
    const s = processTurn(s0, { 0: [{ type: "colonize", fleetId, planetId: giant.id }] });
    const colony = s.colonies[s.planets[giant.id]!.colonyId!]!;
    expect(colony.ownerId).toBe(0);
    expect(colony.outpost).toBe(true);
    const ships = s.fleets[fleetId]!.ships;
    expect(ships.some((x) => x.designId === "colonyShip" && x.count > 0)).toBe(true);
    expect(ships.some((x) => x.designId === "outpostShip" && x.count > 0)).toBe(false);
  });

  it("refuses an asteroid belt to a fleet of colony ships only", () => {
    const { s, fleetId, free } = setup();
    s.fleets[fleetId]!.ships = s.fleets[fleetId]!.ships.filter((x) => x.designId !== "outpostShip");
    free[0]!.type = "asteroids";
    const r = validateCommand(s, 0, { type: "colonize", fleetId, planetId: free[0]!.id });
    expect(r.ok).toBe(false);
  });

  it("lands the outpost ship on a habitable world when asked, keeping the colony ship", () => {
    const { s: s0, fleetId, free } = setup();
    free[0]!.type = "terran";
    const s = processTurn(s0, { 0: [{ type: "colonize", fleetId, planetId: free[0]!.id, module: "outpost" }] });
    expect(s.colonies[s.planets[free[0]!.id]!.colonyId!]!.outpost).toBe(true);
    expect(s.fleets[fleetId]!.ships.some((x) => x.designId === "colonyShip" && x.count > 0)).toBe(true);
  });

  it("still lets an Artificial Planet use a body the empire holds as an outpost, free ones first", () => {
    const { s: s0, fleetId, free } = setup();
    const [giant, belt] = free as [Planet, Planet];
    giant.type = "gasGiant";
    belt.type = "asteroids";
    for (const p of free.slice(2)) p.type = "terran";
    s0.players[0]!.techs.push("artificialPlanet");
    const s = processTurn(s0, { 0: [{ type: "colonize", fleetId, planetId: giant.id, module: "outpost" }] });
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0 && !c.outpost)!;
    expect(baseTargets(s, home, "artificialPlanet").map((p) => p.id).sort()).toEqual([giant.id, belt.id].sort());
    expect(availableProjects(s, 0, home)).toContain("artificialPlanet");
    // The free asteroid belt beats the outposted gas giant.
    expect(suggestedBaseTarget(s, home, "artificialPlanet")?.id).toBe(belt.id);
  });
});

describe("scrapping buildings", () => {
  function homeWith(buildings: string[]) {
    const s = newGame({ seed: "scrap", playerCount: 2, ...quiet });
    const home = Object.values(s.colonies).find((c) => c.ownerId === 0 && !c.outpost)!;
    home.buildings.push(...buildings.filter((b) => !home.buildings.includes(b)));
    return { s, home };
  }

  it("pays back half the base cost, rounded down", () => {
    const { s: s0, home } = homeWith(["automatedFactory"]);
    const bc = s0.players[0]!.bc;
    const refund = buildingScrapRefund("automatedFactory");
    expect(refund).toBe(Math.floor(BUILDINGS_BY_ID.automatedFactory!.cost * BUILDING_SCRAP.refund));
    const { state, rejected } = previewOrders(s0, 0, [{ type: "scrapBuilding", colonyId: home.id, buildingId: "automatedFactory" }]);
    expect(rejected).toEqual([]);
    expect(state.colonies[home.id]!.buildings).not.toContain("automatedFactory");
    expect(state.players[0]!.bc).toBe(bc + refund);
    expect(state.colonies[home.id]!.scrappedTurn).toBe(s0.turn);
  });

  it("allows one building per colony per turn", () => {
    const { s: s0, home } = homeWith(["automatedFactory", "hydroponicFarm"]);
    const s = processTurn(s0, {
      0: [
        { type: "scrapBuilding", colonyId: home.id, buildingId: "automatedFactory" },
        { type: "scrapBuilding", colonyId: home.id, buildingId: "hydroponicFarm" },
      ],
    });
    expect(s.colonies[home.id]!.buildings).not.toContain("automatedFactory");
    expect(s.colonies[home.id]!.buildings).toContain("hydroponicFarm");
    expect(s.events.some((e) => e.kind === "commandRejected" && e.reason.startsWith("scrapBuilding"))).toBe(true);
    // Next turn another one may go.
    expect(validateCommand(s, 0, { type: "scrapBuilding", colonyId: home.id, buildingId: "hydroponicFarm" }).ok).toBe(true);
  });

  it("never scraps the Capitol or a building the colony lacks", () => {
    const { s, home } = homeWith(["capitol"]);
    expect(validateCommand(s, 0, { type: "scrapBuilding", colonyId: home.id, buildingId: "capitol" }).ok).toBe(false);
    expect(validateCommand(s, 0, { type: "scrapBuilding", colonyId: home.id, buildingId: "stellarConverter" }).ok).toBe(false);
    expect(validateCommand(s, 1, { type: "scrapBuilding", colonyId: home.id, buildingId: "capitol" }).ok).toBe(false);
  });
});
