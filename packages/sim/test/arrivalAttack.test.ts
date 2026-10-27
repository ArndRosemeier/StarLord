import { describe, expect, it } from "vitest";
import {
  newGame, pendingOrbital, pendingTarget, processTurn, validateCommand,
  type Colony, type Fleet, type GameState, type TurnOrders,
} from "@starlord/sim";

/**
 * Player 0 (human) at war with player 1. Player 0's fleet, set to defend, is a step away from player 1's home
 * system and arrives there this turn, as in the original where arriving warships fight, bombard, invade or
 * mind-control on arrival.
 */
function setup(opts: { race?: string; starBase?: boolean; troops?: number } = {}) {
  const s = newGame({ seed: "arrival", races: [opts.race ?? "terran", "felhari"], monsters: false, raiders: false, council: false, randomEvents: false });
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  s.players[0]!.isHuman = true;
  const home = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
  home.buildings = opts.starBase ? ["starBase"] : [];
  home.marinesTrained = 0;
  home.tanksTrained = 0;
  for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
  const star = s.galaxy.stars.find((x) => x.id === s.planets[home.planetId]!.starId)!;
  const p = s.players[0]!;
  const frigate = p.designs.find((d) => d.id === "frigate")!;
  p.designs.push(
    { ...structuredClone(frigate), id: "cruiser", name: "cruiser", hull: "cruiser" },
    { ...structuredClone(frigate), id: "troop", name: "Troops", module: "transport", weapons: [] },
  );
  const ships: Fleet["ships"] = [{ designId: "cruiser", count: 4 }];
  if (opts.troops) ships.push({ designId: "troop", count: opts.troops });
  const f: Fleet = {
    id: `o${s.nextId++}`, ownerId: 0, x: star.x + 0.01, y: star.y, starId: null, destStarId: star.id, ships, stance: "defend", name: "Strike",
  };
  s.fleets[f.id] = f;
  return { s, star, home, f };
}

const ownerAfter = (s: GameState, orders: TurnOrders, c: Colony) => processTurn(s, orders).colonies[c.id]?.ownerId;

describe("fleets arriving at an enemy system", () => {
  it("are asked what to attack the turn they arrive, and fight there that turn", () => {
    const { s, star, home, f } = setup({ starBase: true });
    const prompt = pendingTarget(s, {}, 0);
    expect(prompt?.starId).toBe(star.id);
    expect(prompt?.options.map((o) => o.colonyId)).toEqual([home.id]);
    expect(prompt?.fleetIds).toEqual([f.id]);
    const next = processTurn(s, { 0: [{ type: "attackPlanet", fleetId: f.id, colonyId: home.id }] });
    expect(next.combats.length).toBe(1);
    expect(next.combats[0]!.colonyId).toBe(home.id);
  });

  it("attack nothing when told to hold, and are not asked again that turn", () => {
    const { s, f } = setup({ starBase: true });
    const hold: TurnOrders = { 0: [{ type: "setStance", fleetId: f.id, stance: "defend" }] };
    expect(pendingTarget(s, hold, 0)).toBeNull();
    expect(processTurn(s, hold).combats.length).toBe(0);
  });

  it("can be ordered to invade on their way, and land their troops the turn they arrive", () => {
    const { s, home, f } = setup({ troops: 30 });
    const cmd = { type: "invade" as const, fleetId: f.id, colonyId: home.id };
    expect(validateCommand(s, 0, cmd).ok).toBe(true);
    expect(ownerAfter(s, { 0: [cmd] }, home)).toBe(0);
  });

  it("are offered an invasion after the won orbit, on the arrival turn", () => {
    const { s, home, f } = setup({ troops: 30 });
    const pick: TurnOrders = { 0: [{ type: "attackPlanet", fleetId: f.id, colonyId: home.id }] };
    const prompt = pendingOrbital(s, pick, 0);
    expect(prompt?.colonyId).toBe(home.id);
    expect(prompt?.options.find((o) => o.choice === "invade")?.available).toBe(true);
    expect(prompt?.invaders).toBeGreaterThan(0);
    pick[0]!.push({ type: "orbitalStrike", colonyId: home.id, choice: "invade" });
    expect(ownerAfter(s, pick, home)).toBe(0);
  });

  it("do not offer an invasion without troop ships", () => {
    const { s, home, f } = setup();
    const prompt = pendingOrbital(s, { 0: [{ type: "attackPlanet", fleetId: f.id, colonyId: home.id }] }, 0);
    expect(prompt?.options.find((o) => o.choice === "invade")?.available).toBe(false);
  });

  it("mind-control the colony the turn they arrive when they are telepaths", () => {
    const { s, home } = setup({ race: "lysari" });
    const prompt = pendingOrbital(s, {}, 0);
    expect(prompt?.colonyId).toBe(home.id);
    expect(prompt?.options.find((o) => o.choice === "mind")?.available).toBe(true);
    expect(ownerAfter(s, { 0: [{ type: "orbitalStrike", colonyId: home.id, choice: "mind" }] }, home)).toBe(0);
  });
});
