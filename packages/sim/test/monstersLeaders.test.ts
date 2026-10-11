import { describe, expect, it } from "vitest";
import {
  AVENGER_DESIGN, GUARDIAN_SCORE, HEROES, MONSTER_DESIGNS, ROAMING_MONSTERS, Rng, abilityValue, deriveSkills, designStats,
  elderId, guardianSlain, heroLeaderId, invasionCommando, monstersId, newGame, prepareBattle, processTurn, rosterReach, score, seedRng,
  type Fleet, type GameState, type LeaderAbility,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false } as const;

function addFleet(s: GameState, ownerId: number, starId: string, ships: Fleet["ships"], stance: Fleet["stance"] = "defend"): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = { id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null, ships, stance, name: "Test" };
  s.fleets[f.id] = f;
  return f;
}

/** Puts a hired captain with the given abilities in command of a fleet. */
function captain(s: GameState, ownerId: number, fleetId: string, abilities: LeaderAbility[], level = 1): void {
  const heroId = HEROES.findIndex((h) => h.kind === "captain" && !h.special);
  const l = s.leaders[heroLeaderId(heroId)]!;
  Object.assign(l, { status: "hired", ownerId, assignedTo: fleetId, abilities, level, offeredTo: null, travel: null });
  l.skills = deriveSkills(l);
}

const monsterDesign = (id: string) => MONSTER_DESIGNS.find((d) => d.id === id)!;

describe("monsters as in the original", () => {
  it("have no armor, attack from their computer and defense of 5 per square of speed", () => {
    const s = newGame({ seed: "mon", races: ["terran", "felhari"], monsters: true });
    const m = s.players[monstersId(s)!]!;
    const amoeba = designStats(m, monsterDesign("voidAmoeba"));
    expect([amoeba.structure, amoeba.armor, amoeba.attack, amoeba.defense, amoeba.combatSpeed, amoeba.sizeClass]).toEqual([400, 0, 50, 40, 8, 3]);
    const wyrm = designStats(m, monsterDesign(elderId("starWyrm")));
    expect([wyrm.structure, wyrm.attack, wyrm.defense, wyrm.sizeClass]).toEqual([2500, 125, 90, 5]);
    expect(wyrm.weapons.map((w) => [w.weaponId, w.count])).toEqual([["wyrmFang", 20], ["wyrmFire", 1]]);
    // Hydras absorb energy, eels carry a lightning field.
    expect(designStats(m, monsterDesign("starHydra")).effects.absorber).toBeGreaterThan(0);
    expect(designStats(m, monsterDesign("ionEel")).effects.lightning).toBeGreaterThan(0);
  });

  it("send the bigger kind on invasions from beyond the rim", () => {
    for (const r of Object.values(ROAMING_MONSTERS)) {
      expect(r.designId.endsWith("Elder")).toBe(true);
      expect(MONSTER_DESIGNS.some((d) => d.id === r.designId)).toBe(true);
    }
  });

  it("build the Guardian on a titan with xentronium armor, a class V shield and the elders' specials", () => {
    const s = newGame({ seed: "mon", races: ["terran", "felhari"], monsters: true });
    const g = designStats(s.players[monstersId(s)!]!, monsterDesign("guardian"));
    expect([g.structure, g.armor, g.shield, g.shieldStrength]).toEqual([800, 800, 5, 125]);
    // Moleculartronic 125 + Battle Scanner 50; speed 10 × 5 + Inertial Stabilizer 50.
    expect([g.attack, g.defense]).toEqual([175, 100]);
    expect(g.effects.hardShields).toBeGreaterThan(0);
  });

  it("give old saves the current monster designs", () => {
    const s = newGame({ seed: "mon", races: ["terran", "felhari"], monsters: true });
    const m = s.players[monstersId(s)!]!;
    m.designs = m.designs.filter((d) => !d.id.endsWith("Elder"));
    const next = processTurn(s, {});
    expect(next.players[m.id]!.designs.map((d) => d.id)).toEqual(MONSTER_DESIGNS.map((d) => d.id));
  });
});

describe("slaying the Guardian", () => {
  it("hands the victor the Avenger with the last of the elders in command, and a score bonus", () => {
    const s = newGame({ seed: "npc" });
    const orion = s.galaxy.stars.find((x) => x.special === "orion")!;
    const before = score(s, 0);
    guardianSlain({ state: s, rng: new Rng(seedRng(1)), emit: () => {} }, 0, orion.id);
    expect(s.guardianSlainBy).toBe(0);
    expect(s.players[0]!.designs.some((d) => d.id === AVENGER_DESIGN.id && d.obsolete)).toBe(true);
    const fleet = Object.values(s.fleets).find((f) => f.ownerId === 0 && f.ships.some((x) => x.designId === AVENGER_DESIGN.id))!;
    expect(fleet.starId).toBe(orion.id);
    const hero = s.leaders[heroLeaderId(HEROES.findIndex((h) => h.special === "guardian"))]!;
    expect([hero.ownerId, hero.assignedTo]).toEqual([0, fleet.id]);
    expect(score(s, 0) - before).toBeGreaterThanOrEqual(GUARDIAN_SCORE);
    // Only once.
    guardianSlain({ state: s, rng: new Rng(seedRng(2)), emit: () => {} }, 1, orion.id);
    expect(s.guardianSlainBy).toBe(0);
  });
});

describe("who monsters attack", () => {
  function lairWith(designId: string, races = ["quillan", "terran"]): { s: GameState; star: string } {
    const s = newGame({ seed: "lucky", races, monsters: true, raiders: false, council: false });
    const taken = new Set(Object.values(s.fleets).map((f) => f.starId));
    const star = s.galaxy.stars.find((x) => !taken.has(x.id) && !x.special && x.planetIds.every((id) => !s.planets[id]!.colonyId))!;
    addFleet(s, monstersId(s)!, star.id, [{ designId, count: 1 }], "attack");
    return { s, star: star.id };
  }

  it("leave a lucky empire alone while another empire is there", () => {
    const { s, star } = lairWith("starHydra");
    // Player 0 is lucky and would be met first.
    addFleet(s, 0, star, [{ designId: "scout", count: 1 }]);
    addFleet(s, 1, star, [{ designId: "scout", count: 1 }]);
    const next = processTurn(s, {});
    const first = next.combats[0]!;
    expect(first).toBeDefined();
    expect(first.sides.includes(1)).toBe(true);
    expect(first.sides.includes(0)).toBe(false);
  });

  it("but find a lucky empire that is alone", () => {
    const { s, star } = lairWith("starHydra");
    addFleet(s, 0, star, [{ designId: "scout", count: 1 }]);
    expect(processTurn(s, {}).combats).toHaveLength(1);
  });

  it("never start a fight when they are ion eels", () => {
    const { s, star } = lairWith("ionEel");
    addFleet(s, 0, star, [{ designId: "scout", count: 1 }]);
    expect(processTurn(s, {}).combats).toHaveLength(0);
  });
});

describe("ship officers in battle", () => {
  it("lend the best Weaponry and Helmsman on a side to every ship of it, Helmsman half against missiles", () => {
    const s = newGame({ seed: "off", races: ["terran", "felhari"], ...quiet });
    s.players[0]!.contacts = [1];
    s.players[1]!.contacts = [0];
    s.relations["0-1"] = { status: "war", trade: false, research: false, since: 1 };
    const star = s.players[1]!.homeStarId;
    const a = addFleet(s, 0, star, [{ designId: "frigate", count: 1 }], "attack");
    const b = addFleet(s, 0, star, [{ designId: "frigate", count: 1 }], "attack");
    const enemy = addFleet(s, 1, star, [{ designId: "frigate", count: 1 }]);
    const side = (ownerId: number, fleets: Fleet[]) => ({ ownerId, fleets, attacksPlanet: false });
    const measure = () => {
      const battle = prepareBattle(s, new Rng({ s: 1 }), side(0, [a, b]), side(1, [enemy]));
      battle.updateSideAttack();
      const mine = battle.units.find((u) => u.fleetId === b.id)!;
      const foe = battle.units.find((u) => u.fleetId === enemy.id)!;
      return { attack: battle.attackOf(mine, foe), defense: battle.defenseOf(mine), missiles: battle.missileEvasionOf(mine), officers: battle.officers[0]! };
    };
    const plain = measure();
    // Level 3: Weaponry 3 × 5 = 15, improved Helmsman 3 × 7.5 = 22.
    captain(s, 0, a.id, [{ skill: "weaponry", improved: false }, { skill: "helmsman", improved: true }, { skill: "ordnance", improved: false }], 3);
    const led = measure();
    expect(led.attack - plain.attack).toBe(15);
    expect(led.defense - plain.defense).toBe(22);
    expect(led.missiles - plain.missiles).toBe(11);
    expect(led.officers.damagePct).toBe(15);
  });
});

describe("leader details", () => {
  it("pay Megawealth as a flat 10 BC, 15 improved, whatever the level", () => {
    for (const level of [1, 3, 6]) {
      expect(abilityValue({ skill: "megawealth", improved: false }, level)).toBe(10);
      expect(abilityValue({ skill: "megawealth", improved: true }, level)).toBe(15);
    }
  });

  it("give troops landing from orbit a captain's Commando at the invasion rate", () => {
    expect(invasionCommando({ skill: "commando", improved: false }, 3)).toBe(15);
    expect(invasionCommando({ skill: "commando", improved: true }, 3)).toBe(23);
  });

  it("reach further into the roster with more empires in the game", () => {
    const two = newGame({ seed: "roster", races: ["terran", "felhari"], playerCount: 2, ...quiet });
    const four = newGame({ seed: "roster", races: ["terran", "felhari", "lysari", "quillan"], playerCount: 4, ...quiet });
    expect(rosterReach(four, 0) - rosterReach(two, 0)).toBe(2);
  });
});
