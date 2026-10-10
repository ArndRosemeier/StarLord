import { describe, expect, it } from "vitest";
import {
  Rng, designStats, findDesign, newGame, processTurn, relation, resolveCombat, startingDesigns, validateDesign,
  type Fleet, type GameState, type ShipDesign,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

function twoEmpires(seed = "sys"): GameState {
  const s = newGame({ seed, races: ["terran", "felhari"], ...quiet });
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  return s;
}

function addFleet(s: GameState, ownerId: number, starId: string, ships: Fleet["ships"], stance: Fleet["stance"] = "defend"): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance, name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

describe("ship design", () => {
  it("accepts the starting designs and rejects overfull ones", () => {
    const s = twoEmpires();
    const p = s.players[0]!;
    for (const d of startingDesigns()) {
      expect(validateDesign(p, d)).toBe(null);
    }
    const greedy: ShipDesign = { ...startingDesigns()[1]!, id: "x", weapons: [{ weaponId: "laserCannon", count: 10 }] };
    expect(validateDesign(p, greedy)).toBe("not enough space");
  });

  it("makes old components smaller as a field advances", () => {
    const s = twoEmpires();
    const p = s.players[0]!;
    const frigate = findDesign(p, "frigate")!;
    const before = designStats(p, frigate).spaceUsed;
    p.tiers.push("fusionPhysics", "tachyonPhysics", "neutrinoPhysics");
    expect(designStats(p, frigate).spaceUsed).toBeLessThan(before);
  });
});

describe("combat", () => {
  it("is deterministic and the stronger fleet wins", () => {
    const s = twoEmpires();
    const star = s.players[1]!.homeStarId;
    const a = addFleet(s, 0, star, [{ designId: "frigate", count: 12 }], "attack");
    const b = addFleet(s, 1, star, [{ designId: "frigate", count: 1 }]);
    const run = () =>
      resolveCombat(s, new Rng({ s: 42 }), star, { ownerId: 0, fleets: [a], attacksPlanet: true }, { ownerId: 1, fleets: [b], attacksPlanet: false }, "cb");
    expect(run()).toEqual(run());
    expect(run().report.winner).toBe(0);
  });

  it("fights at war, bombs nothing without bombs, and the home star base shoots back", () => {
    let s = twoEmpires();
    s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
    const star = s.players[1]!.homeStarId;
    addFleet(s, 0, star, [{ designId: "frigate", count: 3 }], "attack");
    s = processTurn(s, {});
    expect(s.combats.length).toBeGreaterThan(0);
    expect(s.combats[0]!.ships.some((x) => x.kind === "station" && x.hullId === "starBase")).toBe(true);
  });

  it("leaves empires at peace alone", () => {
    let s = twoEmpires();
    const star = s.players[1]!.homeStarId;
    addFleet(s, 0, star, [{ designId: "frigate", count: 3 }], "attack");
    s = processTurn(s, {});
    expect(s.combats).toEqual([]);
  });
});

describe("invasion", () => {
  it("captures an undefended colony with enough troops", () => {
    let s = twoEmpires("inv");
    s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
    const victim = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
    victim.buildings = [];
    victim.farmers = 1;
    victim.workers = 0;
    victim.scientists = 0;
    const star = s.planets[victim.planetId]!.starId;
    for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
    const f = addFleet(s, 0, star, [{ designId: "transport", count: 6 }]);
    s = processTurn(s, { 0: [{ type: "invade", fleetId: f.id, colonyId: victim.id }] });
    expect(s.colonies[victim.id]!.ownerId).toBe(0);
    expect(s.events.some((e) => e.kind === "colonyCaptured")).toBe(true);
  });
});

describe("diplomacy", () => {
  it("signs a trade treaty when accepted and earns BC from it", () => {
    let s = twoEmpires("dip");
    s = processTurn(s, { 0: [{ type: "propose", to: 1, kind: "trade" }] });
    const p = s.proposals.find((x) => x.kind === "trade")!;
    s = processTurn(s, { 1: [{ type: "respond", proposalId: p.id, accept: true }] });
    expect(relation(s, 0, 1).trade).toBe(true);
  });

  it("declaring war ends treaties", () => {
    let s = twoEmpires("war");
    s.relations["0-1"] = { status: "peace", trade: true, research: true, since: 1 };
    s = processTurn(s, { 0: [{ type: "declareWar", target: 1 }] });
    expect(relation(s, 0, 1)).toMatchObject({ status: "war", trade: false, research: false });
    expect(s.attitude[1]![0]!).toBeLessThan(0);
  });
});

describe("espionage", () => {
  it("lets spies steal technology eventually", () => {
    let s = twoEmpires("spy");
    s.players[1]!.techs.push("automatedFactory", "researchLab", "hydroponicFarm");
    // Spying applications (+10 each on spy rolls) make the outcome reliable.
    s.players[0]!.techs.push("neuralScanner", "cyberSecurityLink", "stealthSuit");
    s.players[0]!.spies.home = 6;
    s = processTurn(s, { 0: [{ type: "setSpies", target: 1, count: 6, mission: "steal" }] });
    for (let i = 0; i < 40 && !s.players[0]!.techs.includes("automatedFactory") && !s.players[0]!.techs.includes("researchLab"); i++) {
      s = processTurn(s, {});
    }
    const stolen = s.players[0]!.techs.filter((t) => ["automatedFactory", "researchLab", "hydroponicFarm"].includes(t));
    expect(stolen.length).toBeGreaterThan(0);
  });
});

describe("leaders", () => {
  it("offers leaders that can be hired and assigned", () => {
    let s = twoEmpires("lead");
    for (let i = 0; i < 15; i++) s = processTurn(s, {});
    const offer = s.players[0]!.leaderOffers[0]!;
    expect(offer).toBeDefined();
    s.players[0]!.bc = 10000;
    s = processTurn(s, { 0: [{ type: "hireLeader", leaderId: offer.id }] });
    expect(s.leaders[offer.id]!.ownerId).toBe(0);
  });
});

describe("raiders", () => {
  it("raid an empire once their time comes", () => {
    let s = newGame({ seed: "raid", races: ["terran", "felhari"], monsters: false, council: false });
    s.raiders.nextRaid = s.turn;
    s = processTurn(s, {});
    expect(s.events.some((e) => e.kind === "raid")).toBe(true);
  });
});
