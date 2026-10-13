import { describe, expect, it } from "vitest";
import {
  COVET, HERO_SKILLS, RAIDER_DESIGNS, Rng, TECHS, WEAPONS_BY_ID, abilityValue, acceptProposal, canReceiveTech, canSign, computeOutput,
  counterPrice, covetedSystem, createBattle, declareWar, deriveSkills, diplomacyTick, empireBonus, getRace, giftProblem, growthPerTurn,
  heroLeaderId, newGame, population, processTurn, proposalId, raiderDesign, rackShots, rejectProposal, relation, tacticsAt,
  type Colony, type GameState, type Proposal,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

function met(seed: string, races = ["terran", "felhari"], extra: object = {}): GameState {
  const s = newGame({ seed, races, ...quiet, ...extra });
  for (const p of s.players) if (p.kind === "empire") p.contacts = s.players.filter((q) => q.kind === "empire" && q.id !== p.id).map((q) => q.id);
  return s;
}

const homeColony = (s: GameState, owner: number): Colony => Object.values(s.colonies).find((c) => c.ownerId === owner)!;
const starOfColony = (s: GameState, c: Colony) => s.planets[c.planetId]!.starId;

/** Posts a hero with the given abilities as player `owner`'s administrator at a star. */
function postAdministrator(s: GameState, owner: number, starId: string, skills: string[]): void {
  const l = s.leaders[heroLeaderId(0)]!;
  l.kind = "administrator";
  l.abilities = skills.map((x) => ({ skill: x.replace("*", "") as never, improved: x.endsWith("*") }));
  l.level = 3;
  l.status = "hired";
  l.ownerId = owner;
  l.assignedTo = starId;
  l.skills = deriveSkills(l);
}

describe("Tactics", () => {
  it("gives the owner's units initiative in battles in the administrator's system", () => {
    const s = met("tactics");
    const star = starOfColony(s, homeColony(s, 0));
    expect(tacticsAt(s, star, 0)).toBe(0);
    postAdministrator(s, 0, star, ["tactics"]);
    expect(tacticsAt(s, star, 0)).toBe(abilityValue({ skill: "tactics", improved: false }, 3));
    expect(tacticsAt(s, star, 0)).toBe(6);
    expect(tacticsAt(s, star, 1)).toBe(0);
    const battle = createBattle(s, new Rng({ s: 1 }), star, { ownerId: 0, fleets: [], attacksPlanet: false }, { ownerId: 1, fleets: [], attacksPlanet: false });
    expect(battle.tactics).toEqual([6, 0]);
    expect(HERO_SKILLS.tactics.text).toContain("initiative");
  });
});

describe("the improved Spiritual Leader", () => {
  it("gives floor((3 x level + 1) / 2) morale steps of 5%, the normal one a step a level", () => {
    const at = (improved: boolean) => [1, 2, 3, 4, 5, 6].map((l) => abilityValue({ skill: "spiritualLeader", improved }, l));
    expect(at(true)).toEqual([10, 15, 25, 30, 40, 45]);
    expect(at(false)).toEqual([5, 10, 15, 20, 25, 30]);
  });
});

describe("conquered people", () => {
  it("grow by their own race's rules, not their new owner's", () => {
    const s = met("aliens", ["terran", "draskar"]);
    const c = homeColony(s, 1);
    // Taken by player 0, as a conquest leaves it: the people keep their race and are unassimilated.
    c.ownerId = 0;
    c.formerOwnerId = 1;
    c.farmers = 1;
    c.workers = 1;
    c.scientists = 0;
    c.aliens = population(c);
    const planet = s.planets[c.planetId]!;
    const owner = s.players[0]!;
    const out = computeOutput(planet, owner, c);
    const draskar = getRace("draskar");
    expect(c.raceId).toBe("draskar");
    expect(draskar.picks.growth).not.toBe(getRace("terran").picks.growth);
    const expected = growthPerTurn(population(c), population(c), out.maxPopulation, draskar, c.buildings, empireBonus(owner).growth * 100);
    expect(out.growthK).toBe(expected);
    expect(out.growthK).toBeGreaterThan(growthPerTurn(population(c), population(c), out.maxPopulation, getRace("terran"), c.buildings, empireBonus(owner).growth * 100));
  });
});

describe("technologies the receiver can't use", () => {
  it("leaves out other governments' advanced forms in trades, prices, demands and gifts", () => {
    const s = met("govtech", ["terran", "felhari"]);
    const [a, b] = [s.players[0]!, s.players[1]!];
    const other = (Object.keys(TECHS) as string[]).find((t) => TECHS[t]?.government && TECHS[t]!.government !== advancedOf(b.government))!;
    const fits = (Object.keys(TECHS) as string[]).find((t) => TECHS[t]?.government === advancedOf(b.government));
    expect(other).toBeDefined();
    a.techs.push(other);
    expect(canReceiveTech(b, other)).toBe(false);
    if (fits) {
      a.techs.push(fits);
      expect(canReceiveTech(b, fits)).toBe(true);
    }
    expect(giftProblem(s, 0, 1, { techId: other })).toBe("they cannot use that technology");
    const want = b.techs.find((t) => !a.techs.includes(t) && canReceiveTech(a, t));
    if (want) expect(canSign(s, 0, 1, "techExchange", { techId: other, wantTechId: want })).toBe("they cannot use what you offer");
    // A ruler never asks for a technology it could not use.
    for (let level = 1; level <= 8; level++) {
      for (let k = 0; k < 20; k++) expect(counterPrice(s, 1, 0, level, `k${k}`, "nonAggression")?.techId).not.toBe(other);
    }
  });
});

function advancedOf(gov: string): string | null {
  return ({ feudal: "confederation", dictatorship: "imperium", democracy: "federation", unification: "galacticUnification" } as Record<string, string>)[gov] ?? null;
}

describe("payments with a proposal", () => {
  it("are paid by the proposer on acceptance, and only when it can afford them", () => {
    const s = met("payment", ["terran", "felhari"], { humanPlayers: [0] });
    declareWar(s, 1, 0);
    s.players[1]!.bc = 300;
    const before = s.players[0]!.bc;
    expect(canSign(s, 1, 0, "peace", { payment: { bc: 1000 } })).toMatch(/payment/);
    expect(canSign(s, 1, 0, "peace", { payment: { bc: 200 } })).toBeNull();
    const p: Proposal = { id: proposalId(s.turn, 1, 0, "peace"), from: 1, to: 0, kind: "peace", turn: s.turn, payment: { bc: 200 } };
    acceptProposal(s, p);
    expect(relation(s, 0, 1).status).not.toBe("war");
    expect(s.players[0]!.bc).toBe(before + 200);
    expect(s.players[1]!.bc).toBe(100);
  });

  it("go through the propose command", () => {
    let s = met("paycmd", ["terran", "felhari", "kordex"], { humanPlayers: [0] });
    declareWar(s, 1, 2);
    s.players[1]!.bc = 500;
    s = processTurn(s, { 1: [{ type: "propose", to: 0, kind: "demandWar", third: 2, payment: { bc: 100 } }] });
    const p = s.proposals.find((x) => x.from === 1 && x.to === 0 && x.kind === "demandWar")!;
    expect(p.payment).toEqual({ bc: 100 });
    const bc = s.players[0]!.bc;
    s = processTurn(s, { 0: [{ type: "respond", proposalId: p.id, accept: true }] });
    expect(relation(s, 0, 2).status).toBe("war");
    expect(s.players[0]!.bc).toBeGreaterThanOrEqual(bc + 100 - 50);
  });
});

describe("a computer ruler's coveted system", () => {
  /** Gives player 0 a second, populous system next to player 1's home. */
  function setup(seed: string): { s: GameState; star: string } {
    const s = met(seed, ["terran", "felhari"], { humanPlayers: [0] });
    const theirs = starOfColony(s, homeColony(s, 1));
    const home = starOfColony(s, homeColony(s, 0));
    const planet = Object.values(s.planets).find((p) => p.starId === theirs && !p.colonyId)
      ?? Object.values(s.planets).find((p) => p.starId !== home && p.starId !== theirs && !p.colonyId)!;
    const c: Colony = { ...structuredClone(homeColony(s, 0)), id: "cX", planetId: planet.id, buildings: [], farmers: 4, workers: 4, scientists: 4 };
    s.colonies[c.id] = c;
    planet.colonyId = c.id;
    return { s, star: planet.starId };
  }

  it("is a system of yours in its reach worth enough, never your capital's", () => {
    const { s, star } = setup("covet");
    expect(covetedSystem(s, 1, 0)?.starId).toBe(star);
    expect(covetedSystem(s, 1, 0)!.value).toBe(12 * COVET.perPop);
    s.colonies.cX!.workers = 0;
    s.colonies.cX!.scientists = 0;
    expect(covetedSystem(s, 1, 0)).toBeNull();
  });

  it("is demanded on refusal of which, or when the demand lapses, the ruler declares war", () => {
    const { s, star } = setup("covet2");
    const id = proposalId(s.turn, 1, 0, "demandSystem");
    const p: Proposal = { id, from: 1, to: 0, kind: "demandSystem", turn: s.turn, starId: star };
    expect(canSign(s, 1, 0, "demandSystem", p)).toBeNull();
    rejectProposal(s, p);
    expect(relation(s, 0, 1).status).toBe("war");

    const t = setup("covet3").s;
    t.proposals.push({ ...p, turn: t.turn - 5 });
    diplomacyTick(t, new Rng({ s: 2 }));
    expect(relation(t, 0, 1).status).toBe("war");
    expect(t.proposals.some((x) => x.id === id)).toBe(false);

    const u = setup("covet4");
    acceptProposal(u.s, { ...p, starId: u.star });
    expect(u.s.colonies.cX!.ownerId).toBe(1);
  });

  it("is not coveted on easy levels", () => {
    const { s } = setup("covet5");
    s.settings.difficulty = "easy";
    expect(covetedSystem(s, 1, 0)).toBeNull();
  });
});

describe("raider frigates", () => {
  it("carry a neutronium bomb with no shots, as in the original", () => {
    const bomb = RAIDER_DESIGNS.frigate.weapons.find((w) => w.weaponId === "neutroniumBomb")!;
    expect(bomb.ammo).toBe(0);
    const mount = raiderDesign("frigate").weapons.find((w) => w.weaponId === "neutroniumBomb")!;
    expect(rackShots(WEAPONS_BY_ID.neutroniumBomb!, mount)).toBe(0);
    const destroyer = raiderDesign("destroyer").weapons.find((w) => w.weaponId === "neutroniumBomb")!;
    expect(rackShots(WEAPONS_BY_ID.neutroniumBomb!, destroyer)).toBe(10);
  });
});
