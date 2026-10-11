import { describe, expect, it } from "vitest";
import {
  DRAGON_BRIBE_PER_POP, EVENT_NUMBERS, EVENT_START, MINERAL_STEPS, RESEARCH, Rng, TIERS_BY_ID, absorbResearch, bribeProblem, fireEvent, monsterDemands,
  newGame, payBribe, piratesActive, population, randomEventTick, researchCost, systemFrozen, type ActiveEvent, type Colony, type Fleet,
  type GameEvent, type GameState,
} from "@starlord/sim";

type Ctx = Parameters<typeof fireEvent>[0];

function game(opts: { races?: string[]; monsters?: boolean; seed?: number } = {}): { s: GameState; ctx: Ctx; news: string[] } {
  const s = newGame({
    seed: "events", races: opts.races ?? ["terran", "felhari"], monsters: opts.monsters ?? false, raiders: false, council: false, randomEvents: false,
  });
  const news: string[] = [];
  const ctx = {
    state: s, rng: new Rng({ s: opts.seed ?? 3 }),
    emit: (e: unknown) => {
      const ev = e as GameEvent;
      if (ev.kind === "random") news.push(ev.what);
    },
  };
  s.activeEvents = [];
  return { s, ctx, news };
}

const home = (s: GameState, pid: number): Colony => Object.values(s.colonies).find((c) => c.ownerId === pid && s.planets[c.planetId]!.starId === s.players[pid]!.homeStarId)!;
const starOf = (s: GameState, c: Colony) => s.planets[c.planetId]!.starId;
const active = (s: GameState, kind: string): ActiveEvent | undefined => s.activeEvents!.find((e) => e.kind === kind);

/** Settles a second colony for a player in another system. */
function outerColony(s: GameState, pid: number): Colony {
  const taken = new Set(Object.values(s.colonies).map((c) => starOf(s, c)));
  const planet = Object.values(s.planets).find(
    (p) => p.colonyId === null && !taken.has(p.starId) && p.type !== "gasGiant" && p.type !== "asteroids",
  )!;
  const c: Colony = { ...structuredClone(home(s, pid)), id: `oc${s.nextId++}`, planetId: planet.id, name: "Outer", buildings: [], farmers: 4, workers: 0, scientists: 0 };
  s.colonies[c.id] = c;
  planet.colonyId = c.id;
  return c;
}

function addFleet(s: GameState, ownerId: number, starId: string | null, ships: Fleet["ships"]): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === (starId ?? s.players[ownerId]!.homeStarId))!;
  const f: Fleet = { id: `e${s.nextId++}`, ownerId, x: star.x + (starId ? 0 : 1), y: star.y, starId, destStarId: starId ? null : star.id, ships, stance: "attack", name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

/** Runs the lasting events forward one turn. */
function tick(ctx: Ctx): void {
  ctx.state.turn++;
  randomEventTick(ctx);
}

describe("random event timing", () => {
  it("never strikes before turn 50 or within five turns of the last one", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { s, ctx } = game({ seed });
      s.settings.randomEvents = true;
      s.eventClock = { last: -1000, luck: {} };
      s.turn = EVENT_START - 1;
      randomEventTick(ctx);
      expect(s.eventClock.last).toBe(-1000);
      s.eventClock.last = 600;
      s.turn = 605;
      randomEventTick(ctx);
      expect(s.eventClock.last).toBe(600);
    }
  });

  it("strikes almost surely after a long quiet spell", () => {
    let struck = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { s, ctx } = game({ seed });
      s.settings.randomEvents = true;
      s.turn = 700;
      s.eventClock = { last: 0, luck: {} };
      randomEventTick(ctx);
      if (s.eventClock.last === 700) struck++;
    }
    expect(struck).toBeGreaterThan(20);
  });
});

describe("windfalls", () => {
  it("finds a technology on a derelict", () => {
    const { s, ctx, news } = game();
    const p = s.players[0]!;
    const before = p.techs.length;
    expect(fireEvent(ctx, "derelict", p)).toBe(true);
    expect(p.techs.length).toBeGreaterThan(before);
    expect(news[0]).toMatch(/derelict/);
  });

  it("turns a harsh world terran with an axis shift, but not one that already is", () => {
    const { s, ctx } = game();
    const c = home(s, 0);
    const planet = s.planets[c.planetId]!;
    planet.type = "terran";
    expect(fireEvent(ctx, "axisShift", s.players[0]!)).toBe(false);
    planet.type = "barren";
    expect(fireEvent(ctx, "axisShift", s.players[0]!)).toBe(true);
    expect(planet.type).toBe("terran");
  });

  it("raises mineral richness two steps, and depletion lowers it one, within the scale", () => {
    const { s, ctx } = game();
    const planet = s.planets[home(s, 0).planetId]!;
    planet.minerals = "poor";
    fireEvent(ctx, "mineralDeposit", s.players[0]!);
    expect(planet.minerals).toBe("rich");
    fireEvent(ctx, "mineralDepletion", s.players[0]!);
    expect(planet.minerals).toBe("abundant");
    planet.minerals = MINERAL_STEPS.at(-1)!;
    expect(fireEvent(ctx, "mineralDeposit", s.players[0]!)).toBe(false);
    planet.minerals = MINERAL_STEPS[0]!;
    expect(fireEvent(ctx, "mineralDepletion", s.players[0]!)).toBe(false);
  });

  it("starts a population boom of 10 to 20 turns", () => {
    const { s, ctx } = game();
    fireEvent(ctx, "populationBoom", s.players[0]!);
    const ev = active(s, "populationBoom")!;
    expect(ev.colonyId).toBe(home(s, 0).id);
    expect(ev.until - s.turn).toBeGreaterThanOrEqual(EVENT_NUMBERS.boomTurns[0]);
    expect(ev.until - s.turn).toBeLessThanOrEqual(EVENT_NUMBERS.boomTurns[1]);
  });

  it("completes the current research with a breakthrough, and needs a research goal", () => {
    const { s, ctx } = game();
    const p = s.players[0]!;
    p.research.tierId = null;
    expect(fireEvent(ctx, "breakthrough", p)).toBe(false);
    const tier = Object.values(TIERS_BY_ID).find((t) => !p.tiers.includes(t.id) && !t.hyper)!;
    p.research = { tierId: tier.id, techChoice: tier.techs[0]!, progress: 0 };
    expect(fireEvent(ctx, "breakthrough", p)).toBe(true);
    expect(p.research.progress).toBe(researchCost(p, tier) * RESEARCH.maxCostMult);
  });

  it("warms relations both ways with a marriage and sours them with an assassination", () => {
    // Neither race is charismatic, which would double the warmth felt toward it.
    const { s, ctx } = game({ races: ["felhari", "kordex"] });
    expect(fireEvent(ctx, "diplomaticMarriage", s.players[0]!)).toBe(false);
    s.players[0]!.contacts = [1];
    s.players[1]!.contacts = [0];
    const feel = () => [s.attitude[0]?.[1] ?? 0, s.attitude[1]?.[0] ?? 0];
    const before = feel();
    fireEvent(ctx, "diplomaticMarriage", s.players[0]!);
    expect(feel().map((x, i) => x - before[i]!)).toEqual([EVENT_NUMBERS.attitudeShift, EVENT_NUMBERS.attitudeShift]);
    fireEvent(ctx, "assassination", s.players[0]!);
    expect(feel()).toEqual(before);
  });

  it("flings a fleet in flight to a random star through an unstable wormhole", () => {
    const { s, ctx } = game();
    expect(fireEvent(ctx, "unstableWormhole", s.players[0]!)).toBe(false);
    const f = addFleet(s, 0, null, [{ designId: "scout", count: 1 }]);
    expect(fireEvent(ctx, "unstableWormhole", s.players[0]!)).toBe(true);
    expect(f.starId).not.toBe(null);
    expect(f.destStarId).toBe(null);
    expect(s.players[0]!.explored).toContain(f.starId);
  });
});

describe("disasters", () => {
  it("lets an earthquake kill at most two and never the last colonist", () => {
    const { s, ctx } = game();
    const c = home(s, 0);
    const pop = population(c);
    fireEvent(ctx, "earthquake", s.players[0]!);
    expect(pop - population(c)).toBeLessThanOrEqual(2);
    c.farmers = 1;
    c.workers = 0;
    c.scientists = 0;
    c.buildings = [];
    expect(fireEvent(ctx, "earthquake", s.players[0]!)).toBe(false);
    expect(population(c)).toBe(1);
  });

  it("blows up one ship", () => {
    const { s, ctx } = game();
    const ships = () => Object.values(s.fleets).filter((f) => f.ownerId === 0).reduce((n, f) => n + f.ships.reduce((m, x) => m + x.count, 0), 0);
    const before = ships();
    fireEvent(ctx, "shipExplosion", s.players[0]!);
    expect(ships()).toBe(before - 1);
  });

  it("brings a comet that warships in orbit can break up", () => {
    const { s, ctx, news } = game();
    fireEvent(ctx, "comet", s.players[0]!);
    const ev = active(s, "comet")!;
    expect(ev.strength).toBeGreaterThanOrEqual((1 + EVENT_NUMBERS.cometHp.base) * EVENT_NUMBERS.cometHp.mult);
    addFleet(s, 0, ev.starId!, [{ designId: "frigate", count: 40 }]);
    tick(ctx);
    expect(active(s, "comet")).toBeUndefined();
    expect(s.colonies[ev.colonyId!]).toBeDefined();
    expect(news.at(-1)).toMatch(/broke up the comet/);
  });

  it("wipes out the colony when nobody stops the comet", () => {
    const { s, ctx } = game();
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0) delete s.fleets[f.id];
    fireEvent(ctx, "comet", s.players[0]!);
    const ev = active(s, "comet")!;
    while (s.turn < ev.until) tick(ctx);
    expect(s.colonies[ev.colonyId!]).toBeUndefined();
  });

  it("lets pirates choke trade until warships come to their system", () => {
    const { s, ctx } = game();
    s.players[0]!.bc = 500;
    fireEvent(ctx, "pirates", s.players[0]!);
    expect(piratesActive(s, 0)).toBe(true);
    tick(ctx);
    expect(piratesActive(s, 0)).toBe(true);
    addFleet(s, 0, active(s, "pirates")!.starId!, [{ designId: "frigate", count: EVENT_NUMBERS.pirateHunterSize }]);
    tick(ctx);
    expect(piratesActive(s, 0)).toBe(false);
  });

  it("takes a colony's research for a plague cure, and the cure ends it", () => {
    const { s, ctx, news } = game();
    const c = home(s, 0);
    expect(fireEvent(ctx, "plague", s.players[0]!)).toBe(true);
    expect(fireEvent(ctx, "plague", s.players[0]!)).toBe(false);
    const ev = active(s, "plague")!;
    expect(absorbResearch(s, c, 30)).toBe(0);
    expect(ev.progress).toBe(30);
    expect(absorbResearch(s, home(s, 1), 30)).toBe(30);
    absorbResearch(s, c, ev.strength!);
    tick(ctx);
    expect(active(s, "plague")).toBeUndefined();
    expect(news.at(-1)).toMatch(/cure/);
  });

  it("threatens only systems away from home with a supernova, which destroys them unless research stops it", () => {
    const { s, ctx } = game();
    expect(fireEvent(ctx, "supernova", s.players[0]!)).toBe(false);
    const outer = outerColony(s, 0);
    expect(fireEvent(ctx, "supernova", s.players[0]!)).toBe(true);
    const ev = active(s, "supernova")!;
    expect(ev.starId).toBe(starOf(s, outer));
    expect(absorbResearch(s, home(s, 0), 10)).toBe(10);
    expect(absorbResearch(s, outer, 10)).toBe(0);
    while (s.turn < ev.until) tick(ctx);
    expect(s.colonies[outer.id]).toBeUndefined();
    expect(s.colonies[home(s, 0).id]).toBeDefined();

    const saved = game();
    const c = outerColony(saved.s, 0);
    fireEvent(saved.ctx, "supernova", saved.s.players[0]!);
    absorbResearch(saved.s, c, active(saved.s, "supernova")!.strength!);
    tick(saved.ctx);
    expect(active(saved.s, "supernova")).toBeUndefined();
    expect(saved.s.colonies[c.id]).toBeDefined();
  });

  it("freezes a system in a time-space anomaly", () => {
    const { s, ctx } = game();
    const star = starOf(s, home(s, 0));
    expect(systemFrozen(s, star)).toBe(false);
    fireEvent(ctx, "timeSpaceAnomaly", s.players[0]!);
    expect(systemFrozen(s, star)).toBe(true);
  });

  it("traps a fleet in flight in a warp funnel", () => {
    const { s, ctx } = game();
    expect(fireEvent(ctx, "warpFunnel", s.players[0]!)).toBe(false);
    const f = addFleet(s, 0, null, [{ designId: "scout", count: 1 }]);
    fireEvent(ctx, "warpFunnel", s.players[0]!);
    expect(active(s, "warpFunnel")!.fleetId).toBe(f.id);
  });

  it("lets the warp beast eat ships in flight, but not those of lucky empires", () => {
    const run = (races: string[]) => {
      const { s, ctx } = game({ races });
      const f = addFleet(s, 0, null, [{ designId: "scout", count: 10 }]);
      fireEvent(ctx, "warpBeast");
      for (let i = 0; i < 4; i++) tick(ctx);
      return f.ships.reduce((n, x) => n + x.count, 0);
    };
    expect(run(["terran", "felhari"])).toBeLessThan(10);
    expect(run(["quillan", "felhari"])).toBe(10);
  });
});

describe("monsters from beyond the rim", () => {
  /** A monster invasion of player 0's outer colony, with the monster already arrived. */
  const arrived = (kind: "amoeba" | "crystal" | "dragon" | "eel" | "hydra") => {
    const g = game({ monsters: true });
    const outer = outerColony(g.s, 0);
    expect(fireEvent(g.ctx, kind, g.s.players[0]!)).toBe(true);
    const ev = active(g.s, kind)!;
    const f = g.s.fleets[ev.fleetId!]!;
    expect(f.destStarId).toBe(starOf(g.s, outer));
    const star = g.s.galaxy.stars.find((x) => x.id === ev.starId)!;
    Object.assign(f, { starId: star.id, destStarId: null, x: star.x, y: star.y });
    return { ...g, outer, ev, f };
  };

  it("need the monsters setting and a colony away from home", () => {
    const off = game();
    outerColony(off.s, 0);
    expect(fireEvent(off.ctx, "hydra", off.s.players[0]!)).toBe(false);
    const homeOnly = game({ monsters: true });
    expect(fireEvent(homeOnly.ctx, "hydra", homeOnly.s.players[0]!)).toBe(false);
  });

  it("hydra kills half the colonists", () => {
    const { ctx, outer } = arrived("hydra");
    tick(ctx);
    expect(population(outer)).toBe(2);
  });

  it("crystal drains every colony in the system", () => {
    const { s, ctx, outer } = arrived("crystal");
    tick(ctx);
    expect(s.colonies[outer.id]).toBeUndefined();
  });

  it("amoeba leaves the system's worlds toxic", () => {
    const { s, ctx, outer } = arrived("amoeba");
    tick(ctx);
    expect(s.planets[outer.planetId]!.type).toBe("toxic");
  });

  it("eel blockades the system", () => {
    const { ctx, ev, news } = arrived("eel");
    tick(ctx);
    expect(ev.progress).toBe(1);
    expect(news.at(-1)).toMatch(/blockading/);
  });

  it("wyrm asks a bribe by population, which sends it away when paid", () => {
    const { s, ctx, ev, f } = arrived("dragon");
    tick(ctx);
    expect(ev.strength).toBe(4 * DRAGON_BRIBE_PER_POP);
    expect(monsterDemands(s, 0).map((e) => e.id)).toEqual([ev.id]);
    expect(monsterDemands(s, 1)).toEqual([]);
    s.players[0]!.bc = ev.strength! - 1;
    expect(bribeProblem(s, 0, ev.id)).toMatch(/not enough BC/);
    expect(bribeProblem(s, 1, ev.id)).toMatch(/no colony/);
    s.players[0]!.bc = 100;
    payBribe(ctx, 0, ev.id);
    expect(s.players[0]!.bc).toBe(100 - ev.strength!);
    expect(s.fleets[f.id]).toBeUndefined();
    expect(active(s, "dragon")).toBeUndefined();
  });

  it("wyrm pillages the system when nobody pays", () => {
    const { s, ctx, outer } = arrived("dragon");
    outer.buildings = ["hydroponicFarm"];
    tick(ctx);
    tick(ctx);
    expect(population(outer)).toBe(2);
    expect(outer.buildings).toEqual([]);
    expect(monsterDemands(s, 0)).toEqual([]);
  });

  it("ends when the monster is destroyed, and the monster leaves when its time is up", () => {
    const killed = arrived("eel");
    delete killed.s.fleets[killed.f.id];
    tick(killed.ctx);
    expect(active(killed.s, "eel")).toBeUndefined();

    const left = arrived("eel");
    left.s.turn = left.ev.until - 1;
    tick(left.ctx);
    expect(active(left.s, "eel")).toBeUndefined();
    expect(left.s.fleets[left.f.id]).toBeUndefined();
  });
});
