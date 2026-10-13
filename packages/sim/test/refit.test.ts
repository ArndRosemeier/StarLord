import { describe, expect, it } from "vitest";
import {
  HULLS_BY_ID, REFIT, designStats, fleetSpeed, newGame, previewOrders, processTurn, refitCost, refitTargets, refitTurns, validateCommand,
  type Colony, type Fleet, type GameState, type ShipDesign,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

function setup(): { s: GameState; home: Colony; fleet: Fleet } {
  const s = newGame({ seed: "refit", playerCount: 2, ...quiet });
  const p = s.players[0]!;
  const home = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
  const star = s.galaxy.stars.find((x) => x.id === p.homeStarId)!;
  p.bc = 50000;
  p.techs.push("tritaniumArmor", "fusionDrive");
  const mk2: ShipDesign = { ...structuredClone(p.designs.find((d) => d.id === "frigate")!), id: "mk2", name: "Frigate Mk 2", armor: "tritaniumArmor" };
  const cruiser: ShipDesign = { ...structuredClone(mk2), id: "cr", name: "Cruiser", hull: "cruiser" };
  p.designs.push(mk2, cruiser);
  const fleet: Fleet = {
    id: "rf", ownerId: 0, x: star.x, y: star.y, starId: star.id, destStarId: null,
    ships: [{ designId: "frigate", count: 3, xp: 40, damage: [2] }], stance: "defend", name: "Old Guard",
  };
  s.fleets[fleet.id] = fleet;
  return { s, home, fleet };
}

const refit = (home: Colony, count = 1, toDesignId = "mk2") =>
  ({ type: "refitShips", fleetId: "rf", designId: "frigate", toDesignId, colonyId: home.id, count }) as const;

describe("refit cost", () => {
  it("is twice the cost difference, at least a quarter of the hull", () => {
    const { s } = setup();
    const p = s.players[0]!;
    const frigate = p.designs.find((d) => d.id === "frigate")!;
    const mk2 = p.designs.find((d) => d.id === "mk2")!;
    const diff = designStats(p, mk2).cost - designStats(p, frigate).cost;
    const min = Math.floor(HULLS_BY_ID.frigate.cost / REFIT.minHullCostDivisor);
    expect(refitCost(p, frigate, mk2)).toBe(Math.max(min, REFIT.costDifferenceMult * diff));
    // A cheaper design still costs the hull minimum.
    expect(refitCost(p, mk2, frigate)).toBe(min);
  });

  it("offers only buildable designs of the same hull", () => {
    const { s } = setup();
    const ids = refitTargets(s, 0, "frigate").map((d) => d.id);
    expect(ids).toContain("mk2");
    expect(ids).not.toContain("cr");
    expect(ids).not.toContain("frigate");
    expect(ids).not.toContain("colonyShip");
  });
});

describe("refitting ships", () => {
  it("takes the ship into dock and queues the job at the colony", () => {
    const { s: s0, home } = setup();
    const s = processTurn(s0, { 0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "tradeGoods" }] }, refit(home, 2)] });
    expect(s.events.filter((e) => e.kind === "commandRejected")).toEqual([]);
    const jobs = s.colonies[home.id]!.queue.filter((q) => q.kind === "refit");
    // Ahead of Trade Goods, which never finishes.
    expect(s.colonies[home.id]!.queue.at(-1)!.kind).toBe("tradeGoods");
    expect(jobs.length + (s.fleets.rf?.ships.find((x) => x.designId === "mk2")?.count ?? 0)).toBe(2);
    expect(s.fleets.rf!.ships.find((x) => x.designId === "frigate")!.count).toBe(1);
  });

  it("brings the ship back with its new design and crew once paid for", () => {
    const { s: s0, home } = setup();
    const s = processTurn(s0, { 0: [{ type: "setQueue", colonyId: home.id, queue: [] }, refit(home), { type: "buy", colonyId: home.id }] });
    expect(s.events.some((e) => e.kind === "built" && e.item.kind === "refit")).toBe(true);
    const f = s.fleets.rf!;
    const mk2 = f.ships.find((x) => x.designId === "mk2")!;
    expect(mk2.count).toBe(1);
    expect(mk2.xp).toBeGreaterThanOrEqual(40);
    expect(f.ships.find((x) => x.designId === "frigate")!.count).toBe(2);
    expect(s.colonies[home.id]!.queue.some((q) => q.kind === "refit")).toBe(false);
  });

  it("returns as a new fleet when its old one left", () => {
    const { s: s0, home, fleet } = setup();
    fleet.ships[0]!.count = 1;
    fleet.ships[0]!.damage = [];
    const s = processTurn(s0, { 0: [{ type: "setQueue", colonyId: home.id, queue: [] }, refit(home), { type: "buy", colonyId: home.id }] });
    expect(s.fleets.rf).toBeUndefined();
    const back = Object.values(s.fleets).find((f) => f.ownerId === 0 && f.ships.some((x) => x.designId === "mk2"));
    expect(back).toBeDefined();
  });

  it("is refused for another hull, outside the system or without a station for big hulls", () => {
    const { s, home, fleet } = setup();
    expect(validateCommand(s, 0, refit(home, 1, "cr")).ok).toBe(false);
    expect(validateCommand(s, 0, refit(home, 9)).ok).toBe(false);
    const other = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
    expect(validateCommand(s, 0, { ...refit(home), colonyId: other.id }).ok).toBe(false);
    fleet.starId = null;
    expect(validateCommand(s, 0, refit(home)).ok).toBe(false);
    fleet.starId = s.players[0]!.homeStarId;
    // A cruiser needs an orbital station.
    const p = s.players[0]!;
    p.designs.push({ ...structuredClone(p.designs.find((d) => d.id === "cr")!), id: "cr2", name: "Cruiser 2", armor: "titaniumArmor" });
    fleet.ships.push({ designId: "cr", count: 1 });
    const cmd = { type: "refitShips", fleetId: "rf", designId: "cr", toDesignId: "cr2", colonyId: home.id, count: 1 } as const;
    expect(validateCommand(s, 0, cmd).ok).toBe(true);
    home.buildings = home.buildings.filter((b) => b !== "starBase");
    expect(validateCommand(s, 0, cmd).ok).toBe(false);
  });

  it("cannot be dropped from the queue by setQueue, only cancelled, which scraps the ship", () => {
    const { s: s0, home } = setup();
    const s1 = processTurn(s0, { 0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "ship", designId: "cr" }] }, refit(home)] });
    const c = s1.colonies[home.id]!;
    const job = c.queue.find((q) => q.kind === "refit")!;
    expect(job).toBeDefined();
    expect(validateCommand(s1, 0, { type: "setQueue", colonyId: home.id, queue: c.queue.filter((q) => q.kind !== "refit") }).ok).toBe(false);
    // Moving it is fine, and the stored cost can't be changed from outside.
    const moved = [{ ...job, cost: 1 }, ...c.queue.filter((q) => q.kind !== "refit")];
    const s2 = previewOrders(s1, 0, [{ type: "setQueue", colonyId: home.id, queue: moved }]).state;
    const head = s2.colonies[home.id]!.queue[0]!;
    expect(head.kind).toBe("refit");
    expect(head.kind === "refit" && head.cost).toBe(job.kind === "refit" && job.cost);
    expect(job.kind === "refit" && job.cost).toBeGreaterThan(1);
    const ships = (st: GameState) => Object.values(st.fleets).filter((f) => f.ownerId === 0).reduce((n, f) => n + f.ships.filter((x) => x.designId === "frigate" || x.designId === "mk2").reduce((m, x) => m + x.count, 0), 0);
    const before = ships(s1);
    const s3 = processTurn(s1, { 0: [{ type: "cancelRefit", colonyId: home.id, refitId: job.kind === "refit" ? job.refitId : "" }] });
    expect(s3.colonies[home.id]!.queue.some((q) => q.kind === "refit")).toBe(false);
    expect(ships(s3)).toBe(before);
  });

  it("estimates the turns from the colony's industry and what is queued ahead", () => {
    const { s, home } = setup();
    home.queue = [];
    home.progress = 0;
    const t = refitTurns(s, home, 10)!;
    expect(t).toBeGreaterThanOrEqual(1);
    home.queue = [{ kind: "building", id: "marineBarracks" }];
    expect(refitTurns(s, home, 10)!).toBeGreaterThanOrEqual(Math.max(2, t));
  });
});

describe("automatic upgrades", () => {
  it("drives and fuel follow the best technology on existing ships; armor needs a refit", () => {
    const { s } = setup();
    const p = s.players[0]!;
    const frigate = p.designs.find((d) => d.id === "frigate")!;
    const speedBefore = designStats(p, frigate).combatSpeed;
    const travelBefore = fleetSpeed(p);
    const armorBefore = designStats(p, frigate).armor;
    p.techs.push("ionDrive", "zortriumArmor");
    expect(designStats(p, frigate).combatSpeed).toBeGreaterThan(speedBefore);
    expect(fleetSpeed(p)).toBeGreaterThan(travelBefore);
    expect(designStats(p, frigate).armor).toBe(armorBefore);
  });
});

describe("losing the dock", () => {
  it("scraps a big ship whose refit the colony can no longer do", () => {
    const { s: s0, home, fleet } = setup();
    const p = s0.players[0]!;
    p.designs.push({ ...structuredClone(p.designs.find((d) => d.id === "cr")!), id: "cr2", name: "Cruiser 2", armor: "titaniumArmor" });
    fleet.ships = [{ designId: "cr", count: 1 }];
    const cmd = { type: "refitShips", fleetId: "rf", designId: "cr", toDesignId: "cr2", colonyId: home.id, count: 1 } as const;
    const s1 = processTurn(s0, { 0: [{ type: "setQueue", colonyId: home.id, queue: [{ kind: "ship", designId: "cr" }] }, cmd] });
    expect(s1.colonies[home.id]!.queue.some((q) => q.kind === "refit")).toBe(true);
    s1.colonies[home.id]!.queue = s1.colonies[home.id]!.queue.filter((q) => q.kind === "refit");
    s1.colonies[home.id]!.buildings = s1.colonies[home.id]!.buildings.filter((b) => b !== "starBase");
    const s2 = processTurn(s1, {});
    expect(s2.colonies[home.id]!.queue.some((q) => q.kind === "refit")).toBe(false);
    expect(Object.values(s2.fleets).some((f) => f.ships.some((x) => x.designId === "cr" || x.designId === "cr2"))).toBe(false);
  });
});
