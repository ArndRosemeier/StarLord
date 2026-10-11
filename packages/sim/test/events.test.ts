import { describe, expect, it } from "vitest";
import {
  attitude,
  DRAGON_BRIBE_PER_POP, EVENTS, EVENT_NUMBERS, EVENT_START, MINERAL_STEPS, Rng, TIERS_BY_ID, absorbResearch, bribeProblem, colonyOutput, derelictFinds,
  fireEvent, monsterDemands, newGame, payBribe, piratesActive, population, randomEventTick, setRelation, setStatus, systemFrozen, type ActiveEvent,
  type Colony, type EventId, type Fleet, type GameEvent, type GameState,
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

function addFleet(s: GameState, ownerId: number, starId: string | null, ships: Fleet["ships"], destStarId?: string): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === (starId ?? s.players[ownerId]!.homeStarId))!;
  const f: Fleet = {
    id: `e${s.nextId++}`, ownerId, x: star.x + (starId ? 0 : 1), y: star.y, starId, destStarId: starId ? null : (destStarId ?? star.id), ships, stance: "attack", name: "Test",
  };
  s.fleets[f.id] = f;
  return f;
}

const shipCount = (f: Fleet) => f.ships.reduce((n, x) => n + x.count, 0);

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

  it("lets each kind of event happen only once a game", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s, ctx } = game({ seed });
      s.settings.randomEvents = true;
      s.turn = 700;
      const all = Object.keys(EVENTS) as EventId[];
      s.eventClock = { last: 0, luck: {}, used: all.filter((k) => k !== "donation") };
      randomEventTick(ctx);
      if (s.eventClock.last === 700) expect(s.eventClock.used!.at(-1)).toBe("donation");
      s.eventClock = { last: 0, luck: {}, used: [...all] };
      randomEventTick(ctx);
      expect(s.eventClock.last).toBe(0);
    }
  });
});

describe("windfalls", () => {
  it("teaches the beam closest above the best anyone has, and the best armor anyone has, from a derelict", () => {
    const { s, ctx, news } = game();
    const [p, q] = [s.players[0]!, s.players[1]!];
    q.techs.push("gaussCannon", "zortriumArmor");
    p.techs = p.techs.filter((t) => t !== "gaussCannon" && t !== "zortriumArmor");
    expect(derelictFinds(s, p)).toEqual(["gaussCannon", "zortriumArmor"]);
    expect(fireEvent(ctx, "derelict", p)).toBe(true);
    expect(p.techs).toContain("gaussCannon");
    expect(p.techs).toContain("zortriumArmor");
    expect(news[0]).toMatch(/derelict/);
    // Nothing left to find once it knows them both and nothing stronger is near.
    p.techs.push("phasor", "fusionBeam", "neutronBlaster", "gravitonBeam", "ionPulseCannon", "plasmaCannon", "disruptorCannon");
    q.techs.push("maulerDevice");
    p.techs.push("maulerDevice");
    expect(derelictFinds(s, p)).toEqual([]);
    expect(fireEvent(ctx, "derelict", p)).toBe(false);
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

  it("raises mineral richness two steps; depletion strikes only ultra rich worlds, one step", () => {
    const { s, ctx } = game();
    const planet = s.planets[home(s, 0).planetId]!;
    planet.minerals = "poor";
    fireEvent(ctx, "mineralDeposit", s.players[0]!);
    expect(planet.minerals).toBe("rich");
    expect(fireEvent(ctx, "mineralDepletion", s.players[0]!)).toBe(false);
    planet.minerals = MINERAL_STEPS.at(-1)!;
    expect(fireEvent(ctx, "mineralDeposit", s.players[0]!)).toBe(false);
    expect(fireEvent(ctx, "mineralDepletion", s.players[0]!)).toBe(true);
    expect(planet.minerals).toBe("rich");
  });

  it("starts a population boom that lasts like the other lasting events", () => {
    const { s, ctx, news } = game();
    expect(fireEvent(ctx, "populationBoom", s.players[0]!)).toBe(true);
    const ev = active(s, "populationBoom")!;
    expect(ev.colonyId).toBe(home(s, 0).id);
    expect(ev.until - s.turn).toBe(EVENT_NUMBERS.lasting.maxTurns);
    // Never over before its sixth turn.
    for (let i = 1; i < EVENT_NUMBERS.lasting.minTurns; i++) tick(ctx);
    expect(active(s, "populationBoom")).toBeDefined();
    while (active(s, "populationBoom")) tick(ctx);
    expect(news.at(-1)).toMatch(/boom on .* has ended/);
  });

  it("finishes the current research at once with a breakthrough, and needs a research goal", () => {
    const { s, ctx } = game();
    const p = s.players[0]!;
    p.research.tierId = null;
    expect(fireEvent(ctx, "breakthrough", p)).toBe(false);
    const tier = Object.values(TIERS_BY_ID).find((t) => !p.tiers.includes(t.id) && !t.hyper)!;
    p.research = { tierId: tier.id, techChoice: tier.techs[0]!, progress: 25 };
    expect(fireEvent(ctx, "breakthrough", p)).toBe(true);
    expect(p.tiers).toContain(tier.id);
    expect(p.techs).toContain(tier.techs[0]);
    expect(p.research).toMatchObject({ tierId: null, progress: 0 });
  });

  it("moves relations by the original's event sizes with a marriage or an assassination, but not between empires at war", () => {
    // Neither race is charismatic, which would double the warmth felt toward it.
    const { s, ctx } = game({ races: ["felhari", "kordex"] });
    expect(fireEvent(ctx, "diplomaticMarriage", s.players[0]!)).toBe(false);
    s.players[0]!.contacts = [1];
    s.players[1]!.contacts = [0];
    const feel = () => [attitude(s, 0, 1), attitude(s, 1, 0)];
    setRelation(s, 0, 1, 0);
    fireEvent(ctx, "diplomaticMarriage", s.players[0]!);
    // +100 at 0 is +100, but without an alliance relations stop at 65.
    expect(feel()).toEqual([65, 65]);
    fireEvent(ctx, "assassination", s.players[0]!);
    // -100 against a friendly empire counts double.
    expect(feel()).toEqual([-100, -100]);
    setStatus(s, 0, 1, "war");
    expect(fireEvent(ctx, "assassination", s.players[0]!)).toBe(false);
  });

  it("carries a fleet in flight to its destination at once through an unstable wormhole", () => {
    const { s, ctx } = game();
    expect(fireEvent(ctx, "unstableWormhole", s.players[0]!)).toBe(false);
    const far = s.galaxy.stars.find((x) => x.id !== s.players[0]!.homeStarId)!;
    const f = addFleet(s, 0, null, [{ designId: "scout", count: 1 }], far.id);
    expect(fireEvent(ctx, "unstableWormhole", s.players[0]!)).toBe(true);
    expect(f.starId).toBe(far.id);
    expect([f.x, f.y]).toEqual([far.x, far.y]);
    expect(f.destStarId).toBe(null);
    expect(s.players[0]!.explored).toContain(far.id);
  });
});

describe("disasters", () => {
  it("lets an earthquake land (rnd(3) + rnd(2)) × (buildings + population) / 10 hits, never killing the last colonist", () => {
    const { s, ctx } = game();
    const c = home(s, 0);
    c.buildings = ["hydroponicFarm", "automatedFactory"];
    const before = population(c) + c.buildings.length;
    expect(fireEvent(ctx, "earthquake", s.players[0]!)).toBe(true);
    const lost = before - population(c) - c.buildings.length;
    expect(lost).toBeGreaterThanOrEqual(1);
    expect(lost).toBeLessThanOrEqual(Math.max(1, Math.floor((5 * before) / 10)));
    c.farmers = 1;
    c.workers = 0;
    c.scientists = 0;
    c.buildings = [];
    expect(fireEvent(ctx, "earthquake", s.players[0]!)).toBe(false);
    expect(population(c)).toBe(1);
  });

  it("kills a share of a colony's people in an industrial accident without changing its climate", () => {
    const { s, ctx } = game();
    const c = home(s, 0);
    c.buildings = [];
    c.farmers = 10;
    c.workers = 0;
    c.scientists = 0;
    const type = s.planets[c.planetId]!.type;
    expect(fireEvent(ctx, "industrialAccident", s.players[0]!)).toBe(true);
    // (rnd(3) + rnd(3)) × 10 / 10 die, plus one more hit.
    expect(10 - population(c)).toBeGreaterThanOrEqual(3);
    expect(10 - population(c)).toBeLessThanOrEqual(7);
    expect(s.planets[c.planetId]!.type).toBe(type);
  });

  it("blows up one ship", () => {
    const { s, ctx } = game();
    const ships = () => Object.values(s.fleets).filter((f) => f.ownerId === 0).reduce((n, f) => n + shipCount(f), 0);
    const before = ships();
    fireEvent(ctx, "shipExplosion", s.players[0]!);
    expect(ships()).toBe(before - 1);
  });

  it("brings a comet that every ship in orbit wears down by its hull size", () => {
    const { s, ctx, news } = game();
    fireEvent(ctx, "comet", s.players[0]!);
    const ev = active(s, "comet")!;
    expect(ev.strength).toBeGreaterThanOrEqual((1 + EVENT_NUMBERS.cometHp.base) * EVENT_NUMBERS.cometHp.mult);
    for (const f of Object.values(s.fleets)) if (f.starId === ev.starId) delete s.fleets[f.id];
    // Someone else's frigates count too: 1 point each.
    addFleet(s, 1, ev.starId!, [{ designId: "frigate", count: 10 }]);
    const hp = ev.strength!;
    tick(ctx);
    expect(ev.strength).toBe(hp - 10);
    addFleet(s, 0, ev.starId!, [{ designId: "frigate", count: 200 }]);
    tick(ctx);
    expect(active(s, "comet")).toBeUndefined();
    expect(news.at(-1)).toMatch(/broke up the comet/);
  });

  it("strikes the colony hard but leaves it standing when nobody stops the comet", () => {
    const { s, ctx, news } = game();
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0) delete s.fleets[f.id];
    fireEvent(ctx, "comet", s.players[0]!);
    const ev = active(s, "comet")!;
    const c = s.colonies[ev.colonyId!]!;
    const pop = population(c);
    while (active(s, "comet")) tick(ctx);
    expect(s.colonies[ev.colonyId!]).toBeDefined();
    expect(population(c)).toBeLessThan(pop);
    expect(news.at(-1)).toMatch(/comet struck/);
  });

  it("sends pirates after freighters, choking trade, until the ships in orbit wear their base down", () => {
    const { s, ctx } = game();
    const p = s.players[0]!;
    p.freighters = 3;
    expect(fireEvent(ctx, "pirates", p)).toBe(false);
    p.freighters = 20;
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0) delete s.fleets[f.id];
    const star = p.homeStarId!;
    // The base's strength comes from the empire's fleets: 30 frigates × 3/5 on Average.
    addFleet(s, 0, s.galaxy.stars.find((x) => x.id !== star)!.id, [{ designId: "frigate", count: 30 }]);
    expect(fireEvent(ctx, "pirates", p)).toBe(true);
    const ev = active(s, "pirates")!;
    expect(ev.strength).toBe(18);
    expect(piratesActive(s, 0)).toBe(true);
    expect(piratesActive(s, 1)).toBe(false);
    tick(ctx);
    // At full strength they always take a freighter.
    expect(p.freighters).toBe(19);
    expect(piratesActive(s, 0)).toBe(true);
    addFleet(s, 0, star, [{ designId: "frigate", count: 18 }]);
    tick(ctx);
    expect(piratesActive(s, 0)).toBe(false);
  });

  it("lets a pirate raid steal 30 to 50% of the treasury", () => {
    const { s, ctx } = game();
    s.players[0]!.bc = 99;
    expect(fireEvent(ctx, "pirateRaid", s.players[0]!)).toBe(false);
    s.players[0]!.bc = 1000;
    expect(fireEvent(ctx, "pirateRaid", s.players[0]!)).toBe(true);
    expect(s.players[0]!.bc).toBeGreaterThanOrEqual(500);
    expect(s.players[0]!.bc).toBeLessThanOrEqual(700);
  });

  it("takes a colony's research for a plague cure that costs a few turns of it, and the cure ends it", () => {
    const { s, ctx, news } = game();
    const c = home(s, 0);
    c.scientists += 2;
    c.farmers -= 2;
    const rp = Math.floor(colonyOutput(s, c).research);
    expect(rp).toBeGreaterThan(0);
    expect(fireEvent(ctx, "plague", s.players[0]!)).toBe(true);
    expect(fireEvent(ctx, "plague", s.players[0]!)).toBe(false);
    const ev = active(s, "plague")!;
    // research × (rnd(8) + 2 × difficulty), Average = 2.
    expect(ev.strength! % rp).toBe(0);
    expect(ev.strength! / rp).toBeGreaterThanOrEqual(5);
    expect(ev.strength! / rp).toBeLessThanOrEqual(12);
    expect(absorbResearch(s, c, 30)).toBe(0);
    expect(ev.progress).toBe(30);
    expect(absorbResearch(s, home(s, 1), 30)).toBe(30);
    // It never burns out by itself.
    s.turn += 100;
    tick(ctx);
    expect(active(s, "plague")).toBeDefined();
    absorbResearch(s, c, ev.strength!);
    tick(ctx);
    expect(active(s, "plague")).toBeUndefined();
    expect(news.at(-1)).toMatch(/cure/);
  });

  it("threatens a colonised star with a supernova that needs its turns × the system's research to stop", () => {
    const { s, ctx } = game();
    for (const c of Object.values(s.colonies)) if (c.ownerId === 1) delete s.colonies[c.id];
    const c = home(s, 0);
    c.scientists += 2;
    c.farmers -= 2;
    expect(fireEvent(ctx, "supernova")).toBe(true);
    const ev = active(s, "supernova")!;
    expect(ev.starId).toBe(starOf(s, c));
    const turns = ev.until - s.turn;
    expect(ev.strength).toBe(turns * Math.floor(colonyOutput(s, c).research));
    expect(absorbResearch(s, c, 1)).toBe(0);
    while (active(s, "supernova")) tick(ctx);
    expect(s.colonies[c.id]).toBeUndefined();
    expect(s.planets[c.planetId]!.type).toBe("radiated");

    const saved = game();
    for (const x of Object.values(saved.s.colonies)) if (x.ownerId === 1) delete saved.s.colonies[x.id];
    const h = home(saved.s, 0);
    h.scientists += 2;
    h.farmers -= 2;
    fireEvent(saved.ctx, "supernova");
    absorbResearch(saved.s, h, active(saved.s, "supernova")!.strength!);
    tick(saved.ctx);
    expect(active(saved.s, "supernova")).toBeUndefined();
    expect(saved.s.colonies[h.id]).toBeDefined();
  });

  it("freezes a system in a time-space anomaly", () => {
    const { s, ctx } = game();
    const star = starOf(s, home(s, 0));
    expect(systemFrozen(s, star)).toBe(false);
    fireEvent(ctx, "timeSpaceAnomaly", s.players[0]!);
    expect(systemFrozen(s, star)).toBe(true);
  });

  it("uses up the warp funnel without any effect, as the original does", () => {
    const { s, ctx } = game();
    const f = addFleet(s, 0, null, [{ designId: "scout", count: 1 }]);
    expect(fireEvent(ctx, "warpFunnel", s.players[0]!)).toBe(true);
    expect(s.activeEvents).toEqual([]);
    expect(f.starId).toBe(null);
  });

  it("lets the warp beast destroy a ship in flight every turn, turning from victim to victim but never on lucky empires", () => {
    const { s, ctx } = game();
    const mine = addFleet(s, 0, null, [{ designId: "scout", count: 10 }]);
    const theirs = addFleet(s, 1, null, [{ designId: "scout", count: 10 }]);
    fireEvent(ctx, "warpBeast", s.players[0]!);
    for (let i = 0; i < 4; i++) tick(ctx);
    expect(shipCount(mine) + shipCount(theirs)).toBe(16);
    expect(shipCount(mine)).toBe(8);

    const lucky = game({ races: ["quillan", "felhari"] });
    const charmed = addFleet(lucky.s, 0, null, [{ designId: "scout", count: 10 }]);
    addFleet(lucky.s, 1, null, [{ designId: "scout", count: 10 }]);
    fireEvent(lucky.ctx, "warpBeast", lucky.s.players[1]!);
    for (let i = 0; i < 4; i++) tick(lucky.ctx);
    expect(shipCount(charmed)).toBe(10);
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

  it("need the monsters setting, and may head for the homeworld", () => {
    const off = game();
    outerColony(off.s, 0);
    expect(fireEvent(off.ctx, "hydra", off.s.players[0]!)).toBe(false);
    const homeOnly = game({ monsters: true });
    expect(fireEvent(homeOnly.ctx, "hydra", homeOnly.s.players[0]!)).toBe(true);
    const ev = homeOnly.s.activeEvents!.find((e) => e.kind === "hydra")!;
    expect(ev.starId).toBe(homeOnly.s.players[0]!.homeStarId);
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
