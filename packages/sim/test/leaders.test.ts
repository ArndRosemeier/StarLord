import { describe, expect, it } from "vitest";
import {
  HEROES, LEADER_RULES, RACES, abilityValue, basePrice, commandPointsAvailable, defensiveSpyPoints, getRace, heroJoins,
  heroLeaderId, hirePrice, levelFromXp, newGame, offensiveSpyPoints, playerView, processTurn, raceCost, raceMaxPopulation,
  shipAttackPickBonus, shipDefensePickBonus, upkeep, validateCommand, type GameState,
} from "@starlord/sim";

const quiet = { monsters: false, council: false } as const;

function game(races: string[] = ["terran", "felhari"], seed = "lead"): GameState {
  return newGame({ seed, races, ...quiet });
}

/** Offers a hero to player 0 directly, as the turn would. */
function offer(s: GameState, heroId: number, playerId = 0): string {
  const l = s.leaders[heroLeaderId(heroId)]!;
  l.status = "offered";
  l.offeredTo = playerId;
  l.availableUntil = s.turn + LEADER_RULES.queueTurns;
  return l.id;
}

describe("premade races", () => {
  it("each cost exactly the 10-point budget", () => {
    for (const r of RACES) expect(raceCost(r.picks).total, r.id).toBe(10);
  });
});

describe("race picks", () => {
  it("use the original magnitudes", () => {
    const pick = (shipAttack: number, shipDefense: number) => ({ ...getRace("terran"), picks: { ...getRace("terran").picks, shipAttack, shipDefense } });
    expect([-1, 1, 2].map((v) => shipAttackPickBonus(pick(v, 0)))).toEqual([-20, 20, 50]);
    expect([-1, 1, 2].map((v) => shipDefensePickBonus(pick(0, v)))).toEqual([-20, 25, 50]);
    // Defending spies get half the racial bonus; telepaths add 10 both ways.
    const spy = { ...getRace("terran"), picks: { ...getRace("terran").picks, spying: 2 } };
    expect(offensiveSpyPoints(spy)).toBe(20);
    expect(defensiveSpyPoints(spy)).toBe(10);
    expect(offensiveSpyPoints(getRace("lysari"))).toBe(10);
  });

  it("raise population for aquatic, subterranean and tolerant races", () => {
    const base = raceMaxPopulation(getRace("terran"), "ocean", "medium");
    expect(raceMaxPopulation(getRace("thalassi"), "ocean", "medium")).toBeGreaterThan(base);
    expect(raceMaxPopulation(getRace("draskar"), "ocean", "medium")).toBeGreaterThan(base);
    expect(raceMaxPopulation(getRace("petrani"), "desert", "medium")).toBeGreaterThan(raceMaxPopulation(getRace("terran"), "desert", "medium"));
  });

  it("give warlords command points per colony", () => {
    const s = game(["felhari", "terran"]);
    const t = game(["terran", "felhari"]);
    expect(commandPointsAvailable(s, 0) - commandPointsAvailable(t, 0)).toBe(2);
  });

  it("hide stealthy fleets and show every fleet to the omniscient", () => {
    const s = game(["shadar", "lysari"]);
    const far = Object.values(s.fleets).find((f) => f.ownerId === 0)!;
    expect(playerView(s, 1).fleets[far.id]).toBeDefined();
    const t = game(["shadar", "terran"]);
    const hidden = Object.values(t.fleets).find((f) => f.ownerId === 0)!;
    expect(playerView(t, 1).fleets[hidden.id]).toBeUndefined();
  });
});

describe("leaders", () => {
  it("has the full roster with original names", () => {
    expect(HEROES).toHaveLength(67);
    expect(HEROES.filter((h) => h.kind === "captain")).toHaveLength(41);
    expect(HEROES.filter((h) => h.kind === "administrator")).toHaveLength(26);
    const s = game();
    expect(Object.keys(s.leaders)).toHaveLength(67);
    expect(Object.values(s.leaders).every((l) => l.status === "pool")).toBe(true);
  });

  it("levels with experience, one more for warlords", () => {
    expect([0, 59, 60, 150, 300, 500, 1000, 5000].map((x) => levelFromXp(x, false))).toEqual([1, 1, 2, 3, 4, 5, 5, 5]);
    expect(levelFromXp(1000, true)).toBe(6);
    expect(abilityValue({ skill: "laborLeader", improved: false }, 3)).toBe(30);
    expect(abilityValue({ skill: "navigator", improved: false }, 3)).toBe(2);
    expect(abilityValue({ skill: "famous", improved: true }, 1)).toBe(90);
  });

  it("price leaders by skill weight and level, cheaper for charismatic races", () => {
    const s = game(["terran", "gorvath"]);
    const l = s.leaders[heroLeaderId(0)]!;
    expect(basePrice(s, null, l)).toBeGreaterThan(0);
    expect(hirePrice(s, 0, l)).toBe(Math.round(basePrice(s, 0, l) / 2));
    expect(upkeep(s, 0, l)).toBe(Math.max(1, Math.ceil(basePrice(s, 0, l) / 100)));
  });

  it("offers leaders that can be hired, assigned and dismissed", () => {
    let s = game();
    for (let i = 0; i < 30 && !s.players[0]!.leaderOffers.length; i++) s = processTurn(s, {});
    const o = s.players[0]!.leaderOffers[0]!;
    expect(o).toBeDefined();
    expect(playerView(s, 1).players[0]!.leaderOffers).toHaveLength(0);
    s.players[0]!.bc = 10000;
    s = processTurn(s, { 0: [{ type: "hireLeader", leaderId: o.id }] });
    const l = s.leaders[o.id]!;
    expect(l.status).toBe("hired");
    expect(l.ownerId).toBe(0);
    expect(s.players[0]!.bc).toBeLessThan(10000);
    s = processTurn(s, { 0: [{ type: "dismissLeader", leaderId: o.id }] });
    expect(s.leaders[o.id]!.status).toBe("pool");
  });

  it("teach their technologies and limit each kind", () => {
    const s = game();
    const id = offer(s, 57);
    s.players[0]!.bc = 100000;
    const t = processTurn(s, { 0: [{ type: "hireLeader", leaderId: id }] });
    for (const tech of HEROES[57]!.techs!) expect(t.players[0]!.techs).toContain(tech);
    // A fifth ship officer is refused.
    const u = game();
    u.players[0]!.bc = 100000;
    const captains = HEROES.map((h, i) => [h, i] as const).filter(([h]) => h.kind === "captain" && !h.special).map(([, i]) => i);
    for (const i of captains.slice(0, LEADER_RULES.maxPerKind)) {
      const l = u.leaders[heroLeaderId(i)]!;
      l.status = "hired";
      l.ownerId = 0;
    }
    const next = offer(u, captains[LEADER_RULES.maxPerKind]!);
    expect(validateCommand(u, 0, { type: "hireLeader", leaderId: next }).ok).toBe(false);
  });

  it("travel to distant posts and gain experience", () => {
    const s = game();
    const id = offer(s, 0);
    s.players[0]!.bc = 100000;
    let t = processTurn(s, { 0: [{ type: "hireLeader", leaderId: id }] });
    const fleet = Object.values(t.fleets).find((f) => f.ownerId === 0)!;
    const l = t.leaders[id]!;
    expect(HEROES[0]!.kind === "captain" || HEROES[0]!.kind === "administrator").toBe(true);
    const target = l.kind === "captain" ? fleet.id : t.players[0]!.homeStarId;
    t = processTurn(t, { 0: [{ type: "assignLeader", leaderId: id, targetId: target }] });
    expect(t.leaders[id]!.assignedTo).toBe(target);
    const xp = t.leaders[id]!.xp;
    t = processTurn(t, {});
    expect(t.leaders[id]!.xp).toBeGreaterThan(xp);
  });

  it("let special heroes join through deeds", () => {
    const s = game();
    heroJoins(s, 0, "guardian");
    const elder = Object.values(s.leaders).find((l) => HEROES[l.heroId]!.special === "guardian")!;
    expect(elder.ownerId).toBe(0);
    expect(elder.salary).toBe(0);
  });
});
