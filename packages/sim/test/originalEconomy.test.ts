import { describe, expect, it } from "vitest";
import {
  ASSIMILATION, BANKRUPTCY, BUILDINGS_BY_ID, CACHE_BC, DEBRIS_BC, NATIVES_POP, NATIVE_FOOD_BONUS, Rng, SPLINTER_POP,
  assimilationPoints, colonyOutput, computeOutput, explore, foodPlan, newGame, population, processTurn,
  type Colony, type GameState, type TurnContext,
} from "@starlord/sim";

/** Rules checked against the original program (economy, colonies and one-time specials). */
const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

function game(seed = "orig-eco"): GameState {
  return newGame({ seed, races: ["terran", "felhari"], ...quiet });
}

function home(s: GameState, owner = 0): Colony {
  return Object.values(s.colonies).find((c) => c.ownerId === owner && !c.outpost)!;
}

function ctxOf(s: GameState): TurnContext {
  return { state: s, rng: new Rng(s.rng), emit: () => {} };
}

/** A star player 0 has not explored yet, with at least one planet. */
function unexplored(s: GameState) {
  return s.galaxy.stars.find((st) => !s.players[0]!.explored.includes(st.id) && st.planetIds.length > 0 && !st.special)!;
}

describe("assimilation", () => {
  it("earns 240 points per unit at the government's rate, carrying the rest over", () => {
    const s = game();
    const p = s.players[0]!;
    const c = home(s);
    // Player 1 has no charisma pick; player 0's charismatic rulers earn twice as much.
    const q = s.players[1]!;
    q.government = "feudal";
    expect(assimilationPoints(q, c)).toBe(30);
    q.government = "galacticUnification";
    expect(assimilationPoints(q, c)).toBe(16);
    p.government = "galacticUnification";
    expect(assimilationPoints(p, c)).toBe(32);
    c.buildings.push("alienManagementCenter");
    expect(assimilationPoints(q, c)).toBe(ASSIMILATION.pointsPerUnit / 2);
    expect(assimilationPoints(p, c)).toBe(ASSIMILATION.pointsPerUnit);
  });
});

describe("freighters", () => {
  it("charge half a BC per freighter in use, rounded down", () => {
    const s = game();
    const h = home(s);
    h.farmers = population(h);
    h.workers = h.scientists = 0;
    const rock = Object.values(s.planets).find((p) => !p.colonyId)!;
    rock.type = "barren";
    const c: Colony = {
      id: "cx1", planetId: rock.id, ownerId: 0, raceId: s.players[0]!.raceId, name: "Rock", outpost: false,
      farmers: 0, workers: 3, scientists: 0, growthK: 0, buildings: [], queue: [], progress: 0, founded: 1, terraformed: 0,
    };
    rock.colonyId = c.id;
    s.colonies[c.id] = c;
    s.players[0]!.freighters = 10;
    const plan = foodPlan(s, 0);
    expect(plan.carryingFood).toBe(3);
    expect(plan.upkeep).toBe(1);
  });
});

describe("natives", () => {
  it("join as three farmers who grow their bonus before morale", () => {
    const s = game();
    const c = home(s);
    const planet = s.planets[c.planetId]!;
    const p = s.players[0]!;
    p.isHuman = true;
    // An Alien Management Center keeps the multi-race morale penalty out of the comparison.
    c.buildings.push("alienManagementCenter");
    c.workers += c.farmers;
    c.farmers = 0;
    const before = computeOutput(planet, p, c).foodProduced;
    const withNatives = { ...c, farmers: c.farmers + NATIVES_POP, natives: NATIVES_POP };
    const after = computeOutput(planet, p, withNatives).foodProduced;
    // Terran land gives 2 per farmer; natives add their own 2 before morale.
    const morale = computeOutput(planet, p, c).morale;
    const each = (2 + NATIVE_FOOD_BONUS) * (100 + morale) / 100;
    expect(after - before).toBeCloseTo(Math.round(2 * NATIVES_POP * each) / 2, 5);
  });
});

describe("exploration specials", () => {
  it("pays a fixed sum for a pirate cache or debris", () => {
    for (const [feature, bc] of [["cache", CACHE_BC], ["debris", DEBRIS_BC]] as const) {
      const s = game();
      const star = unexplored(s);
      star.feature = feature;
      const was = s.players[0]!.bc;
      explore(ctxOf(s), 0, star.id);
      expect(s.players[0]!.bc - was).toBe(bc);
    }
  });

  it("founds a splinter colony of three", () => {
    const s = game();
    const star = unexplored(s);
    const planet = s.planets[star.planetIds[0]!]!;
    planet.type = "terran";
    planet.size = "large";
    planet.special = "splinter";
    explore(ctxOf(s), 0, star.id);
    const c = Object.values(s.colonies).find((x) => x.planetId === planet.id)!;
    expect(population(c)).toBe(SPLINTER_POP);
  });

  it("teaches the first explorer of ancient artifacts a technology from an open field", () => {
    const s = game();
    const star = unexplored(s);
    const planet = s.planets[star.planetIds[0]!]!;
    planet.special = "artifacts";
    const p = s.players[0]!;
    const techs = p.techs.length;
    const tiers = p.tiers.length;
    explore(ctxOf(s), 0, star.id);
    expect(planet.artifactsClaimed).toBe(true);
    expect(p.tiers.length - tiers).toBeGreaterThanOrEqual(1);
    expect(p.techs.length).toBeGreaterThan(techs);
    // Nobody else gets them.
    const t1 = s.players[1]!.techs.length;
    explore(ctxOf(s), 1, star.id);
    expect(s.players[1]!.techs.length).toBe(t1);
  });
});

describe("time-space anomaly", () => {
  it("freezes the colony: no output, upkeep or growth", () => {
    const s = game();
    const c = home(s);
    const starId = s.planets[c.planetId]!.starId;
    s.activeEvents = [{ id: "e1", kind: "timeSpaceAnomaly", playerId: 0, starId, until: s.turn + 10 }];
    const o = colonyOutput(s, c);
    expect(o.foodProduced + o.industry + o.research + o.bc + o.maintenance + o.growthK).toBe(0);
    expect(o.population).toBe(population(c));
    c.growthK = 900;
    const next = processTurn(s, {});
    expect(next.colonies[c.id]!.growthK).toBe(900);
  });
});

describe("empty build queue", () => {
  it("sells the turn's industry and keeps stored production", () => {
    const s = game();
    const c = home(s);
    c.queue = [];
    c.progress = 37;
    const next = processTurn(s, {});
    expect(next.colonies[c.id]!.progress).toBe(37);
  });
});

describe("elimination", () => {
  it("ends an empire with its last populated colony, colony ship or not", () => {
    const s = game();
    for (const c of Object.values(s.colonies)) if (c.ownerId === 1) {
      s.planets[c.planetId]!.colonyId = null;
      delete s.colonies[c.id];
    }
    const next = processTurn(s, {});
    expect(next.players[1]!.alive).toBe(false);
  });
});

describe("bankruptcy", () => {
  it("sells buildings with upkeep first, the least valuable first, never the Capitol", () => {
    const s = game();
    const c = home(s);
    s.players[0]!.government = "dictatorship";
    c.buildings = ["capitol", "soilEnrichment", "marineBarracks", "hydroponicFarm", "researchLab"];
    s.players[0]!.bc = -100000;
    const next = processTurn(s, {});
    const sold = next.events.filter((e) => e.kind === "random" && /Debt forced/.test((e as { what: string }).what))
      .map((e) => (e as { what: string }).what);
    // Research Laboratory (60) is worth its cost, the Hydroponic Farm 6x, the only barracks 8x under a dictatorship;
    // Soil Enrichment has no upkeep and goes last.
    expect(sold[0]).toContain("Research Laboratory");
    expect(sold[1]).toContain("Hydroponic Farm");
    expect(sold[2]).toContain("Marine Barracks");
    expect(sold[3]).toContain("Soil Enrichment");
    expect(next.colonies[c.id]!.buildings).toEqual(["capitol"]);
    expect(BANKRUPTCY.refund).toBe(0.5);
  });
});

describe("barracks", () => {
  it("train up to a share of the population and shed troops above the size cap", () => {
    const s = game();
    const c = home(s);
    c.buildings = c.buildings.filter((b) => !BUILDINGS_BY_ID[b]?.effects.training);
    c.buildings.push("marineBarracks");
    c.marinesTrained = 20;
    const next = processTurn(s, {});
    expect(next.colonies[c.id]!.marinesTrained).toBe(19);
  });
});
