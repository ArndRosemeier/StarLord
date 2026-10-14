import { describe, expect, it } from "vitest";
import {
  AI_SURRENDER, POP_LOSS_TALLY, Rng, SURRENDER, captureColony, declareWar, diplomacyTick, newGame, popLossesOf, population, processTurn,
  recordPopLosses, relation, sizeOf, surrenderChance, surrenderEmpire, surrenderTarget, type GameEvent, type GameState,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

/** Three computer empires that know each other, on the given difficulty. */
function ais(seed: string, difficulty: "easy" | "average" | "hard" = "average", humans: number[] = []): GameState {
  const s = newGame({ seed, races: ["felhari", "kordex", "zhrikk"], humanPlayers: humans, difficulty, ...quiet });
  for (const p of s.players) if (p.kind === "empire") p.contacts = s.players.filter((q) => q.kind === "empire" && q.id !== p.id).map((q) => q.id);
  s.turn = AI_SURRENDER.minTurn + 10;
  return s;
}

const atWar = (s: GameState, a: number, b: number, turns = 200) => {
  s.relations[a < b ? `${a}-${b}` : `${b}-${a}`] = { ...relation(s, a, b), status: "war", since: s.turn - turns };
};
const strong = (s: GameState) => new Map(s.players.map((p) => [p.id, 1e6]));
const colonyOf = (s: GameState, owner: number) => Object.values(s.colonies).find((c) => c.ownerId === owner)!;

describe("an empire worn down by a long war gives up, as in the original", () => {
  it("never before turn 150 and never a human", () => {
    const s = ais("early");
    s.turn = AI_SURRENDER.minTurn - 1;
    expect(surrenderChance(s, 0, strong(s))).toBeNull();
    const h = ais("human", "average", [0]);
    expect(surrenderChance(h, 0, strong(h))).toBeNull();
  });

  it("a healthy empire with no losses never gives up", () => {
    const s = ais("healthy");
    expect(surrenderChance(s, 0, strong(s))).toBe(0);
  });

  it("a weak fleet: (26 - strength%) x 5 / 12", () => {
    const s = ais("weakfleet");
    const powers = strong(s);
    powers.set(0, 0);
    expect(surrenderChance(s, 0, powers)).toBe(Math.trunc((26 * 5) / 12));
  });

  it("population lost in the war: losses² x 100 / (population + losses)²", () => {
    const s = ais("losses");
    const pop = sizeOf(s, 0);
    recordPopLosses(s, 0, 1, pop);
    expect(surrenderChance(s, 0, strong(s))).toBe(Math.trunc(Math.trunc((pop * pop * 100) / (2 * pop)) / (2 * pop)));
    expect(surrenderChance(s, 0, strong(s))).toBe(25);
  });

  it("joins the most populous computer empire it is not at war with", () => {
    const s = ais("target");
    atWar(s, 0, 1);
    recordPopLosses(s, 0, 1, 10_000);
    expect(surrenderTarget(s, 0, () => 1, strong(s))).toBe(2);
    // A roll over the chance: it fights on.
    expect(surrenderTarget(s, 0, () => 100, strong(s))).toBeNull();
  });

  it("at war with everyone: anyone it knows on the easier levels, nobody on Hard", () => {
    for (const [difficulty, found] of [["average", true], ["hard", false]] as const) {
      const s = ais(`everyone${difficulty}`, difficulty);
      atWar(s, 0, 1);
      atWar(s, 0, 2);
      recordPopLosses(s, 0, 1, 10_000);
      const to = surrenderTarget(s, 0, () => 1, strong(s));
      if (!found) expect(to).toBeNull();
      else expect(to).toBe(sizeOf(s, 2) > sizeOf(s, 1) ? 2 : 1);
    }
  });

  it("can join a human empire on the easier levels", () => {
    const s = ais("tohuman", "easy", [2]);
    colonyOf(s, 2).farmers += 10;
    atWar(s, 0, 1);
    recordPopLosses(s, 0, 1, 10_000);
    expect(surrenderTarget(s, 0, () => 1, strong(s))).toBe(2);
  });

  it("a long war ends in a surrender instead of peace when the roll says so", () => {
    let gaveUp = 0;
    for (let i = 0; i < 10; i++) {
      const s = ais(`longwar${i}`);
      atWar(s, 0, 1);
      recordPopLosses(s, 0, 1, 1_000_000);
      diplomacyTick(s, new Rng({ s: i + 1 }));
      if (s.surrenders?.[0] !== undefined) {
        gaveUp++;
        expect(s.surrenders[0]).toBe(2);
        expect(relation(s, 0, 1).status).toBe("war");
      } else expect(relation(s, 0, 1).status).toBe("peace");
    }
    expect(gaveUp).toBeGreaterThanOrEqual(8);
  });
});

describe("surrendering hands the empire over", () => {
  it("colonies, ships, technology, treasury, freighters and spies pass on; the leaders leave", () => {
    const s = ais("handover");
    const loser = s.players[0]!;
    const winner = s.players[2]!;
    const tech = loser.techs.find((t) => !winner.techs.includes(t)) ?? (() => { loser.techs.push("deuteriumFuelCells"); return "deuteriumFuelCells"; })();
    winner.techs = winner.techs.filter((t) => t !== tech);
    loser.bc = 321;
    loser.freighters = 4;
    loser.spies = { home: 50, abroad: { 1: { count: 20, mission: "steal" } } };
    winner.spies.home = 5;
    const winnerBc = winner.bc;
    const colonies = Object.values(s.colonies).filter((c) => c.ownerId === 0).length;
    const pop = Object.values(s.colonies).filter((c) => c.ownerId === 0).reduce((n, c) => n + population(c), 0);
    const ships = Object.values(s.fleets).filter((f) => f.ownerId === 0).reduce((n, f) => n + f.ships.reduce((m, x) => m + x.count, 0), 0);
    const events: GameEvent[] = [];
    const handed = surrenderEmpire(s, 0, 2, (e) => events.push({ turn: s.turn, ...e } as GameEvent));
    expect(handed).toMatchObject({ colonies, population: pop, ships, bc: 321, freighters: 4, spies: SURRENDER.spyCap - 5 });
    expect(handed.techs).toBeGreaterThanOrEqual(1);
    expect(winner.techs).toContain(tech);
    expect(winner.bc).toBe(winnerBc + 321);
    expect(winner.freighters).toBe(4);
    expect(winner.spies.home).toBe(SURRENDER.spyCap);
    expect(Object.values(s.colonies).some((c) => c.ownerId === 0)).toBe(false);
    expect(Object.values(s.fleets).some((f) => f.ownerId === 0)).toBe(false);
    expect(Object.values(s.leaders).some((l) => l.ownerId === 0)).toBe(false);
    expect(loser).toMatchObject({ alive: false, eliminatedTurn: s.turn, surrenderedTo: 2 });
    // Everyone left, and the fallen, read it in the Galactic News.
    const news = events.filter((e) => e.kind === "empireFell");
    expect(news.map((e) => e.playerId).sort()).toEqual([0, 1, 2]);
    expect(news[0]).toMatchObject({ fallen: 0, how: "surrendered", to: 2, handed });
  });

  it("a surrender ordered in play makes the news and is not reported as a destruction", () => {
    const s = ais("ordered", "average", [0]);
    const next = processTurn(s, { 0: [{ type: "surrender", to: 1 }] });
    const fell = next.events.filter((e) => e.kind === "empireFell");
    expect(fell.length).toBeGreaterThanOrEqual(3);
    expect(fell.every((e) => e.kind === "empireFell" && e.how === "surrendered" && e.fallen === 0 && e.to === 1)).toBe(true);
    expect(next.events.some((e) => e.kind === "eliminated")).toBe(false);
    expect(next.players[0]).toMatchObject({ alive: false, surrenderedTo: 1 });
  });
});

describe("an empire destroyed", () => {
  it("is front-page news for every empire, naming who is credited", () => {
    const s = ais("destroyed");
    s.players[1]!.lastAttackedBy = 2;
    for (const c of Object.values(s.colonies)) if (c.ownerId === 1) c.outpost = true;
    const next = processTurn(s, {});
    expect(next.players[1]!.alive).toBe(false);
    const fell = next.events.filter((e) => e.kind === "empireFell");
    expect(fell.map((e) => e.playerId).sort()).toEqual([0, 1, 2]);
    expect(fell[0]).toMatchObject({ fallen: 1, how: "destroyed", by: 2 });
  });
});

describe("population lost in a war", () => {
  it("a captured colony counts 10 + its population; war and peace forget the tally", () => {
    const s = ais("tally");
    declareWar(s, 2, 0);
    const c = colonyOf(s, 0);
    const pop = population(c);
    captureColony({ state: s, rng: new Rng({ s: 3 }), emit: () => {} }, c, 2);
    expect(popLossesOf(s, 0, 2)).toBe(POP_LOSS_TALLY.colonyTaken + pop);
    declareWar(s, 0, 2);
    expect(popLossesOf(s, 0, 2)).toBe(0);
  });
});
