import { describe, expect, it } from "vitest";
import {
  attackTargetAt, newGame, pendingOrbital, pendingTarget, processTurn, validateCommand,
  type Colony, type Fleet, type GameState, type TurnOrders,
} from "@starlord/sim";

/** Player 0 (telepaths, human) at war with player 1, whose home system holds three colonies; player 0 has a cruiser there. */
function setup(opts: { starBase?: boolean } = {}) {
  const s = newGame({ seed: "planet-scale", races: ["lysari", "felhari"], monsters: false, raiders: false, council: false, randomEvents: false });
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  s.players[0]!.isHuman = true;
  const home = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
  home.buildings = opts.starBase ? ["starBase"] : [];
  for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
  const star = s.galaxy.stars.find((x) => x.id === s.planets[home.planetId]!.starId)!;
  const colonies: Colony[] = [home];
  for (const pid of star.planetIds) {
    if (colonies.length >= 3 || s.planets[pid]!.colonyId) continue;
    const c: Colony = { ...structuredClone(home), id: `c${s.nextId++}`, planetId: pid, name: `${home.name} ${colonies.length + 1}`, buildings: [] };
    s.colonies[c.id] = c;
    s.planets[pid]!.colonyId = c.id;
    colonies.push(c);
  }
  const p = s.players[0]!;
  p.designs.push({ ...structuredClone(p.designs.find((d) => d.id === "frigate")!), id: "cruiser", name: "cruiser", hull: "cruiser" });
  const f: Fleet = { id: `o${s.nextId++}`, ownerId: 0, x: star.x, y: star.y, starId: star.id, destStarId: null, ships: [{ designId: "cruiser", count: 2 }], stance: "attack", name: "Strike" };
  s.fleets[f.id] = f;
  return { s, star, colonies, f };
}

const mindAll = (s: GameState, colonies: Colony[]): TurnOrders => ({
  0: colonies.map((c) => ({ type: "orbitalStrike" as const, colonyId: c.id, choice: "mind" as const })),
});

describe("combat has planet scale", () => {
  it("takes at most one planet a turn by mind control, the one attacked", () => {
    const { s, colonies, f } = setup();
    expect(colonies.length).toBe(3);
    const pick = colonies[2]!;
    const orders = mindAll(s, colonies);
    orders[0]!.unshift({ type: "attackPlanet", fleetId: f.id, colonyId: pick.id });
    const next = processTurn(s, orders);
    const taken = colonies.filter((c) => next.colonies[c.id]?.ownerId === 0);
    expect(taken.map((c) => c.id)).toEqual([pick.id]);
    // Next turn the next planet falls.
    const after = processTurn(next, mindAll(next, colonies));
    expect(colonies.filter((c) => after.colonies[c.id]?.ownerId === 0).length).toBe(2);
  });

  it("asks a human which planet to attack when there is more than one, before the battles", () => {
    const { s, colonies, f, star } = setup();
    const prompt = pendingTarget(s, {}, 0);
    expect(prompt?.starId).toBe(star.id);
    expect(prompt?.options.map((o) => o.colonyId).sort()).toEqual(colonies.map((c) => c.id).sort());
    expect(prompt?.fleetIds).toEqual([f.id]);
    expect(prompt?.options.every((o) => o.mindControl === null)).toBe(true);
    const orders: TurnOrders = { 0: [{ type: "attackPlanet", fleetId: f.id, colonyId: colonies[1]!.id }] };
    expect(pendingTarget(s, orders, 0)).toBeNull();
    // The orbital choice then concerns only that planet.
    expect(pendingOrbital(s, orders, 0)?.colonyId).toBe(colonies[1]!.id);
  });

  it("fights the battle over the attacked planet; the station of another colony stays out", () => {
    const { s, colonies, f } = setup({ starBase: true });
    const based = colonies[0]!;
    const open = colonies[1]!;
    const next = processTurn(s, { 0: [{ type: "attackPlanet", fleetId: f.id, colonyId: open.id }, { type: "orbitalStrike", colonyId: open.id, choice: "mind" }] });
    expect(next.combats.length).toBe(0);
    expect(next.colonies[open.id]?.ownerId).toBe(0);
    expect(next.colonies[based.id]?.ownerId).toBe(1);
    // Going for the station's planet means a battle over it.
    const g = setup({ starBase: true });
    const t = processTurn(g.s, { 0: [{ type: "attackPlanet", fleetId: g.f.id, colonyId: g.colonies[0]!.id }] });
    expect(t.combats.length).toBe(1);
    expect(t.combats[0]!.colonyId).toBe(g.colonies[0]!.id);
  });

  it("checks attack orders and keeps them only while the fleet goes there", () => {
    const { s, colonies, f } = setup();
    expect(validateCommand(s, 0, { type: "attackPlanet", fleetId: f.id, colonyId: colonies[0]!.id }).ok).toBe(true);
    const own = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
    expect(validateCommand(s, 0, { type: "attackPlanet", fleetId: f.id, colonyId: own.id }).ok).toBe(false);
    const next = processTurn(s, { 0: [{ type: "attackPlanet", fleetId: f.id, colonyId: colonies[0]!.id }, { type: "moveFleet", fleetId: f.id, destStarId: s.planets[own.planetId]!.starId }] });
    expect(next.fleets[f.id]?.attackTarget).toBeUndefined();
  });

  it("without a pick goes for the planet worth most for how surely it falls, as the original's computer players do", () => {
    const { s, star, colonies } = setup({ starBase: true });
    expect(attackTargetAt(s, 0, star.id)?.buildings).not.toContain("starBase");
    for (const c of colonies) Object.assign(c, { farmers: 1, workers: 0, scientists: 0 });
    Object.assign(colonies[0]!, { farmers: 20, buildings: [] });
    expect(attackTargetAt(s, 0, star.id)?.id).toBe(colonies[0]!.id);
  });
});
