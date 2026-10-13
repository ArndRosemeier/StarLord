import { describe, expect, it } from "vitest";
import {
  ASTEROID_BELT_SIZE, RELATION_EVENTS, Rng, attitude, groundPhase, newGame, orbitalPrompt, pendingOrbital, population, processTurn,
  validateCommand, type Colony, type Fleet, type GameEvent, type GameState, type OrbitalChoice, type TurnContext,
} from "@starlord/sim";

function game(): { s: GameState; ctx: TurnContext; events: GameEvent[] } {
  const s = newGame({ seed: "orbital", races: ["gorvath", "felhari", "kordex"], monsters: false, raiders: false, council: false, randomEvents: false });
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  s.players[0]!.contacts = [1, 2];
  s.players[1]!.contacts = [0];
  s.players[2]!.contacts = [0];
  // A human, uncharismatic attacker, so the relation hit is not divided down (two computer empires, charisma).
  s.players[0]!.isHuman = true;
  const events: GameEvent[] = [];
  const ctx: TurnContext = { state: s, rng: new Rng({ s: 7 }), emit: (e) => events.push(e as GameEvent) };
  return { s, ctx, events };
}

const homeColony = (s: GameState, pid: number): Colony => Object.values(s.colonies).find((c) => c.ownerId === pid)!;
const starOf = (s: GameState, c: Colony) => s.planets[c.planetId]!.starId;

/** Player 0's ships: bombers (4 nuclear bombs), spore carriers (4 Death Spores) and a converter ship, on a cruiser hull. */
function design(s: GameState, id: "bomber" | "spores" | "converter"): string {
  const p = s.players[0]!;
  const weapons = id === "bomber" ? [{ weaponId: "nuclearBomb", count: 4 }]
    : id === "spores" ? [{ weaponId: "deathSpores", count: 4 }]
      : [{ weaponId: "stellarConverter", count: 1 }];
  if (!p.designs.some((d) => d.id === id)) {
    p.designs.push({ ...structuredClone(p.designs.find((d) => d.id === "frigate")!), id, name: id, hull: id === "converter" ? "titan" : "cruiser", weapons });
  }
  return id;
}

function addFleet(s: GameState, starId: string, ships: Fleet["ships"], stance: Fleet["stance"] = "attack"): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `o${s.nextId++}`, ownerId: 0, x: star.x, y: star.y, starId, destStarId: null, ships, stance, name: "Strike" };
  s.fleets[f.id] = f;
  return f;
}

/** The enemy home colony with no defenses and no fleet, `pop` farmers and no buildings. */
function target(s: GameState, pop = 10): Colony {
  const c = homeColony(s, 1);
  c.buildings = [];
  c.farmers = pop;
  c.workers = 0;
  c.scientists = 0;
  for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
  return c;
}

const order = (ctx: TurnContext, colonyId: string, choice: OrbitalChoice) => {
  ctx.orbitalOrders = new Map([[colonyId, new Map([[0, choice]])]]);
};

describe("orbital strikes", () => {
  it("bombard without biological weapons when no order was given", () => {
    const { s, ctx, events } = game();
    const c = target(s);
    addFleet(s, starOf(s, c), [{ designId: design(s, "spores"), count: 5 }]);
    const rel = attitude(s, 2, 0);
    groundPhase(ctx, new Set([c.id]));
    expect(population(c)).toBe(10);
    expect(attitude(s, 2, 0)).toBe(rel);
    expect(events.some((e) => e.kind === "orbitalStrike")).toBe(false);
  });

  it("release biological weapons only when ordered, and appal the computer empires in contact", () => {
    const { s, ctx, events } = game();
    const c = target(s, 20);
    addFleet(s, starOf(s, c), [{ designId: design(s, "spores"), count: 5 }]);
    const rel = attitude(s, 2, 0);
    order(ctx, c.id, "bio");
    groundPhase(ctx, new Set([c.id]));
    // 5 ships x 4 mounts x 10 launches at 10%: twenty colonists expected; the dice decide.
    expect(population(c)).toBeLessThan(20);
    expect(attitude(s, 2, 0)).toBeLessThan(rel);
    expect(attitude(s, 2, 0)).toBeGreaterThanOrEqual(rel - RELATION_EVENTS.destruction);
    const ev = events.find((e) => e.kind === "orbitalStrike");
    expect(ev).toMatchObject({ playerId: 0, by: 0, victim: 1, choice: "bio", planetDestroyed: false });
  });

  it("hold fire when told to, even on attack stance", () => {
    const { s, ctx } = game();
    const c = target(s);
    addFleet(s, starOf(s, c), [{ designId: design(s, "bomber"), count: 10 }]);
    order(ctx, c.id, "none");
    groundPhase(ctx, new Set([c.id]));
    expect(population(c)).toBe(10);
  });

  it("bombard on order with a fleet that is not on attack stance", () => {
    const { s, ctx } = game();
    const c = target(s);
    addFleet(s, starOf(s, c), [{ designId: design(s, "bomber"), count: 10 }], "defend");
    groundPhase(ctx, new Set([c.id]));
    expect(population(c)).toBe(10);
    order(ctx, c.id, "bomb");
    groundPhase(ctx, new Set([c.id]));
    expect(population(c)).toBeLessThan(10);
  });

  it("destroy the planet with a Stellar Converter: an asteroid belt, the colony and its special gone, everyone appalled", () => {
    const { s, ctx, events } = game();
    const c = target(s);
    const planet = s.planets[c.planetId]!;
    planet.special = "gems";
    addFleet(s, starOf(s, c), [{ designId: design(s, "converter"), count: 1 }], "defend");
    const rel = attitude(s, 2, 0);
    order(ctx, c.id, "destroy");
    groundPhase(ctx, new Set([c.id]));
    expect(s.colonies[c.id]).toBeUndefined();
    expect(planet.colonyId).toBeNull();
    expect(planet.type).toBe("asteroids");
    expect(planet.size).toBe(ASTEROID_BELT_SIZE);
    expect(planet.special).toBe("none");
    expect(attitude(s, 2, 0)).toBeLessThan(rel);
    const strikes = events.filter((e) => e.kind === "orbitalStrike");
    expect(strikes.map((e) => e.playerId).sort()).toEqual([0, 1]);
    expect(strikes[0]).toMatchObject({ choice: "destroy", planetDestroyed: true, popKilled: 10 });
    expect(events.some((e) => e.kind === "colonyLost" && e.playerId === 1 && e.how === "destroyed")).toBe(true);
  });

  it("can't destroy a planet whose defenses still stand, nor without a converter (the fleet bombs instead)", () => {
    const { s, ctx } = game();
    const c = target(s);
    addFleet(s, starOf(s, c), [{ designId: design(s, "converter"), count: 1 }]);
    order(ctx, c.id, "destroy");
    groundPhase(ctx, new Set());
    expect(s.colonies[c.id]).toBeDefined();

    const g = game();
    const c2 = target(g.s);
    addFleet(g.s, starOf(g.s, c2), [{ designId: design(g.s, "bomber"), count: 10 }]);
    order(g.ctx, c2.id, "destroy");
    groundPhase(g.ctx, new Set([c2.id]));
    expect(g.s.planets[c2.planetId]!.type).not.toBe("asteroids");
    expect(population(c2)).toBeLessThan(10);
  });

  it("estimate each choice with real numbers and say which are open", () => {
    const { s } = game();
    const c = target(s, 10);
    addFleet(s, starOf(s, c), [{ designId: design(s, "bomber"), count: 2 }]);
    const p = orbitalPrompt(s, 0, c.id);
    const opt = (k: OrbitalChoice) => p.options.find((o) => o.choice === k)!;
    // 2 ships x 4 bombs x 7.5 damage x 10 rounds = 600 damage: six hits, all on colonists here.
    expect(opt("bomb").available).toBe(true);
    expect(opt("bomb").hits).toBeCloseTo(6);
    expect(opt("bomb").popKilled).toBeCloseTo(6);
    expect(opt("bio").available).toBe(false);
    expect(opt("destroy").available).toBe(false);
    expect(opt("none").available).toBe(true);
    expect(p.population).toBe(10);
    // Player 2 is in contact and not at war; player 1 is at war (only patience suffers there).
    expect(p.outrage.empires.map((e) => e.playerId)).toEqual([2]);
    expect(p.outrage.empires[0]!.to).toBeLessThanOrEqual(p.outrage.empires[0]!.from);
    addFleet(s, starOf(s, c), [{ designId: design(s, "converter"), count: 1 }, { designId: design(s, "spores"), count: 1 }]);
    const q = orbitalPrompt(s, 0, c.id);
    expect(q.options.find((o) => o.choice === "destroy")!.available).toBe(true);
    expect(q.options.find((o) => o.choice === "bio")!.available).toBe(true);
    expect(q.options.find((o) => o.choice === "bio")!.outrage).toBe(true);
  });

  it("validates the order", () => {
    const { s } = game();
    const c = target(s);
    expect(validateCommand(s, 0, { type: "orbitalStrike", colonyId: c.id, choice: "bio" }).ok).toBe(true);
    expect(validateCommand(s, 0, { type: "orbitalStrike", colonyId: "nope", choice: "bio" }).ok).toBe(false);
    expect(validateCommand(s, 0, { type: "orbitalStrike", colonyId: c.id, choice: "nuke" as OrbitalChoice }).ok).toBe(false);
  });
});

describe("the turn asks a human what to do from orbit", () => {
  function setup() {
    const s = newGame({
      seed: "orbital-turn", races: ["terran", "felhari"], humanPlayers: [0], monsters: false, raiders: false, council: false, randomEvents: false,
    });
    s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
    s.players[0]!.contacts = [1];
    s.players[1]!.contacts = [0];
    const c = target(s, 10);
    addFleet(s, starOf(s, c), [{ designId: design(s, "bomber"), count: 4 }]);
    return { s, c };
  }

  it("stops at a colony the player holds orbit over until they decide, and the decision goes in with the turn", () => {
    const { s, c } = setup();
    const prompt = pendingOrbital(s, {}, 0);
    expect(prompt?.colonyId).toBe(c.id);
    expect(prompt?.options.find((o) => o.choice === "bomb")!.available).toBe(true);
    const held = { 0: [{ type: "orbitalStrike" as const, colonyId: c.id, choice: "none" as const }] };
    expect(pendingOrbital(s, held, 0)).toBeNull();
    const spared = processTurn(s, held);
    expect(spared.events.some((e) => e.kind === "orbitalStrike")).toBe(false);
    const bombed = { 0: [{ type: "orbitalStrike" as const, colonyId: c.id, choice: "bomb" as const }] };
    const a = processTurn(s, bombed);
    expect(a.events.some((e) => e.kind === "orbitalStrike" && e.playerId === 0)).toBe(true);
    expect(population(a.colonies[c.id] ?? { ...c, farmers: 0 })).toBeLessThan(population(spared.colonies[c.id]!));
    // Recorded orders replay to the same state.
    expect(JSON.stringify(processTurn(s, bombed))).toBe(JSON.stringify(a));
  });

  it("never stops for computer players or fleets not set to attack, and the default bombs without asking", () => {
    const { s, c } = setup();
    expect(pendingOrbital(s, {}, 1)).toBeNull();
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0) f.stance = "defend";
    expect(pendingOrbital(s, {}, 0)).toBeNull();
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0) f.stance = "attack";
    // Without the prompt (auto play, the command line) the turn bombards.
    const next = processTurn(s, {});
    expect(next.events.some((e) => e.kind === "orbitalStrike" && e.colonyName === c.name)).toBe(true);
  });
});
