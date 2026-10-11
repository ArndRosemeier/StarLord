import { describe, expect, it } from "vitest";
import {
  RAID_GRACE_TURNS, RAID_LAUNCH_ROLL, RAIDER_CITADEL_ID, RAIDER_ERAS, TECHS, RAIDERS_DEFEATED_SCORE, canReach, designStats, moveProblem, newGame, processTurn,
  raiderDesignId, raiderDesigns, raiderTechs, raidersId, returnThroughPortal, score, validateDesign, type Fleet, type GameState,
} from "@starlord/sim";

function game(seed = "vex"): GameState {
  return newGame({ seed, races: ["terran", "felhari"], monsters: false, council: false });
}

function addFleet(s: GameState, ownerId: number, starId: string, ships: Fleet["ships"]): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance: "attack", name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

/** A raid fleet ready to launch this turn. */
function readyRaid(s: GameState, ships: Fleet["ships"] = [{ designId: raiderDesignId("cruiser"), count: 2 }]): void {
  s.raiders.nextRaid = s.turn;
  s.raiders.fleet = ships;
  s.raiders.launch = RAID_LAUNCH_ROLL;
}

const raiderHome = (s: GameState) => s.galaxy.stars.find((x) => x.special === "raiderHome")!;
const homeStar = (s: GameState, pid: number) => s.players[pid]!.homeStarId;
const capital = (s: GameState, pid: number) => Object.values(s.colonies).find((c) => c.ownerId === pid && s.planets[c.planetId]!.starId === homeStar(s, pid))!;

describe("raider ships", () => {
  it("are valid warships in every era, and get stronger era by era", () => {
    let last = 0;
    for (let era = 0; era < RAIDER_ERAS.length; era++) {
      const player = { ...newGame({ seed: "d", races: ["terran", "felhari"] }).players[0]!, techs: raiderTechs(era) };
      for (const d of raiderDesigns(era)) {
        if (d.fixed) continue;
        expect(validateDesign(player, d), `${d.id} era ${era}`).toBe(null);
        expect(d.weapons.length).toBeGreaterThan(0);
      }
      const titan = raiderDesigns(era).find((d) => d.id === raiderDesignId("titan"))!;
      const strength = designStats(player, titan).strength;
      expect(strength).toBeGreaterThan(last);
      last = strength;
    }
  });

  it("guard their home with a citadel that fights as an immobile fortress", () => {
    const s = game();
    const home = Object.values(s.fleets).find((f) => f.starId === raiderHome(s).id)!;
    expect(home.ships.some((x) => x.designId === RAIDER_CITADEL_ID)).toBe(true);
    const citadel = s.players[raidersId(s)!]!.designs.find((d) => d.id === RAIDER_CITADEL_ID)!;
    expect(citadel.fixed?.immobile).toBe(true);
  });
});

describe("raids", () => {
  it("come with ships of the current era, which advances with time", () => {
    let s = game();
    readyRaid(s);
    s = processTurn(s, {});
    expect(s.events.some((e) => e.kind === "raid")).toBe(true);
    expect(s.raiders.era).toBe(0);
    expect(s.raiders.firstRaid).toBe(s.turn - 1);

    // Time alone is not enough: the raiders keep pace with the most advanced empire.
    s.raiders.firstRaid = s.turn - RAIDER_ERAS[2]!.from;
    readyRaid(s);
    s = processTurn(s, {});
    expect(s.raiders.era).toBe(0);
    s.players[0]!.techs = Object.keys(TECHS).slice(0, RAIDER_ERAS[2]!.minTechs);
    readyRaid(s);
    s = processTurn(s, {});
    expect(s.raiders.era).toBe(2);
    // The home fleet is topped up to the new era's garrison.
    const home = Object.values(s.fleets).find((f) => f.starId === raiderHome(s).id)!;
    expect(home.ships.find((x) => x.designId === raiderDesignId("titan"))!.count).toBeGreaterThanOrEqual(3);
  });

  it("kill colonists and wreck buildings when they win", () => {
    let s = game("raze");
    const c = capital(s, 0);
    c.buildings = c.buildings.filter((b) => !["starBase", "battlestation", "starFortress", "missileBase", "groundBatteries"].includes(b));
    for (const f of Object.values(s.fleets)) if (f.ownerId === 0) delete s.fleets[f.id];
    c.buildings.push("hydroponicFarm", "automatedFactory", "researchLab");
    c.workers += 6;
    const before = { pop: c.farmers + c.workers + c.scientists, buildings: c.buildings.length };
    s.raiders.firstRaid = s.turn - RAIDER_ERAS[1]!.from;
    readyRaid(s);
    s = processTurn(s, {});
    expect(s.events.find((e) => e.kind === "raid")).toMatchObject({ playerId: 0, starId: homeStar(s, 0) });
    const after = s.colonies[c.id];
    if (after) {
      expect(after.farmers + after.workers + after.scientists).toBeLessThan(before.pop);
      expect(after.buildings.length).toBeLessThan(before.buildings);
    }
  });
});

describe("raid timing (decoded from the original)", () => {
  it("waits out a grace period set by the starting tech level", () => {
    expect(newGame({ seed: "g", races: ["terran", "felhari"], techLevel: "preWarp" }).raiders.nextRaid).toBe(RAID_GRACE_TURNS.preWarp);
    expect(newGame({ seed: "g", races: ["terran", "felhari"], techLevel: "advanced" }).raiders.nextRaid).toBe(RAID_GRACE_TURNS.advanced);
    let s = game("grace");
    expect(s.raiders.nextRaid).toBe(RAID_GRACE_TURNS.average);
    s.raiders.fleet = [{ designId: raiderDesignId("cruiser"), count: 2 }];
    s.raiders.launch = RAID_LAUNCH_ROLL;
    s = processTurn(s, {});
    expect(s.events.some((e) => e.kind === "raid")).toBe(false);
  });

  it("grows the budget every 25 turns, faster on harder levels", () => {
    const grow = (difficulty: "average" | "impossible") => {
      let s = newGame({ seed: "b", races: ["terran", "felhari"], monsters: false, council: false, difficulty });
      s.raiders.launch = -10_000;
      const got: number[] = [];
      for (const k of [1, 2, 3]) {
        s.turn = s.raiders.nextRaid + 25 * k;
        s.raiders.budget = 0;
        s.raiders.fleet = [{ designId: raiderDesignId("titan"), count: 2 }, { designId: raiderDesignId("battleship"), count: 2 },
          { designId: raiderDesignId("cruiser"), count: 3 }, { designId: raiderDesignId("destroyer"), count: 4 }, { designId: raiderDesignId("frigate"), count: 4 }];
        s = processTurn(s, {});
        got.push(s.raiders.budget!);
      }
      return got;
    };
    expect(grow("average")).toEqual([1, 2, 3]);
    expect(grow("impossible")).toEqual([2, 4, 6]);
  });

  it("buys the biggest ships it can afford, up to a cap per hull", () => {
    let s = game("buy");
    s.turn = s.raiders.nextRaid + 1;
    s.raiders.budget = 100;
    s.raiders.launch = -10_000;
    s = processTurn(s, {});
    expect(s.raiders.fleet).toEqual([{ designId: raiderDesignId("titan"), count: 1 }, { designId: raiderDesignId("cruiser"), count: 2 }]);
    expect(s.raiders.budget).toBe(1);
  });

  it("goes for the bigger empire and leaves the smallest alone", () => {
    for (const seed of ["t1", "t2", "t3"]) {
      let s = game(seed);
      capital(s, 1).workers += 8;
      readyRaid(s);
      s = processTurn(s, {});
      expect(s.events.find((e) => e.kind === "raid")).toMatchObject({ playerId: 1 });
    }
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
    // Leave only a lone raider ship at home and send an overwhelming fleet.
    const home = Object.values(s.fleets).find((f) => f.starId === raiderHome(s).id)!;
    home.ships = [{ designId: raiderDesignId("destroyer"), count: 1 }];
    s.players[0]!.designs.push({
      id: "big", name: "Big", hull: "doomStar", armor: "xentroniumArmor", shield: "classXShield", computer: "moleculartronicComputer",
      weapons: [{ weaponId: "deathRay", count: 30 }], specials: [], module: null, obsolete: false,
    });
    const f = addFleet(s, 0, homeStar(s, 0), [{ designId: "big", count: 4 }]);
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
    const design = { ...raiderDesigns(1).find((d) => d.id === raiderDesignId("battleship"))!, id: "capV", obsolete: true, capturedFrom: raidersId(s)! };
    s.players[0]!.designs.push(design);
    const f = addFleet(s, 0, homeStar(s, 0), [{ designId: "capV", count: 8 }]);
    expect(s.players[0]!.techs).not.toContain("deathRay");
    s = processTurn(s, { 0: [{ type: "scrapShips", fleetId: f.id, designId: "capV", count: 8 }] });
    const learned = s.events.filter((e) => e.kind === "techLearned" && e.playerId === 0 && e.source === "salvage");
    expect(learned.length).toBeGreaterThan(0);
    expect(s.players[0]!.techs.some((t) => ["deathRay", "xentroniumArmor", "damperField", "particleBeam"].includes(t))).toBe(true);
  });
});
