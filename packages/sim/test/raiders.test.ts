import { describe, expect, it } from "vitest";
import {
  RAID_GRACE_TURNS, RAID_HOME_QUOTA, RAID_LAUNCH_ROLL, RAID_MAX_SHIPS, RAIDER_CITADEL, RAIDER_CITADEL_ID, RAIDER_HULLS,
  RAIDERS_DEFEATED_SCORE, canReach, raiderHomeShips, citadelDesign, moveProblem, newGame, processTurn, raiderDesign, raiderDesignId, raiderDesigns,
  raidersId, returnThroughPortal, score, type Colony, type Difficulty, type Fleet, type GameState, type TechLevel,
} from "@starlord/sim";

function game(seed = "vex", opts: { difficulty?: Difficulty; techLevel?: TechLevel } = {}): GameState {
  return newGame({ seed, races: ["terran", "felhari"], monsters: false, council: false, ...opts });
}

function addFleet(s: GameState, ownerId: number, starId: string, ships: Fleet["ships"]): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance: "attack", name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

/** Settles a free planet in another system. */
function addColony(s: GameState, owner: number, outpost = false): Colony {
  const used = new Set(Object.values(s.colonies).map((c) => s.planets[c.planetId]!.starId));
  const planet = Object.values(s.planets).find((p) => !p.colonyId && !used.has(p.starId))!;
  const c: Colony = {
    id: `cx${s.nextId++}`, planetId: planet.id, ownerId: owner, raceId: s.players[owner]!.raceId, name: "Rock", outpost,
    farmers: 0, workers: outpost ? 0 : 2, scientists: 0, growthK: 0, buildings: [], queue: [], progress: 0, founded: 1, terraformed: 0, unrestUntil: 0,
  };
  planet.colonyId = c.id;
  s.colonies[c.id] = c;
  return c;
}

/** Sets the home fleet as if it had been there all along. */
function setHome(s: GameState, home: GameState["raiders"]["home"]): void {
  s.raiders.home = home;
  Object.values(s.fleets).find((f) => f.starId === s.galaxy.stars.find((x) => x.special === "raiderHome")!.id)!.ships = raiderHomeShips(s.raiders);
}

/** Turn number `since` turns after the grace period ends. */
const after = (s: GameState, since: number) => s.raiders.nextRaid + since;

/** A raid pool that launches this turn: the launch roll can't fail with the counter at its top. */
function readyRaid(s: GameState, pool: GameState["raiders"]["pool"] = { cruiser: 2 }): void {
  s.turn = Math.max(s.turn, s.raiders.nextRaid + 1);
  s.raiders.pool = pool;
  s.raiders.launch = RAID_LAUNCH_ROLL;
}

/** Buys with a budget a turn after the grace period, never launching. */
function buy(s: GameState, since: number, budget: number, homeBudget = 0): GameState {
  s.turn = after(s, since);
  s.raiders.budget = budget;
  s.raiders.homeBudget = homeBudget;
  s.raiders.launch = -10_000;
  return processTurn(s, {});
}

const raiderHome = (s: GameState) => s.galaxy.stars.find((x) => x.special === "raiderHome")!;
const homeFleet = (s: GameState) => Object.values(s.fleets).find((f) => f.starId === raiderHome(s).id)!;
const homeStar = (s: GameState, pid: number) => s.players[pid]!.homeStarId;
const capital = (s: GameState, pid: number) => Object.values(s.colonies).find((c) => c.ownerId === pid && s.planets[c.planetId]!.starId === homeStar(s, pid))!;
const raidEvent = (s: GameState) => s.events.find((e) => e.kind === "raid") as { playerId: number; starId: string } | undefined;

describe("raider ships", () => {
  it("have one fixed design per hull: no shield, Moleculartronic, Xentronium, Damper Field and Quantum Detonator", () => {
    const designs = raiderDesigns("average");
    expect(designs.filter((d) => !d.fixed).map((d) => d.hull)).toEqual([...RAIDER_HULLS]);
    expect(designs.some((d) => d.hull === "doomStar" && !d.fixed)).toBe(false);
    for (const d of designs.filter((x) => !x.fixed)) {
      expect(d.shield).toBe(null);
      expect(d.computer).toBe("moleculartronicComputer");
      expect(d.armor).toBe("xentroniumArmor");
      expect(d.specials).toEqual(expect.arrayContaining(["damperField", "quantumDetonator"]));
    }
    const titan = raiderDesign("titan");
    expect(titan.weapons.find((w) => w.weaponId === "deathRay")).toMatchObject({ count: 5, mods: ["heavyMount"] });
    expect(titan.weapons.find((w) => w.weaponId === "neutroniumBomb")!.count).toBe(30);
    expect(titan.specials).toEqual(expect.arrayContaining(["subspaceTeleporter", "reflectionField"]));
  });

  it("differ only in their jammer by difficulty", () => {
    expect(raiderDesign("frigate", "average").specials).not.toContain("ecmJammer");
    expect(raiderDesign("frigate", "hard").specials).toContain("ecmJammer");
    expect(raiderDesign("destroyer", "impossible").specials).toContain("multiWaveEcm");
    expect(raiderDesign("cruiser", "impossible").specials).toContain("wideAreaJammer");
    expect(raiderDesign("battleship", "tutor").specials).toEqual(["damperField", "quantumDetonator", "subspaceTeleporter", "reflectionField"]);
    expect(raiderDesign("titan", "tutor").specials).toContain("ecmJammer");
    expect(raiderDesign("titan", "hard").weapons).toEqual(raiderDesign("titan", "tutor").weapons);
  });

  it("guard their home with the fixed citadel and at least one titan", () => {
    const s = game();
    const home = homeFleet(s);
    expect(home.ships.map((x) => [x.designId, x.count])).toEqual([[RAIDER_CITADEL_ID, 1], [raiderDesignId("titan"), 1]]);
    const citadel = citadelDesign();
    expect(citadel.fixed).toMatchObject({ armor: RAIDER_CITADEL.armor, hits: RAIDER_CITADEL.structure, shield: 0, immobile: true, crew: 3 });
    expect(citadel.fixed!.weapons.every((w) => w.arc === "full")).toBe(true);
    expect(citadel.fixed!.weapons.map((w) => w.weaponId).sort()).toEqual(["deathRay", "particleBeam", "particleBeam", "particleBeam"]);
    expect(citadel.specials).toContain("battleScanner");
  });
});

describe("buying ships (decoded from the original)", () => {
  it("buys the smallest eligible hull first, up to the caps", () => {
    const s = buy(game("buy"), 1, 40);
    expect(s.raiders.pool).toEqual({ frigate: 4, destroyer: 4, cruiser: 1 });
    expect(s.raiders.budget).toBe(0);
  });

  it("stops buying frigates and destroyers after their time windows", () => {
    let s = buy(game("w1"), 151, 40);
    expect(s.raiders.pool).toEqual({ destroyer: 4, cruiser: 1 });
    expect(s.raiders.budget).toBe(8);
    s = buy(game("w2"), 251, 40);
    expect(s.raiders.pool).toEqual({ cruiser: 3 });
    // Windows close sooner on Hard: no frigates after 83 turns.
    s = buy(game("w3", { difficulty: "hard" }), 90, 10);
    expect(s.raiders.pool).toEqual({ destroyer: 2 });
    // Starting at the advanced tech level there are never frigates.
    s = buy(game("w4", { techLevel: "advanced" }), 1, 10);
    expect(s.raiders.pool).toEqual({ destroyer: 2 });
  });

  it("never rebuilds frigates, destroyers or cruisers once their cap was reached", () => {
    let s = buy(game("cap"), 1, 40);
    expect(s.raiders.caps).toMatchObject({ frigate: 0, destroyer: 0 });
    s.raiders.pool = { cruiser: 1 };
    s = buy(s, 2, 20);
    expect(s.raiders.pool).toEqual({ cruiser: 2 });
  });

  it("builds the home fleet from its own budget, cruisers first", () => {
    const s = buy(game("home"), 251, 0, 50);
    expect(s.raiders.home).toEqual({ cruiser: 3 });
    expect(s.raiders.homeBudget).toBe(14);
    // As in the original, three home cruisers close cruiser building for the raid pool too.
    expect(s.raiders.caps!.cruiser).toBe(0);
    expect(homeFleet(s).ships.find((x) => x.designId === raiderDesignId("cruiser"))!.count).toBe(3);
  });

  it("cuts every price once on Hard when the first titan is bought", () => {
    const onlyTitans = (s: GameState) => {
      s.raiders.caps = { frigate: 0, destroyer: 0, cruiser: 0, battleship: 0, titan: 2 };
      return s;
    };
    const s = buy(onlyTitans(game("disc", { difficulty: "hard" })), 251, 75 + 67);
    expect(s.raiders.discounted).toBe(true);
    // 75 for the first titan, 67 for the second.
    expect(s.raiders.pool).toEqual({ titan: 2 });
    expect(s.raiders.budget).toBe(0);
    const avg = buy(onlyTitans(game("disc2")), 251, 75 + 67);
    expect(avg.raiders.discounted).toBe(false);
    expect(avg.raiders.pool).toEqual({ titan: 1 });
  });

  it("grows both budgets every 25 turns, and the raid budget twice once the home fleet is complete", () => {
    const grow = (difficulty: Difficulty, complete: boolean) => {
      let s = game("b", { difficulty });
      const got: [number, number][] = [];
      for (const k of [1, 2, 3]) {
        // Nothing may be bought, so the budgets show the growth alone.
        s.raiders.caps = { frigate: 0, destroyer: 0, cruiser: 0, battleship: 0, titan: 0 };
        setHome(s, complete ? { ...RAID_HOME_QUOTA } : {});
        s.raiders.pool = {};
        s = buy(s, 25 * k, 0, 0);
        got.push([s.raiders.budget!, s.raiders.homeBudget!]);
      }
      return got;
    };
    expect(grow("average", false)).toEqual([[1, 1], [2, 2], [3, 3]]);
    expect(grow("impossible", false)).toEqual([[2, 2], [4, 4], [6, 6]]);
    expect(grow("hard", true)).toEqual([[4, 0], [6, 0], [10, 0]]);
  });
});

describe("launching raids (decoded from the original)", () => {
  it("waits out a grace period set by the starting tech level", () => {
    expect(game("g", { techLevel: "preWarp" }).raiders.nextRaid).toBe(RAID_GRACE_TURNS.preWarp);
    expect(game("g", { techLevel: "advanced" }).raiders.nextRaid).toBe(RAID_GRACE_TURNS.advanced);
    expect(game("g").raiders.nextRaid).toBe(RAID_GRACE_TURNS.average);
  });

  it("only launches while 3 × the raid pool's value covers the home fleet and both budgets", () => {
    let s = game("gate");
    readyRaid(s, { titan: 1 });
    setHome(s, { titan: 7 });
    s = processTurn(s, {});
    expect(raidEvent(s)).toBeUndefined();
    // The counter is left alone while the gate is shut.
    expect(s.raiders.launch).toBe(RAID_LAUNCH_ROLL);
    setHome(s, {});
    s = processTurn(s, {});
    expect(raidEvent(s)).toBeDefined();
    expect(s.raiders.launch).toBe(0);
  });

  it("counts up only while raid ships wait, and launches on a roll of at most the counter + 1", () => {
    let s = game("count");
    s.turn = after(s, 1);
    s = processTurn(s, {});
    expect(s.raiders.launch).toBe(0);
    // From 198 the counter grows to 199, so a roll of 1..200 always launches.
    for (const seed of ["c1", "c2", "c3", "c4", "c5"]) {
      let t = game(seed);
      readyRaid(t, { frigate: 1 });
      t.raiders.launch = 198;
      t = processTurn(t, {});
      expect(raidEvent(t)).toBeDefined();
    }
  });

  it("goes for the bigger empire and leaves the smallest alone", () => {
    for (const seed of ["t1", "t2", "t3"]) {
      let s = game(seed);
      capital(s, 1).workers += 8;
      readyRaid(s);
      s = processTurn(s, {});
      expect(raidEvent(s)).toMatchObject({ playerId: 1 });
    }
  });

  it("strikes a random system with one of the target's colonies, never an outpost", () => {
    const hit = new Set<string>();
    for (let i = 0; i < 16; i++) {
      let s = game(`star${i}`);
      capital(s, 1).workers += 8;
      const extra = [addColony(s, 1), addColony(s, 1)];
      const outpost = addColony(s, 1, true);
      const allowed = [homeStar(s, 1), ...extra.map((c) => s.planets[c.planetId]!.starId)];
      readyRaid(s);
      s = processTurn(s, {});
      const e = raidEvent(s)!;
      expect(e.playerId).toBe(1);
      expect(allowed).toContain(e.starId);
      expect(e.starId).not.toBe(s.planets[outpost.planetId]!.starId);
      hit.add(e.starId === homeStar(s, 1) ? "capital" : "other");
    }
    expect(hit.size).toBe(2);
  });
});

describe("raids", () => {
  it("send at most six ships, largest hulls first", () => {
    let s = game("six");
    readyRaid(s, { frigate: 4, destroyer: 4, cruiser: 3 });
    s = processTurn(s, {});
    const seen = s.combats.flatMap((c) => c.ships).filter((x) => x.ownerId === raidersId(s)).map((x) => ({ designId: x.designId, count: 1 }));
    const sent = seen.reduce<Record<string, number>>((a, x) => ({ ...a, [x.designId]: (a[x.designId] ?? 0) + 1 }), {});
    expect(Object.values(sent).reduce((a, b) => a + b, 0)).toBe(RAID_MAX_SHIPS);
    expect(sent).toEqual({ [raiderDesignId("cruiser")]: 3, [raiderDesignId("destroyer")]: 3 });
  });

  it("come home at the end of the turn: survivors rejoin the pool, the destroyed are lost", () => {
    let s = game("back-home");
    // Nothing defends the target, so every raider survives.
    for (const f of Object.values(s.fleets)) if (f.ownerId !== raidersId(s)) delete s.fleets[f.id];
    for (const c of Object.values(s.colonies)) c.buildings = c.buildings.filter((b) => !["starBase", "battlestation", "starFortress", "missileBase", "groundBatteries", "planetaryShield"].includes(b));
    readyRaid(s, { titan: 2 });
    s = processTurn(s, {});
    expect(raidEvent(s)).toBeDefined();
    expect(Object.values(s.fleets).filter((f) => f.ownerId === raidersId(s) && f.starId !== raiderHome(s).id)).toEqual([]);
    expect(s.raiders.pool).toEqual({ titan: 2 });
    expect(s.raiders.deployed).toEqual({});

    // A raid that loses ships loses only those.
    let t = game("lost");
    t.players[0]!.designs.push({
      id: "big", name: "Big", hull: "doomStar", armor: "xentroniumArmor", shield: "classXShield", computer: "moleculartronicComputer",
      weapons: [{ weaponId: "deathRay", count: 30 }], specials: [], module: null, obsolete: false,
    });
    addFleet(t, 0, homeStar(t, 0), [{ designId: "big", count: 6 }]);
    capital(t, 0).workers += 8;
    readyRaid(t, { frigate: 1, titan: 1 });
    t = processTurn(t, {});
    expect(raidEvent(t)).toMatchObject({ playerId: 0 });
    const lost = t.combats.find((c) => c.starId === homeStar(t, 0))!.losses[raidersId(t)!] ?? 0;
    expect(lost).toBeGreaterThan(0);
    expect((t.raiders.pool!.frigate ?? 0) + (t.raiders.pool!.titan ?? 0)).toBe(2 - lost);
  });

  it("bombard a beaten colony with their bombs and never invade", () => {
    let s = game("bomb");
    const c = capital(s, 0);
    c.buildings = c.buildings.filter((b) => !["starBase", "battlestation", "starFortress", "missileBase", "groundBatteries", "planetaryShield"].includes(b));
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0) delete s.fleets[f.id];
    capital(s, 0).workers += 8;
    const before = c.farmers + c.workers + c.scientists;
    readyRaid(s, { titan: 2 });
    s = processTurn(s, {});
    expect(raidEvent(s)).toMatchObject({ playerId: 0, starId: homeStar(s, 0) });
    expect(s.events.some((e) => e.kind === "bombarded" && e.playerId === 0)).toBe(true);
    const left = s.colonies[c.id];
    if (left) {
      expect(left.ownerId).toBe(0);
      expect(left.farmers + left.workers + left.scientists).toBeLessThan(before);
    }
  });

  it("refill home losses from the raid pool", () => {
    let s = game("refill");
    setHome(s, { cruiser: 3 });
    s.raiders.pool = { cruiser: 1 };
    s.raiders.launch = -10_000;
    s = processTurn(s, {});
    // Two home cruisers die in a battle at Vex Prime.
    homeFleet(s).ships.find((x) => x.designId === raiderDesignId("cruiser"))!.count = 1;
    s = processTurn(s, {});
    expect(s.raiders.home!.cruiser).toBe(2);
    expect(s.raiders.pool!.cruiser).toBe(0);
    expect(homeFleet(s).ships.find((x) => x.designId === raiderDesignId("cruiser"))!.count).toBe(2);
  });
});

describe("dimensional portal", () => {
  it("is built at one colony, and only fleets there can cross to the raiders' home and back", () => {
    let s = game("portal");
    const home = homeStar(s, 0);
    const scout = addFleet(s, 0, home, [{ designId: "scout", count: 1 }]);
    expect(canReach(s, 0, scout, raiderHome(s).id)).toBe(false);
    const c = capital(s, 0);
    c.queue = [{ kind: "project", id: "dimensionalPortal" }];
    c.progress = 100000;
    s.players[0]!.techs.push("dimensionalPortal");
    s = processTurn(s, {});
    expect(s.colonies[c.id]!.portal).toBe(true);
    expect(s.players[0]!.hasPortal).toBe(true);
    expect(canReach(s, 0, s.fleets[scout.id]!, raiderHome(s).id)).toBe(true);

    // Elsewhere the portal is out of reach.
    const other = s.galaxy.stars.find((x) => x.id !== home && !x.special)!;
    const away = addFleet(s, 0, other.id, [{ designId: "scout", count: 1 }]);
    expect(moveProblem(s, 0, away, raiderHome(s).id)).toMatch(/portal/i);

    // From the raiders' home the way leads only back to a portal.
    const there = addFleet(s, 0, raiderHome(s).id, [{ designId: "scout", count: 1 }]);
    expect(canReach(s, 0, there, home)).toBe(true);
    expect(canReach(s, 0, there, other.id)).toBe(false);
  });

  it("brings back the survivors of an attack that did not finish the raiders", () => {
    let s = game("back");
    const c = capital(s, 0);
    c.portal = true;
    s.players[0]!.hasPortal = true;
    // A lone frigate stands no chance against the citadel; it may die or flee, but never stays.
    const f = addFleet(s, 0, homeStar(s, 0), [{ designId: "frigate", count: 1 }]);
    s = processTurn(s, { 0: [{ type: "moveFleet", fleetId: f.id, destStarId: raiderHome(s).id }] });
    const left = s.fleets[f.id];
    if (left) expect(left.starId === homeStar(s, 0) || left.destStarId === homeStar(s, 0)).toBe(true);
    expect(Object.values(s.fleets).some((x) => x.ownerId === 0 && x.starId === raiderHome(s).id)).toBe(false);
    expect(s.over).toBe(false);

    const stranded = addFleet(s, 0, raiderHome(s).id, [{ designId: "frigate", count: 1 }]);
    returnThroughPortal(s, raiderHome(s).id);
    expect(s.fleets[stranded.id]!.starId).toBe(homeStar(s, 0));
  });
});

describe("victory over the raiders", () => {
  it("ends the game, makes every empire capitulate and gives the biggest score bonus", () => {
    let s = game("win");
    const c = capital(s, 0);
    c.portal = true;
    s.players[0]!.hasPortal = true;
    // Send an overwhelming fleet against the citadel and the lone titan.
    s.players[0]!.designs.push({
      id: "big", name: "Big", hull: "doomStar", armor: "xentroniumArmor", shield: "classXShield", computer: "moleculartronicComputer",
      weapons: [{ weaponId: "deathRay", count: 30 }], specials: [], module: null, obsolete: false,
    });
    const f = addFleet(s, 0, homeStar(s, 0), [{ designId: "big", count: 20 }]);
    const before = score(s, 0);
    s = processTurn(s, { 0: [{ type: "moveFleet", fleetId: f.id, destStarId: raiderHome(s).id }] });
    expect(s.over).toBe(true);
    expect(s.victory).toBe("raiders");
    expect(s.winner).toBe(0);
    expect(s.raiders.defeatedBy).toBe(0);
    expect(s.events.filter((e) => e.kind === "raidersDefeated").map((e) => e.playerId).sort()).toEqual([0, 1]);
    expect(score(s, 0)).toBeGreaterThan(before + RAIDERS_DEFEATED_SCORE / 2);
  });
});

describe("salvage", () => {
  it("scrapping captured raider ships can teach their xenon technology", () => {
    let s = game("scrap");
    const design = { ...raiderDesign("battleship"), id: "capV", obsolete: true, capturedFrom: raidersId(s)! };
    s.players[0]!.designs.push(design);
    const f = addFleet(s, 0, homeStar(s, 0), [{ designId: "capV", count: 8 }]);
    expect(s.players[0]!.techs).not.toContain("deathRay");
    s = processTurn(s, { 0: [{ type: "scrapShips", fleetId: f.id, designId: "capV", count: 8 }] });
    const learned = s.events.filter((e) => e.kind === "techLearned" && e.playerId === 0 && e.source === "salvage");
    expect(learned.length).toBeGreaterThan(0);
    const carried = ["battleshipHull", "deathRay", "xentroniumArmor", "moleculartronicComputer", "particleBeam", "neutroniumBomb", "spatialCompressor",
      "damperField", "quantumDetonator", "subspaceTeleporter", "reflectionField", "multiWaveEcm"];
    for (const e of learned) expect(carried).toContain((e as { techId: string }).techId);
  });
});
