import { describe, expect, it } from "vitest";
import {
  ASSIMILATION, FREIGHTERS, GOVERNMENTS, availableBuildings, colonyMorale, commandPointsAvailable, computeOutput, foodPlan,
  colonyPollution, itemCost, newGame, population, processTurn, surplusFoodBc, getRace, validateCommand,
  type Colony, type Fleet, type GameState,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

function game(seed = "eco"): GameState {
  const s = newGame({ seed, races: ["terran", "felhari"], ...quiet });
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  return s;
}

function home(s: GameState, owner = 0): Colony {
  return Object.values(s.colonies).find((c) => c.ownerId === owner && !c.outpost)!;
}

/** Settles a free planet of the home system (or anywhere) as a barren rock with workers only. */
function barrenColony(s: GameState, owner = 0, workers = 2): Colony {
  const planet = Object.values(s.planets).find((p) => !p.colonyId)!;
  planet.type = "barren";
  planet.gravity = "normal";
  const c: Colony = {
    id: `cx${s.nextId++}`, planetId: planet.id, ownerId: owner, raceId: s.players[owner]!.raceId, name: "Rock", outpost: false,
    farmers: 0, workers, scientists: 0, growthK: 0, buildings: [], queue: [], progress: 0, founded: 1, terraformed: 0, unrestUntil: 0,
  };
  planet.colonyId = c.id;
  s.colonies[c.id] = c;
  return c;
}

const out = (s: GameState, c: Colony) => computeOutput(s.planets[c.planetId]!, s.players[c.ownerId]!, c, { turn: s.turn });

describe("food and freighters", () => {
  it("lets a colony that can't farm starve without freighters, and feeds it with them", () => {
    const s = game();
    const h = home(s);
    h.farmers = population(h);
    h.workers = 0;
    h.scientists = 0;
    const rock = barrenColony(s);
    s.players[0]!.freighters = 0;
    expect(foodPlan(s, 0).shortfall[rock.id]).toBeGreaterThan(0);
    const next = processTurn(s, {});
    expect(population(next.colonies[rock.id]!)).toBe(1);

    s.players[0]!.freighters = FREIGHTERS.perFleet;
    const plan = foodPlan(s, 0);
    expect(plan.shortfall[rock.id]).toBeUndefined();
    expect(plan.carryingFood).toBe(2);
    expect(plan.upkeep).toBeCloseTo(2 * FREIGHTERS.upkeepInUse);
  });

  it("sells surplus food nobody needs at the race's price", () => {
    const s = game();
    const h = home(s);
    h.farmers = population(h);
    h.workers = 0;
    h.scientists = 0;
    const plan = foodPlan(s, 0);
    expect(plan.sold).toBeCloseTo(out(s, h).foodNet);
    expect(plan.saleBC).toBeCloseTo(plan.sold * surplusFoodBc(getRace(s.players[0]!.raceId)));
  });

  it("moves colonists only with enough idle freighters", () => {
    const s = game();
    const rock = barrenColony(s);
    const cmd = { type: "moveColonists" as const, fromColonyId: home(s).id, toColonyId: rock.id, count: 1 };
    expect(validateCommand(s, 0, cmd).ok).toBe(false);
    s.players[0]!.freighters = FREIGHTERS.perColonist + 5;
    expect(validateCommand(s, 0, cmd).ok).toBe(true);
  });
});

describe("colony production", () => {
  it("works pollution out like the original: cleanup rounds up, half the excess is lost", () => {
    const s = game();
    const h = home(s);
    const planet = { ...s.planets[h.planetId]!, size: "medium" as const };
    const p = s.players[0]!;
    const race = getRace("terran");
    // Medium tolerance is 6: 20 polluting industry loses ceil(14 / 2) = 7.
    expect(colonyPollution(planet, race, p, [], 20, 8, 0)).toBe(7);
    // The processor halves to 10 (2 lost), the renewer quarters that to 3 (none lost).
    expect(colonyPollution(planet, race, p, ["pollutionProcessor"], 20, 8, 0)).toBe(2);
    expect(colonyPollution(planet, race, p, ["pollutionProcessor", "atmosphericRenewer"], 20, 8, 0)).toBe(0);
    expect(colonyPollution(planet, race, p, ["coreWasteDumps"], 20, 8, 0)).toBe(0);
    // Androids don't pollute: half the people here are androids.
    expect(colonyPollution(planet, race, p, [], 20, 4, 4)).toBe(4);
  });

  it("gives the robotic factory more on richer worlds", () => {
    const s = game();
    const h = home(s);
    const planet = s.planets[h.planetId]!;
    s.players[0]!.taxRate = 0;
    const gain = (minerals: typeof planet.minerals) => {
      planet.minerals = minerals;
      const before = out(s, { ...h, buildings: [] }).industryGross;
      return out(s, { ...h, buildings: ["roboticFactory"] }).industryGross - before;
    };
    expect(gain("rich") / gain("poor")).toBeCloseTo(15 / 8);
  });

  it("scales BC with morale, except under unification", () => {
    const s = game();
    const h = home(s);
    const p = s.players[0]!;
    p.government = "dictatorship";
    const plain = out(s, { ...h, buildings: ["marineBarracks"] });
    const happy = out(s, { ...h, buildings: ["marineBarracks", "holoSimulator"] });
    expect(happy.morale).toBeGreaterThan(plain.morale);
    expect(happy.bc).toBeGreaterThan(plain.bc);
    p.government = "unification";
    expect(out(s, { ...h, buildings: ["holoSimulator"] }).morale).toBe(0);
  });
});

describe("governments", () => {
  it("gives the imperium half again as many command points", () => {
    const s = game();
    const p = s.players[0]!;
    p.government = "dictatorship";
    const base = commandPointsAvailable(s, 0);
    p.government = "imperium";
    expect(commandPointsAvailable(s, 0)).toBe(Math.floor(base * 1.5));
  });

  it("builds ships for a third of the price under confederation", () => {
    const s = game();
    const p = s.players[0]!;
    const item = { kind: "ship" as const, designId: "frigate" };
    p.government = "dictatorship";
    const full = itemCost(s, 0, item, home(s));
    p.government = "confederation";
    expect(itemCost(s, 0, item, home(s))).toBeCloseTo(full * GOVERNMENTS.confederation.shipCostMult, 0);
    expect(GOVERNMENTS.confederation.shipCostMult).toBeCloseTo(1 / 3);
  });

  it("punishes colonies without barracks under dictatorship", () => {
    const s = game();
    const p = s.players[0]!;
    p.government = "dictatorship";
    const h = home(s);
    expect(colonyMorale(p, { ...h, buildings: [] }, 1) - colonyMorale(p, { ...h, buildings: ["marineBarracks"] }, 1))
      .toBe(-GOVERNMENTS.dictatorship.ungarrisonedPenalty);
  });
});

describe("capitol", () => {
  it("is lost with its building, hurts morale, and can be rebuilt", () => {
    let s = game();
    const p = s.players[0]!;
    p.government = "dictatorship";
    p.capitol = "held";
    const h = home(s);
    const before = colonyMorale(p, h, 1);
    h.buildings = h.buildings.filter((b) => b !== "capitol");
    s = processTurn(s, {});
    const after = s.players[0]!;
    expect(after.capitol).toBe("lost");
    expect(colonyMorale(after, s.colonies[h.id]!, 1)).toBe(before - GOVERNMENTS.dictatorship.capitalLossMorale);
    expect(availableBuildings(s, 0, s.colonies[h.id]!)).toContain("capitol");
  });
});

describe("conquest", () => {
  function invasion(shield: boolean) {
    let s = game("conquer");
    s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
    s.players[1]!.government = "dictatorship";
    const victim = home(s, 1);
    victim.buildings = shield ? ["barrierShield"] : [];
    victim.farmers = 2;
    victim.workers = 0;
    victim.scientists = 0;
    const star = s.planets[victim.planetId]!.starId;
    for (const f of Object.values(s.fleets)) if (f.ownerId === 1) delete s.fleets[f.id];
    const at = s.galaxy.stars.find((x) => x.id === star)!;
    const f: Fleet = {
      id: `t${s.nextId++}`, ownerId: 0, x: at.x, y: at.y, starId: star, destStarId: null,
      ships: [{ designId: "transport", count: 8 }], stance: "defend", name: "Troops",
    };
    s.fleets[f.id] = f;
    s = processTurn(s, { 0: [{ type: "invade", fleetId: f.id, colonyId: victim.id }] });
    return { s, colony: s.colonies[victim.id]! };
  }

  it("leaves conquered people as aliens who work at a penalty", () => {
    const { colony } = invasion(false);
    expect(colony.ownerId).toBe(0);
    expect(colony.aliens).toBe(population(colony));
    expect(colony.formerOwnerId).toBe(1);
    expect(ASSIMILATION.alienPenalty).toBe(25);
  });

  it("can't invade through a barrier shield", () => {
    const { colony } = invasion(true);
    expect(colony.ownerId).toBe(1);
  });
});
