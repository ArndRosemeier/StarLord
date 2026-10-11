import { describe, expect, it } from "vitest";
import {
  BATTLEOID_HITS, BOMB_DAMAGE_PER_HIT, CAPTURE_TECH_CHANCE, MILITIA_PER_POP, POWERED_ARMOR_HITS, Rng, SPECIAL_UNIT_RATING, TROOPS,
  canMindControl, captureColony, defendingTroops, exterminate, exterminateProblem, garrisonOf, groundPhase, invade, newGame, population, raze,
  troopUnit, type Colony, type Fleet, type GameEvent, type GameState,
} from "@starlord/sim";

type Ctx = Parameters<typeof invade>[0];

function game(races = ["terran", "felhari"], seed = "ground"): { s: GameState; ctx: Ctx; events: GameEvent[] } {
  const s = newGame({ seed, races, monsters: false, raiders: false, council: false, randomEvents: false });
  s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  const events: GameEvent[] = [];
  const ctx = { state: s, rng: new Rng({ s: 11 }), emit: (e: unknown) => events.push(e as GameEvent) };
  return { s, ctx, events };
}

const homeColony = (s: GameState, pid: number): Colony => Object.values(s.colonies).find((c) => c.ownerId === pid)!;
const starOf = (s: GameState, c: Colony) => s.planets[c.planetId]!.starId;

function addFleet(s: GameState, ownerId: number, starId: string, ships: Fleet["ships"], stance: Fleet["stance"] = "attack"): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `g${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance, name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

/** Strips a colony to a known garrison: no buildings, `pop` farmers and the given trained troops. */
function stripped(c: Colony, pop: number, troops: { marines?: number; tanks?: number } = {}): Colony {
  c.buildings = [];
  c.farmers = pop;
  c.workers = 0;
  c.scientists = 0;
  c.marinesTrained = troops.marines ?? 0;
  c.tanksTrained = troops.tanks ?? 0;
  return c;
}

describe("ground units", () => {
  it("rate tanks over marines over militia, and tanks take two hits", () => {
    const { s } = game();
    const unit = (kind: "militia" | "marines" | "armor") => troopUnit(s, 1, "felhari", kind, true);
    expect(unit("marines").rating - unit("militia").rating).toBe(TROOPS.marines.rating - TROOPS.militia.rating);
    expect(unit("armor").rating - unit("marines").rating).toBe(TROOPS.armor.rating - TROOPS.marines.rating);
    expect(unit("armor").hits).toBe(TROOPS.armor.hits);
  });

  it("gain a hit and rating from Powered Armor and Battleoids", () => {
    const { s } = game();
    s.players[0]!.isHuman = true;
    const before = { m: troopUnit(s, 0, "terran", "marines", false), a: troopUnit(s, 0, "terran", "armor", false) };
    s.players[0]!.techs.push("poweredArmor", "battleoids");
    const m = troopUnit(s, 0, "terran", "marines", false);
    const a = troopUnit(s, 0, "terran", "armor", false);
    expect(m.hits - before.m.hits).toBe(POWERED_ARMOR_HITS);
    expect(m.rating - before.m.rating).toBe(SPECIAL_UNIT_RATING);
    expect(a.hits - before.a.hits).toBe(BATTLEOID_HITS);
    expect(a.rating - before.a.rating).toBe(SPECIAL_UNIT_RATING);
  });

  it("fight better for computer players on harder levels, and not at all differently for humans", () => {
    const { s } = game();
    const rating = (difficulty: "tutor" | "impossible") => {
      s.settings.difficulty = difficulty;
      return troopUnit(s, 1, "felhari", "marines", true).rating;
    };
    expect(rating("impossible") - rating("tutor")).toBe(4);
    s.players[1]!.isHuman = true;
    expect(rating("impossible") - rating("tutor")).toBe(0);
  });

  it("garrison a colony with militia, barracks troops and trained troops, but leave outposts empty", () => {
    const { s } = game();
    const c = homeColony(s, 0);
    c.marinesTrained = 3;
    c.tanksTrained = 2;
    const g = garrisonOf(s, c);
    expect(g.militia).toBe(Math.floor(population(c) * MILITIA_PER_POP));
    // The home colony starts with a Marine Barracks.
    expect(g.marines).toBeGreaterThan(3);
    expect(g.armor).toBe(2);
    expect(defendingTroops(s, c)).toBe(g.militia + g.marines + g.armor);
    expect(garrisonOf(s, { ...c, outpost: true })).toEqual({ militia: 0, marines: 0, armor: 0 });
  });
});

describe("invasion", () => {
  it("captures a lightly held colony: the troop ships land, the Capitol falls and the people are aliens", () => {
    const { s, ctx, events } = game();
    const victim = stripped(homeColony(s, 1), 4);
    victim.buildings = ["capitol", "starBase"];
    victim.queue = [{ kind: "building", id: "marineBarracks" } as Colony["queue"][number]];
    const f = addFleet(s, 0, starOf(s, victim), [{ designId: "transport", count: 10 }]);
    invade(ctx, f, victim);
    expect(f.ships).toEqual([]);
    expect(victim.ownerId).toBe(0);
    expect(victim.formerOwnerId).toBe(1);
    expect(victim.buildings).toEqual(["starBase"]);
    expect(victim.queue).toEqual([]);
    expect(victim.aliens).toBe(population(victim));
    expect(events.some((e) => e.kind === "colonyLost" && e.playerId === 1 && e.to === 0)).toBe(true);
    expect(events.some((e) => e.kind === "colonyCaptured" && e.playerId === 0)).toBe(true);
  });

  it("fails against a strong garrison, and the surviving tanks stay on", () => {
    const { s, ctx, events } = game();
    const victim = stripped(homeColony(s, 1), 4, { tanks: 20 });
    const f = addFleet(s, 0, starOf(s, victim), [{ designId: "transport", count: 1 }]);
    invade(ctx, f, victim);
    expect(victim.ownerId).toBe(1);
    expect(events.some((e) => e.kind === "invasionFailed" && e.playerId === 0)).toBe(true);
    expect(victim.tanksTrained).toBeGreaterThan(0);
    expect(victim.tanksTrained).toBeLessThanOrEqual(20);
    expect(f.ships).toEqual([]);
  });

  it("is decided by the dice the same way every time", () => {
    const run = () => {
      const { s, ctx } = game();
      const victim = stripped(homeColony(s, 1), 6, { marines: 6, tanks: 2 });
      invade(ctx, addFleet(s, 0, starOf(s, victim), [{ designId: "transport", count: 3 }]), victim);
      return { owner: victim.ownerId, marines: victim.marinesTrained, tanks: victim.tanksTrained, pop: population(victim) };
    };
    expect(run()).toEqual(run());
  });
});

describe("conquest", () => {
  it("makes the people aliens unless the loser was feudal, the winner telepathic or they return to their own race", () => {
    const people = (races: string[], loserGov?: "feudal") => {
      const { s, ctx } = game(races);
      if (loserGov) s.players[1]!.government = loserGov;
      const c = homeColony(s, 1);
      captureColony(ctx, c, 0);
      return c.aliens;
    };
    expect(people(["terran", "felhari"])).toBeGreaterThan(0);
    expect(people(["terran", "felhari"], "feudal")).toBe(0);
    expect(people(["lysari", "felhari"])).toBe(0);
    expect(people(["felhari", "felhari"])).toBe(0);
  });

  it("sometimes yields a technology the conqueror lacked, and never on a revolt", () => {
    let learned = 0;
    const tries = 40;
    for (let seed = 1; seed <= tries; seed++) {
      const { s, events } = game();
      const ctx = { state: s, rng: new Rng({ s: seed }), emit: (e: unknown) => events.push(e as GameEvent) };
      s.players[1]!.techs.push("fusionBomb");
      s.players[0]!.techs = s.players[0]!.techs.filter((t) => t !== "fusionBomb");
      const before = [...s.players[0]!.techs];
      captureColony(ctx, homeColony(s, 1), 0);
      const gained = s.players[0]!.techs.filter((t) => !before.includes(t));
      if (gained.length > 0) learned++;
      for (const t of gained) expect(before).not.toContain(t);
    }
    expect(learned).toBeGreaterThan(tries * CAPTURE_TECH_CHANCE * 0.5);
    expect(learned).toBeLessThan(tries);

    const { s, ctx } = game();
    s.players[1]!.techs.push("fusionBomb");
    const before = s.players[0]!.techs.length;
    captureColony(ctx, homeColony(s, 1), 0, { revolt: true });
    expect(s.players[0]!.techs.length).toBe(before);
  });

  it("recalls the loser's leaders from the lost system", () => {
    const { s, ctx } = game();
    const c = homeColony(s, 1);
    s.leaders["L1"] = { id: "L1", ownerId: 1, assignedTo: starOf(s, c) } as GameState["leaders"][string];
    captureColony(ctx, c, 0);
    expect(s.leaders["L1"]!.assignedTo).toBe(null);
  });
});

describe("razing and extermination", () => {
  it("kills colonists, and a colony with nobody left is gone", () => {
    const { s, ctx, events } = game();
    const c = stripped(homeColony(s, 1), 3);
    raze(ctx, c, 2);
    expect(population(c)).toBe(1);
    expect(events.some((e) => e.kind === "bombarded" && e.popLost === 2)).toBe(true);
    raze(ctx, c, 5);
    expect(s.colonies[c.id]).toBeUndefined();
    expect(s.planets[c.planetId]!.colonyId).toBe(null);
    expect(events.some((e) => e.kind === "colonyLost" && e.how === "destroyed")).toBe(true);
  });

  it("forbids exterminating your own people, others' colonies or under a democracy", () => {
    const { s } = game();
    const mine = homeColony(s, 0);
    expect(exterminateProblem(s, 0, mine.id)).toMatch(/own people/);
    expect(exterminateProblem(s, 0, homeColony(s, 1).id)).toMatch(/not your colony/);
    mine.raceId = "felhari";
    expect(exterminateProblem(s, 0, mine.id)).toMatch(/democracies/);
    s.players[0]!.government = "dictatorship";
    expect(exterminateProblem(s, 0, mine.id)).toBe(null);
  });

  it("wipes out a conquered alien colony and appalls the other empires", () => {
    const { s, ctx } = game();
    s.players[0]!.government = "dictatorship";
    const c = homeColony(s, 1);
    captureColony(ctx, c, 0);
    const before = s.attitude[1]?.[0] ?? 0;
    exterminate(ctx, 0, c.id);
    expect(s.colonies[c.id]).toBeUndefined();
    expect(s.attitude[1]![0]!).toBeLessThan(before);
  });
});

describe("bombing and mind control after orbital combat", () => {
  /** A cruiser with four nuclear bombs for player 0. */
  const bomber = (s: GameState) => {
    const p = s.players[0]!;
    p.designs.push({ ...structuredClone(p.designs.find((d) => d.id === "frigate")!), id: "bomber", name: "Bomber", hull: "cruiser", weapons: [{ weaponId: "nuclearBomb", count: 4 }] });
    return "bomber";
  };

  it("spends bomb hits on buildings, troops and colonists of a silenced colony", () => {
    const { s, ctx } = game();
    const c = stripped(homeColony(s, 1), 8, { marines: 2 });
    c.buildings = ["marineBarracks", "hydroponicFarm"];
    for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
    // 20 ships × 4 bombs × 7.5 damage = 600 damage: six hits.
    addFleet(s, 0, starOf(s, c), [{ designId: bomber(s), count: 20 }]);
    const before = population(c) + c.buildings.length + (c.marinesTrained ?? 0);
    groundPhase(ctx, new Set([c.id]));
    const after = population(c) + c.buildings.length + (c.marinesTrained ?? 0);
    expect(before - after).toBeGreaterThan(0);
    expect(before - after).toBeLessThanOrEqual(Math.ceil((20 * 4 * 7.5) / BOMB_DAMAGE_PER_HIT));
  });

  it("does nothing while the colony's defenses still stand, or when the fleet is not set to attack", () => {
    const { s, ctx } = game();
    const c = stripped(homeColony(s, 1), 8);
    for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
    const f = addFleet(s, 0, starOf(s, c), [{ designId: bomber(s), count: 20 }]);
    groundPhase(ctx, new Set());
    expect(population(c)).toBe(8);
    f.stance = "defend";
    groundPhase(ctx, new Set([c.id]));
    expect(population(c)).toBe(8);
  });

  it("lets telepaths with a cruiser or larger take a beaten colony without landing troops", () => {
    const { s, ctx } = game(["lysari", "felhari"]);
    const c = homeColony(s, 1);
    for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
    const small = addFleet(s, 0, starOf(s, c), [{ designId: "frigate", count: 1 }]);
    expect(canMindControl(s, small, c)).toBe(false);
    const p = s.players[0]!;
    p.designs.push({ ...structuredClone(p.designs.find((d) => d.id === "frigate")!), id: "mindCruiser", hull: "cruiser" });
    const big = addFleet(s, 0, starOf(s, c), [{ designId: "mindCruiser", count: 1 }]);
    expect(canMindControl(s, big, c)).toBe(true);
    big.invadeTarget = c.id;
    groundPhase(ctx, new Set([c.id]));
    expect(c.ownerId).toBe(0);
    expect(c.aliens).toBe(0);
    expect(big.ships).toHaveLength(1);
  });

  it("can't mind-control telepaths", () => {
    const { s } = game(["lysari", "lysari"]);
    const p = s.players[0]!;
    p.designs.push({ ...structuredClone(p.designs.find((d) => d.id === "frigate")!), id: "mindCruiser", hull: "cruiser" });
    const c = homeColony(s, 1);
    expect(canMindControl(s, addFleet(s, 0, starOf(s, c), [{ designId: "mindCruiser", count: 1 }]), c)).toBe(false);
  });
});
