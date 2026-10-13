import { describe, expect, it } from "vitest";
import { CLIMATES, declareWar, newGame, playerView, seatOrder, type Fleet, type GameState, type PlayerId } from "@starlord/sim";
import { automationOrders, colonizationTargets } from "@starlord/ai";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

function game(seed: string): GameState {
  const s = newGame({ seed, races: ["felhari", "kordex", "zhrikk"], ...quiet });
  for (const p of s.players) if (p.kind === "empire") p.contacts = s.players.filter((q) => q.kind === "empire" && q.id !== p.id).map((q) => q.id);
  return s;
}

function addFleet(s: GameState, ownerId: PlayerId, starId: string, designId: string, count: number): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = {
    id: `t${ownerId}${designId}${Object.keys(s.fleets).length}`, ownerId, x: star.x, y: star.y, starId, destStarId: null,
    ships: [{ designId, count }], stance: "defend", name: "Test",
  };
  s.fleets[f.id] = f;
  return f;
}

describe("AI fixes", () => {
  it("computer empires don't propose peace to each other: the turn makes it", () => {
    const s = game("nopeace");
    declareWar(s, 0, 1);
    s.turn += 40;
    const orders = automationOrders(playerView(s, 0));
    expect(orders.some((c) => c.type === "propose" && c.to === 1)).toBe(false);
  });

  it("a colony ship waits while settlers who act first this turn could take every free world", () => {
    const s = game("contest");
    const target = colonizationTargets(playerView(s, 0))[0]!;
    const starId = target.planet.starId;
    const free = Object.values(s.planets).filter((p) => p.starId === starId && !p.colonyId && CLIMATES[p.type].habitable).length;
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0 && f.ships.some((x) => x.designId === "colonyShip")) delete s.fleets[f.id];
    const mine = addFleet(s, 0, starId, "colonyShip", 1);
    addFleet(s, 1, starId, "colonyShip", free);
    const colonizes = () => automationOrders(playerView(s, 0)).some((c) => c.type === "colonize" && c.fleetId === mine.id);
    // Find a turn on which empire 1 acts before empire 0, and one on which it acts after.
    while (seatOrder(s).indexOf(1) > seatOrder(s).indexOf(0)) s.turn++;
    expect(colonizes()).toBe(false);
    while (seatOrder(s).indexOf(1) < seatOrder(s).indexOf(0)) s.turn++;
    expect(colonizes()).toBe(true);
  });

  it("scraps idle troop ships in peacetime", () => {
    const s = game("transports");
    const home = s.players[0]!.homeStarId;
    const f = addFleet(s, 0, home, "transport", 3);
    const peace = automationOrders(playerView(s, 0));
    expect(peace.some((c) => c.type === "scrapShips" && c.fleetId === f.id)).toBe(true);
    declareWar(s, 0, 1);
    const war = automationOrders(playerView(s, 0));
    expect(war.some((c) => c.type === "scrapShips" && c.fleetId === f.id)).toBe(false);
  });
});
