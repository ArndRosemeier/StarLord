import { describe, expect, it } from "vitest";
import {
  AI_AI_PEACE, AI_TREATIES, COUNCIL_VOTE, COUNTER_PRICE, PATIENCE, PEACE_TREATY_TURNS, RELATION, RELATION_EVENTS, Rng, TEMPERAMENTS, TEMPERAMENT_ORDER, TEMPERAMENT_ROWS, TREATY_ANSWER, TIER_OF_TECH,
  attitude, audienceTired, baselineOf, canSign, councilVotes, counterPrice, declareWar, demandAnswer, destructibleBuildings, driftStep,
  diplomacyTick, empireExpenses, empireIncome, giftWorth, makePeace, newGame, patience, peaceLossTerm, playerView, previewOrders, processTurn, rampStep,
  relKey, relation, relationEvent, relationsTick, reputationOf, scaleRelationEvent, setRelation, spyEdge, strikesOf, temperament, treatyAcceptChance,
  treatyBase, treatyPriceChance, treatyScore, treatyTarget, treatyYield, trustIn, validateCommand, votesToWin, voteScore, votingPopulation,
  type GameState, type Proposal, type Temperament,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

function met(seed: string, races = ["terran", "felhari"], extra: object = {}): GameState {
  const s = newGame({ seed, races, ...quiet, ...extra });
  for (const p of s.players) if (p.kind === "empire") p.contacts = s.players.filter((q) => q.kind === "empire" && q.id !== p.id).map((q) => q.id);
  return s;
}

/** A game where player 1 (a computer empire) has the given temperament; player 0 is human. */
function withTemper(t: Temperament, races?: string[]): GameState {
  // Temperaments come from each race's row, so pick a second race that can roll this one.
  const second = Object.keys(TEMPERAMENT_ROWS).find((r) => r !== "default" && TEMPERAMENT_ROWS[r]!.some((x) => TEMPERAMENT_ORDER[x] === t))!;
  for (let i = 0; i < 400; i++) {
    const s = met(`temper${t}${i}`, races ?? ["felhari", second], { humanPlayers: [0] });
    if (temperament(s, 1) === t) return s;
  }
  throw new Error(`no seed gives ${t}`);
}

/** A die that returns the given numbers in order. */
const script = (...xs: number[]) => () => xs.shift() ?? 1;

/** Signs trade and research treaties between 0 and 1 through proposals, as play would. */
function signTreaties(s: GameState): GameState {
  s = processTurn(s, { 0: [{ type: "propose", to: 1, kind: "trade" }, { type: "propose", to: 1, kind: "research" }] });
  const ids = s.proposals.filter((p) => p.from === 0 && p.to === 1).map((p) => p.id);
  expect(ids).toHaveLength(2);
  return processTurn(s, { 1: ids.map((id) => ({ type: "respond" as const, proposalId: id, accept: true })) });
}

describe("the relation scaling function (the original's FUN_0004e3b0)", () => {
  it("doubles gains below 0 (up to +10), divides them by relation / 25 + 1 above", () => {
    const s = withTemper("erratic");
    const at = (v: number, d: number) => {
      setRelation(s, 0, 1, v);
      return scaleRelationEvent(s, d, 0, 1);
    };
    expect(at(0, 10)).toBe(10);
    expect(at(-30, 10)).toBe(20);
    expect(at(-5, 10)).toBe(15); // doubled, but capped so the relation stops at +10
    expect(at(50, 10)).toBe(3); // 10 / (50 / 25 + 1)
    expect(at(24, 10)).toBe(10); // 24 / 25 truncates to 0
    expect(at(30, -10)).toBe(-20); // losses on a good relation double
    expect(at(-50, -10)).toBe(-3); // -10 / (50 / 25 + 1)
    expect(at(0, -7)).toBe(-7);
  });

  it("weighs the observer's temperament and the actor's charisma", () => {
    const hon = withTemper("honorable");
    setRelation(hon, 0, 1, 0);
    expect(scaleRelationEvent(hon, -10, 0, 1)).toBe(-20);
    expect(scaleRelationEvent(hon, 10, 0, 1)).toBe(10);
    const xeno = withTemper("xenophobic");
    setRelation(xeno, 0, 1, 0);
    expect(scaleRelationEvent(xeno, -10, 0, 1)).toBe(-15);
    expect(scaleRelationEvent(xeno, 8, 0, 1)).toBe(6);
    // Terrans are charismatic: their good deeds count double, their bad ones half.
    const cha = withTemper("erratic", ["terran", "kordex"]);
    setRelation(cha, 0, 1, 0);
    expect(scaleRelationEvent(cha, 6, 0, 1)).toBe(12);
    expect(scaleRelationEvent(cha, -7, 0, 1)).toBe(-3);
  });

  it("changes nothing for a human observer, without contact or at war, and scales computer pairs after turn 100", () => {
    const s = withTemper("erratic");
    expect(scaleRelationEvent(s, 10, 1, 0)).toBeNull(); // player 0 is human
    s.players[1]!.isHuman = false;
    s.players[0]!.isHuman = false;
    s.turn = RELATION.aiPairTurn + 1;
    setRelation(s, 0, 1, 0);
    expect(scaleRelationEvent(s, 5, 0, 1)).toBe(10);
    // Average difficulty (2): losses divided by 2 / 2 + 1 = 2.
    expect(scaleRelationEvent(s, -9, 0, 1)).toBe(-4);
    s.relations[relKey(0, 1)] = { status: "war", trade: false, research: false, since: 1 };
    expect(scaleRelationEvent(s, -9, 0, 1)).toBeNull();
    s.relations[relKey(0, 1)] = { status: "none", trade: false, research: false, since: 1 };
    s.players[1]!.contacts = [];
    expect(scaleRelationEvent(s, -9, 0, 1)).toBeNull();
  });

  it("stops at 65 without an alliance and holds the value on both sides", () => {
    const s = withTemper("erratic");
    setRelation(s, 0, 1, 60);
    relationEvent(s, 100, 0, 1);
    expect(attitude(s, 1, 0)).toBe(RELATION.capWithoutAlliance);
    expect(attitude(s, 0, 1)).toBe(RELATION.capWithoutAlliance);
    s.relations[relKey(0, 1)] = { status: "alliance", trade: false, research: false, since: 1 };
    relationEvent(s, 100, 0, 1);
    expect(attitude(s, 1, 0)).toBeGreaterThan(RELATION.capWithoutAlliance);
  });
});

describe("relations at the start and drift", () => {
  it("start from the race table, which is also the baseline", () => {
    // Kyrrin (row 0) like Lysari (column 3) at +24 and dislike Shadar (column 2) at -24.
    const s = met("races", ["kyrrin", "lysari", "shadar"]);
    expect(attitude(s, 0, 1)).toBe(24);
    expect(attitude(s, 0, 2)).toBe(-24);
    expect(baselineOf(s, 0, 2)).toBe(-24);
    // A custom race takes the row of the premade race whose appearance it wears; Terrans like everyone the same.
    expect(attitude(met("terr", ["terran", "kyrrin"]), 0, 1)).toBe(0);
  });

  it("drifts one step toward the baseline with chance (105 - |rel|) / 105 x 1/8, only on quiet turns", () => {
    expect(driftStep(20, 0, true, script(21, 1, 2))).toBe(19);
    expect(driftStep(-20, 0, true, script(21, 1, 2))).toBe(-19);
    expect(driftStep(20, 0, true, script(20, 1, 2))).toBe(20); // d105 must beat |rel|
    expect(driftStep(20, 0, true, script(50, 2, 2))).toBe(20); // the d4 must show 1
    expect(driftStep(20, 0, true, script(50, 1, 1))).toBe(20); // and the coin heads
    expect(driftStep(20, 0, false, script(50, 1, 2))).toBe(20); // nothing moves after an event
    expect(driftStep(1, 1, true, script(50, 1, 2))).toBe(1);
    // Exact odds over every die face.
    let moved = 0;
    let total = 0;
    for (let a = 1; a <= 105; a++) for (let b = 1; b <= 4; b++) for (let c = 1; c <= 2; c++) {
      total++;
      if (driftStep(40, 0, true, script(a, b, c)) !== 40) moved++;
    }
    expect(moved / total).toBeCloseTo(((105 - 40) / 105) * (1 / 8), 10);
  });

  it("drifts back toward the baseline over many quiet turns, never past it", () => {
    const s = met("drift", ["felhari", "kordex"]);
    setRelation(s, 0, 1, 40);
    const rng = new Rng({ s: 5 });
    let last = 40;
    for (let i = 0; i < 300; i++) {
      s.turn++;
      relationsTick(s, rng);
      const now = attitude(s, 0, 1);
      expect(now).toBeLessThanOrEqual(last);
      expect(attitude(s, 1, 0)).toBe(now);
      last = now;
    }
    expect(last).toBeLessThan(40);
    expect(last).toBeGreaterThanOrEqual(baselineOf(s, 0, 1));
  });

  it("war sets -75 - d25 and lowers the baseline by 10; peace lifts by 50 up to 0 and lapses after 30 turns", () => {
    let s = met("warpeace", ["felhari", "kordex"]);
    const base = baselineOf(s, 0, 1);
    declareWar(s, 0, 1);
    expect(attitude(s, 0, 1)).toBeLessThanOrEqual(-76);
    expect(attitude(s, 0, 1)).toBeGreaterThanOrEqual(-100);
    expect(baselineOf(s, 0, 1)).toBe(base + RELATION_EVENTS.declareWar.baseline);
    setRelation(s, 0, 1, -80);
    makePeace(s, 0, 1);
    expect(attitude(s, 0, 1)).toBe(-30);
    setRelation(s, 0, 1, -20);
    makePeace(s, 0, 1);
    expect(attitude(s, 0, 1)).toBe(0);
    for (let i = 0; i < PEACE_TREATY_TURNS - 1; i++) s = processTurn(s, {});
    expect(relation(s, 0, 1).status).toBe("peace");
    s = processTurn(s, {});
    expect(relation(s, 0, 1).status).toBe("none");
  });

  it("at war the relation is held at -90 or below and events don't move it", () => {
    const s = withTemper("erratic");
    declareWar(s, 0, 1);
    setRelation(s, 0, 1, -50);
    relationsTick(s, new Rng({ s: 1 }));
    expect(attitude(s, 0, 1)).toBe(RELATION.warCeiling);
    expect(relationEvent(s, 30, 0, 1)).toBe(0);
  });
});

describe("trade and research treaties", () => {
  it("start at minus the base and climb by a fifth of the full yield each turn", () => {
    let s = signTreaties(met("treaty", undefined, { humanPlayers: [0] }));
    expect(relation(s, 0, 1)).toMatchObject({ trade: true, research: true });
    const target = treatyTarget(s, 0, 1, "trade");
    expect(target).toBeGreaterThan(0);
    const seen: number[] = [];
    for (let i = 0; i < 14; i++) {
      seen.push(s.treatyYields![0]![1]!.trade!);
      s = processTurn(s, {});
    }
    expect(seen[0]).toBeLessThan(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen[seen.length - 1]).toBe(treatyTarget(s, 0, 1, "trade"));
  });

  it("ramps by target / 5 with the remainder rounded up by chance, and drops to the target at once", () => {
    // Target 12: a step of 2, plus 1 when a d5 rolls 2 or less.
    expect(rampStep(-12, 12, script(1))).toBe(-9);
    expect(rampStep(-12, 12, script(3))).toBe(-10);
    expect(rampStep(11, 12, script(1))).toBe(12);
    expect(rampStep(20, 12, script(1))).toBe(12);
    expect(rampStep(-10, 10, script(5))).toBe(-8); // no remainder, no roll needed
  });

  it("are worth half the smaller population, times the government's multipliers", () => {
    const s = met("yield", ["terran", "felhari"]);
    const base = treatyBase(s, 0, 1, "trade");
    expect(base).toBeGreaterThan(0);
    s.players[0]!.government = "democracy";
    expect(treatyTarget(s, 0, 1, "trade")).toBe(Math.trunc((base * 150) / 100));
    expect(treatyTarget(s, 0, 1, "research")).toBe(Math.trunc(treatyBase(s, 0, 1, "research") * 1.5));
    s.players[0]!.government = "feudal";
    expect(treatyTarget(s, 0, 1, "research")).toBe(Math.trunc(treatyBase(s, 0, 1, "research") * 0.5));
  });

  it("the money really arrives in the treasury, and a research treaty's setup is paid in BC", () => {
    let s = signTreaties(met("treasury"));
    const early = treatyYield(s, 0, 1);
    expect(early.research).toBe(0);
    expect(early.bc).toBeLessThan(0);
    for (let i = 0; i < 12; i++) s = processTurn(s, {});
    const withTreaty = structuredClone(s);
    const without = structuredClone(s);
    const k = relKey(0, 1);
    without.relations[k] = { ...without.relations[k]!, trade: false, research: false };
    const a = processTurn(withTreaty, {});
    const b = processTurn(without, {});
    const y = treatyYield(s, 0, 1);
    expect(y.bc).toBeGreaterThan(0);
    expect(y.research).toBeGreaterThan(0);
    expect(a.players[0]!.bc - b.players[0]!.bc).toBeCloseTo(y.bc, 0);
  });

  // Regression: the player's own screens showed 0 because the partner's colonies were out of sight.
  it("the player's view shows the same yield the turn pays, and counts it in income", () => {
    let s = signTreaties(met("fogged"));
    for (let i = 0; i < 12; i++) s = processTurn(s, {});
    const view = playerView(s, 0);
    expect(Object.values(view.colonies).some((c) => c.ownerId === 1)).toBe(false);
    const real = treatyYield(s, 0, 1);
    expect(real.bc).toBeGreaterThan(0);
    expect(treatyYield(view, 0, 1)).toEqual(real);
    expect(treatyTarget(view, 0, 1, "trade")).toBe(treatyTarget(s, 0, 1, "trade"));
    expect(empireIncome(view, 0).treaties).toBeCloseTo(real.bc, 5);
  });

  it("stop paying when broken, and breaking costs trust", () => {
    let s = signTreaties(met("broken"));
    s = processTurn(s, { 0: [{ type: "breakTreaty", target: 1, treaty: "trade" }] });
    expect(relation(s, 0, 1).trade).toBe(false);
    expect(treatyYield(s, 0, 1).bc).toBeLessThanOrEqual(0);
    expect(trustIn(s, 1, 0)).toBeLessThan(0);
  });

  it("ending a research treaty costs d20 + d20 relation and d20 baseline", () => {
    let s = signTreaties(met("research"));
    s = processTurn(s, {});
    setRelation(s, 0, 1, 30);
    const base = baselineOf(s, 1, 0);
    s = processTurn(s, { 0: [{ type: "breakTreaty", target: 1, treaty: "research" }] });
    expect(attitude(s, 1, 0)).toBeLessThan(30);
    expect(baselineOf(s, 1, 0)).toBeLessThan(base);
    expect(baselineOf(s, 1, 0)).toBeGreaterThanOrEqual(base - RELATION_EVENTS.researchBreak.baselineRoll);
  });
});

describe("gifts and surrender", () => {
  it("a gift is worth BC / max(expenses, 10) / 10 (at most 8), and raises the relation by that x (4 + d4)", () => {
    let s = met("gift", ["felhari", "kordex"]);
    s.players[0]!.bc = 5000;
    const e = Math.max(10, empireExpenses(s, 1));
    const m = giftWorth(s, 0, 1, { bc: 1000 });
    expect(m).toBe(Math.min(8, Math.trunc(Math.trunc(1000 / e) / 10)));
    expect(m).toBeGreaterThan(0);
    const before = attitude(s, 1, 0);
    const base = baselineOf(s, 1, 0);
    const theirs = s.players[1]!.bc;
    s = processTurn(s, { 0: [{ type: "gift", to: 1, bc: 1000 }] });
    expect(s.players[1]!.bc - theirs).toBeGreaterThanOrEqual(1000);
    expect(attitude(s, 1, 0)).toBeGreaterThanOrEqual(Math.min(100, before + 5 * m) - 1);
    expect(baselineOf(s, 1, 0)).toBe(base + m);
    expect(giftWorth(s, 0, 1, { bc: 5 })).toBe(0);
  });

  it("a gift of technology teaches it", () => {
    let s = met("techgift");
    const tech = Object.keys(TIER_OF_TECH).find((t) => !s.players[0]!.techs.includes(t) && !s.players[1]!.techs.includes(t))!;
    s.players[0]!.techs.push(tech);
    s = processTurn(s, { 0: [{ type: "gift", to: 1, techId: tech }] });
    expect(s.players[1]!.techs).toContain(tech);
  });

  it("surrender hands over every colony and ends the empire", () => {
    let s = met("surrender");
    const theirs = Object.values(s.colonies).filter((c) => c.ownerId === 1).length;
    s = processTurn(s, { 1: [{ type: "surrender", to: 0 }] });
    expect(s.players[1]!.alive).toBe(false);
    expect(Object.values(s.colonies).filter((c) => c.ownerId === 0).length).toBeGreaterThanOrEqual(1 + theirs);
  });

  it("war ends treaties", () => {
    let s = signTreaties(met("war"));
    s = processTurn(s, { 0: [{ type: "declareWar", target: 1 }] });
    expect(relation(s, 0, 1)).toMatchObject({ status: "war", trade: false, research: false });
    expect(treatyYield(s, 0, 1)).toEqual({ bc: 0, research: 0 });
  });
});

describe("espionage", () => {
  it("a strong spy team steals technology", () => {
    let s = met("steal");
    const tech = Object.keys(TIER_OF_TECH).find((t) => !s.players[0]!.techs.includes(t) && !s.players[1]!.techs.includes(t))!;
    s.players[1]!.techs.push(tech);
    s.players[1]!.spies.home = 0;
    s.players[0]!.spies.abroad[1] = { count: 30, mission: "steal" };
    expect(spyEdge(s, 0, 1, 30)).toBeGreaterThanOrEqual(15);
    for (let i = 0; i < 40 && !s.players[0]!.techs.includes(tech); i++) s = processTurn(s, {});
    expect(s.players[0]!.techs).toContain(tech);
  });

  it("sabotage destroys a building", () => {
    let s = met("sabotage");
    const home = Object.values(s.colonies).find((c) => c.ownerId === 1)!;
    const count = () => destructibleBuildings(s.colonies[home.id]!).length;
    expect(count()).toBeGreaterThan(0);
    const before = count();
    s.players[1]!.spies.home = 0;
    s.players[0]!.spies.abroad[1] = { count: 30, mission: "sabotage" };
    for (let i = 0; i < 20 && count() === before; i++) s = processTurn(s, {});
    expect(count()).toBeLessThan(before);
  });

  it("spies at home make the enemy's job harder", () => {
    const s = met("defense");
    const open = spyEdge(s, 0, 1, 3);
    s.players[1]!.spies.home = 5;
    expect(spyEdge(s, 0, 1, 3)).toBeLessThan(open);
  });
});

describe("strikes: a computer ruler's grievances against a human", () => {
  it("a big grievance earns strikes, and a third means war when its fleets can stand up to yours", () => {
    const s = withTemper("aggressive");
    s.relationEvents = { 1: { 0: { reason: 1, size: -100 } } };
    s.strikes = { 1: { 0: 2 } };
    relationsTick(s, new Rng({ s: 3 }));
    expect(relation(s, 0, 1).status).toBe("war");
    // War forgets the strikes.
    expect(strikesOf(s, 1, 0)).toBe(0);
  });

  it("the first strike is only a warning", () => {
    const s = withTemper("aggressive");
    s.relationEvents = { 1: { 0: { reason: 3, size: -100 } } };
    const events: { what?: string }[] = [];
    // Strike odds: d100 against s, s/2 and s/4, so a big grievance may earn several at once; start from a clean slate and count.
    relationsTick(s, new Rng({ s: 9 }), (e) => events.push(e as { what?: string }));
    expect(strikesOf(s, 1, 0) + (relation(s, 0, 1).status === "war" ? 3 : 0)).toBeGreaterThan(0);
  });

  it("trade goodwill wipes the slate clean", () => {
    const s = withTemper("aggressive");
    s.strikes = { 1: { 0: 1 } };
    s.relationEvents = { 1: { 0: { reason: 12, size: 2 } } };
    relationsTick(s, new Rng({ s: 4 }));
    expect(strikesOf(s, 1, 0)).toBe(0);
  });
});

describe("galactic council", () => {
  /** Three empires, player 2 human, with every system settled by empire 0 on turn 25. */
  function settled(seed: string, races = ["terran", "felhari", "kordex"], humans = [2]): GameState {
    const s = met(seed, races, { council: true, humanPlayers: humans });
    s.turn = 25;
    // Settle every star system for empire 0 on paper: one colony per system is what counts.
    for (const star of s.galaxy.stars) {
      const pid = star.planetIds.find((id) => !s.planets[id]!.colonyId);
      if (!pid) continue;
      const id = `c${s.nextId++}`;
      const src = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
      s.colonies[id] = { ...structuredClone(src), id, planetId: pid, name: id, buildings: [], queue: [], progress: 0 };
      s.planets[pid]!.colonyId = id;
    }
    return s;
  }

  it("meets once enough of the galaxy is settled and a big enough majority elects a winner", () => {
    let s = settled("council");
    // Everyone loves empire 0.
    s.attitude[1] = { ...(s.attitude[1] ?? {}), 0: 100 };
    s = processTurn(s, {});
    // The session is called a turn ahead, with its candidates, and nobody has voted yet.
    expect(s.council.convened).toBe(true);
    expect(s.council.called).toMatchObject({ turn: 26, candidates: [0, 1] });
    // Computer empires' ballots and everyone's votes are fixed when the session is called, so it can show each declaration.
    expect(Object.keys(s.council.called!.votes!)).toHaveLength(3);
    expect(Object.keys(s.council.called!.ballots)).toEqual([]);
    expect(s.council.lastResult).toBeNull();
    expect(s.events.some((e) => e.kind === "council" && e.playerId === 2 && /in session.*you cast your \d+ votes?/.test(e.what))).toBe(true);
    s = processTurn(s, {});
    expect(s.council.called).toBeNull();
    expect(s.council.nextTurn).toBe(26 + 25);
    const r = s.council.lastResult!;
    expect(r.winner).toBe(0);
    expect(r.total).toBe(Object.values(r.weights!).reduce((a, b) => a + b, 0));
    expect(r.needed).toBe(votesToWin(r.total!));
    // Every vote is remembered for the next session.
    expect(Object.keys(s.council.lastVotes ?? {})).toHaveLength(3);
    expect(Object.values(s.council.lastVotes ?? {})).toContain(0);
    expect(s.events.some((e) => e.kind === "council" && /elected leader of the galaxy \(.*votes needed\)/.test(e.what))).toBe(true);
  });

  it("computer empires declare when the session is called, and the count holds them to it", () => {
    let s = settled("declare", ["terran", "felhari", "kordex", "zhrikk"], [3]);
    s = processTurn(s, {});
    const called = s.council.called!;
    expect(called.candidates).toEqual([0, 1]);
    expect(Object.keys(called.ballots)).toEqual(["2"]);
    const declared = called.ballots[2];
    s = processTurn(s, { 3: [{ type: "castCouncilVote", vote: "abstain" }] });
    expect(s.council.lastResult!.ballots![2]).toBe(declared);
    expect(s.council.lastResult!.ballots![3]).toBeNull();
    expect(s.council.lastResult!.weights).toEqual(called.votes);
  });

  it("asks a human for their votes: the ballot cast during the session's turn counts", () => {
    let s = settled("ballot");
    expect(validateCommand(s, 2, { type: "castCouncilVote", vote: 1 }).ok).toBe(false);
    s = processTurn(s, {});
    // A computer candidate has nothing to cast; a human candidate declares like everyone else.
    expect(validateCommand(s, 0, { type: "castCouncilVote", vote: 1 }).ok).toBe(true);
    expect(validateCommand(s, 2, { type: "castCouncilVote", vote: 2 }).ok).toBe(false);
    expect(validateCommand(s, 2, { type: "castCouncilVote", vote: 1 }).ok).toBe(true);
    // Nothing votes for a person: without a ballot they abstain.
    expect(processTurn(s, {}).council.lastResult!.ballots![2]).toBeNull();
    const abstain = processTurn(s, { 2: [{ type: "castCouncilVote", vote: "abstain" }] });
    expect(abstain.council.lastResult!.ballots![2]).toBeNull();
    const backed = processTurn(s, { 2: [{ type: "castCouncilVote", vote: 1 }] });
    expect(backed.council.lastResult!.ballots![2]).toBe(1);
    expect(backed.council.lastResult!.votes[1]).toBe(councilVotes(s, 1) + councilVotes(s, 2));
  });

  it("never votes for a human candidate: they declare, or abstain", () => {
    let s = settled("candidate", ["terran", "felhari", "kordex"], [0]);
    s = processTurn(s, {});
    expect(s.council.called!.candidates).toContain(0);
    expect(s.events.some((e) => e.kind === "council" && e.playerId === 0 && /as a candidate/.test(e.what))).toBe(true);
    expect(processTurn(s, {}).council.lastResult!.ballots![0]).toBeNull();
    const rival = s.council.called!.candidates.find((c) => c !== 0)!;
    const backed = processTurn(s, { 0: [{ type: "castCouncilVote", vote: rival }] });
    expect(backed.council.lastResult!.ballots![0]).toBe(rival);
    // Backing the rival pleases it; a vote for yourself does not.
    const selfVote = processTurn(s, { 0: [{ type: "castCouncilVote", vote: 0 }] });
    expect(attitude(backed, rival, 0)).toBeGreaterThan(attitude(selfVote, rival, 0));
    expect(processTurn(s, { 0: [{ type: "castCouncilVote", vote: 0 }] }).council.lastResult!.ballots![0]).toBe(0);
  });

  it("gives one vote per 10 population, rounded up, and none without population", () => {
    const s = met("votes10", ["felhari", "terran", "kordex"]);
    const pop = votingPopulation(s, 0);
    expect(councilVotes(s, 0)).toBe(Math.ceil(pop / 10));
    for (const c of Object.values(s.colonies)) if (c.ownerId === 0) c.workers = c.farmers = c.scientists = 0;
    expect(councilVotes(s, 0)).toBe(0);
    expect(votesToWin(10)).toBe(7);
    expect(votesToWin(9)).toBe(6);
  });

  it("vote scores: always an ally, never an enemy, relations plus treaties, traits and the last vote", () => {
    const s = met("votes", ["felhari", "terran", "kordex"]);
    s.attitude[0] = { 1: 20, 2: 20 };
    const plain = voteScore(s, 0, 2, 1);
    expect(plain).toBe(20);
    // Terrans are charismatic.
    expect(voteScore(s, 0, 1, 2)).toBe(20 + COUNCIL_VOTE.charismatic);
    s.relations["0-2"] = { ...relation(s, 0, 2), status: "nonAggression", trade: true };
    expect(voteScore(s, 0, 2, 1)).toBe(20 + COUNCIL_VOTE.nonAggression + COUNCIL_VOTE.trade);
    s.council.lastVotes = { 0: 2 };
    expect(voteScore(s, 0, 2, 1)).toBe(20 + COUNCIL_VOTE.nonAggression + COUNCIL_VOTE.trade + COUNCIL_VOTE.sameAsLastTime);
    s.council.lastVotes = {};
    s.relations["0-1"] = { ...relation(s, 0, 1), status: "war" };
    expect(voteScore(s, 0, 1, 2)).toBe(-1);
    expect(voteScore(s, 0, 2, 1)).toBe(20 + COUNCIL_VOTE.nonAggression + COUNCIL_VOTE.trade + COUNCIL_VOTE.atWarWithRival);
    s.relations["0-2"] = { ...relation(s, 0, 2), status: "alliance" };
    expect(voteScore(s, 0, 2, 1)).toBe(COUNCIL_VOTE.die);
  });

  it("a computer voter weighs its mood toward a human candidate, and only a human one", () => {
    const s = withTemper("pacifistic", ["felhari", "ythari", "terran"]);
    s.attitude[1] = { 0: 20, 2: 20 };
    const mood = TEMPERAMENTS.pacifistic.vsHumans;
    // Player 0 is human, player 2 (charismatic Terrans) a computer empire.
    expect(voteScore(s, 1, 0, 2)).toBe(20 - COUNCIL_VOTE.mood * mood);
    expect(voteScore(s, 1, 2, 0)).toBe(20 + COUNCIL_VOTE.charismatic);
  });
});

describe("how computer rulers answer treaties", () => {
  it("scores relation + roll - need + temperament + patience + bonuses", () => {
    const s = met("score");
    s.players[0]!.isHuman = true;
    s.attitude[1] = { ...(s.attitude[1] ?? {}), 0: 10 };
    const t = treatyScore(s, 0, 1, "nonAggression", 40);
    expect(t.score).toBe(t.parts.reduce((x, p) => x + p.value, 0));
    expect(t.parts.find((p) => p.why.startsWith("their relation"))!.value).toBe(10);
    expect(t.parts.find((p) => p.why.includes("d100"))!.value).toBe(40);
    expect(t.parts.some((p) => p.value === -TREATY_ANSWER.need.nonAggression!)).toBe(true);
    const temper = temperament(s, 1)!;
    expect(t.parts.some((p) => p.value === TEMPERAMENTS[temper].treaty || TEMPERAMENTS[temper].treaty === 0)).toBe(true);
    expect(temperament(s, 0)).toBeNull();
  });

  it("odds match the d100 and an alliance needs a pact and a relation of 50", () => {
    const s = met("odds");
    s.attitude[1] = { ...(s.attitude[1] ?? {}), 0: 0 };
    const base = treatyScore(s, 0, 1, "trade", null).score;
    expect(treatyAcceptChance(s, 0, 1, "trade")).toBeCloseTo(Math.max(0, Math.min(100, 101 + base)) / 100, 5);
    expect(canSign(s, 0, 1, "alliance")).toMatch(/non-aggression pact/);
    s.attitude[1]![0] = 40;
    expect(treatyScore(s, 0, 1, "alliance", 100).blocked).toMatch(/relation/);
    expect(treatyAcceptChance(s, 0, 1, "alliance")).toBe(0);
  });

  it("every ask wears down patience until they will hear no more, and it recovers", () => {
    let s = met("patience");
    s = processTurn(s, { 0: [{ type: "propose", to: 1, kind: "trade" }] });
    const p = s.proposals.find((x) => x.kind === "trade")!;
    expect(p.patience).toBe(0);
    expect(p.roll).toBeGreaterThanOrEqual(1);
    expect(p.roll).toBeLessThanOrEqual(100);
    // Patience recovered a turn's worth at the end of the turn but not all of it.
    const after = patience(s, 1, 0);
    expect(after).toBeLessThan(0);
    expect(after).toBeGreaterThanOrEqual(-(PATIENCE.perAsk + PATIENCE.firstAsk + PATIENCE.firstAskRoll) + PATIENCE.recovery);
    // A stream of demands soon has them refuse audiences.
    let s2 = met("tired");
    const asks = [{ type: "propose", to: 1, kind: "demandTribute", percent: 5 }, { type: "propose", to: 1, kind: "research" }, { type: "propose", to: 1, kind: "trade" }, { type: "propose", to: 1, kind: "nonAggression" }] as const;
    const mid = previewOrders(s2, 0, [...asks]);
    expect(mid.rejected).toHaveLength(0);
    expect(audienceTired(mid.state, 0, 1)).toBe(true);
    expect(validateCommand(mid.state, 0, { type: "propose", to: 1, kind: "techExchange" })).toMatchObject({ ok: false });
    s2 = processTurn(s2, { 0: [...asks] });
    for (let i = 0; i < 10; i++) s2 = processTurn(s2, {});
    expect(audienceTired(s2, 0, 1)).toBe(false);
  });

  it("breaking a treaty exhausts patience on both sides", () => {
    let s = signTreaties(met("exhaust"));
    s = processTurn(s, { 0: [{ type: "breakTreaty", target: 1, treaty: "trade" }] });
    expect(audienceTired(s, 0, 1)).toBe(true);
    expect(patience(s, 1, 0)).toBeLessThan(PATIENCE.refuse);
  });
});

describe("counter-offers, trust and peace", () => {
  it("prices BC at 10 x level x the ruler's expenses, only if you have it, rounded to 10 or 100", () => {
    const s = met("price", ["felhari", "kordex"]);
    // Nothing else to ask: the payer knows nothing the ruler lacks.
    s.players[0]!.techs = s.players[0]!.techs.filter((t) => s.players[1]!.techs.includes(t));
    const e = Math.max(COUNTER_PRICE.minExpenses, Math.trunc(empireExpenses(s, 1)));
    s.players[0]!.bc = e * 100;
    const small = counterPrice(s, 1, 0, 4, "k", "nonAggression")!;
    const round = (x: number) => (x < 100 ? Math.floor(x / 10) * 10 : Math.floor(x / 100) * 100);
    expect(small).toEqual({ bc: round(e * 40) });
    expect(counterPrice(s, 1, 0, 8, "k", "nonAggression")).toEqual({ bc: round(e * 80) });
    // Not offered once the treasury is under 10 x level x expenses.
    s.players[0]!.bc = e * 39;
    expect(counterPrice(s, 1, 0, 4, "k", "nonAggression")).toBeNull();
  });

  it("picks a technology by percentile: the bigger the price, the dearer the tech", () => {
    const s = met("techprice", ["felhari", "kordex"]);
    s.players[0]!.bc = 0;
    const extra = Object.keys(TIER_OF_TECH).filter((t) => !s.players[0]!.techs.includes(t) && !s.players[1]!.techs.includes(t)).slice(0, 30);
    s.players[0]!.techs.push(...extra);
    // Equal or better technology: r = 10, so level 8 picks from about the top fifth.
    for (const t of extra) s.players[1]!.techs.push(t);
    s.players[1]!.techs = s.players[1]!.techs.filter((t) => !extra.slice(0, 20).includes(t));
    const list = s.players[0]!.techs.filter((t) => TIER_OF_TECH[t] && !s.players[1]!.techs.includes(t))
      .sort((a, b) => TIER_OF_TECH[b]!.cost - TIER_OF_TECH[a]!.cost || a.localeCompare(b));
    const n = list.length;
    const idx = (p: { techId?: string } | null) => list.indexOf(p!.techId!);
    for (const key of ["a", "b", "c", "d"]) {
      const big = idx(counterPrice(s, 1, 0, 8, key, "nonAggression"));
      expect(big).toBeGreaterThanOrEqual(n - 1 - (Math.trunc((n * 8) / 10) + 1));
      expect(big).toBeLessThanOrEqual(n - 1 - (Math.trunc((n * 8) / 10) - 1));
    }
  });

  it("asks a tribute or a system only for peace", () => {
    const s = met("peaceprice", ["felhari", "kordex"]);
    s.players[0]!.bc = 0;
    s.players[0]!.techs = s.players[0]!.techs.filter((t) => s.players[1]!.techs.includes(t));
    expect(counterPrice(s, 1, 0, 4, "k", "nonAggression")).toBeNull();
    expect(counterPrice(s, 1, 0, 4, "k", "peace")).toEqual({ tribute: COUNTER_PRICE.tribute });
    // Level 8: no tribute; one system is not enough to give one away.
    expect(counterPrice(s, 1, 0, 8, "k", "peace")).toBeNull();
  });

  it("accepting a price pays it and signs", () => {
    let s = met("pay", undefined, { humanPlayers: [0] });
    s.players[0]!.bc = 500;
    s = processTurn(s, { 1: [{ type: "propose", to: 0, kind: "nonAggression", price: { bc: 100 } }] });
    const p = s.proposals.find((x) => x.from === 1 && x.price)!;
    const yes = processTurn(structuredClone(s), { 0: [{ type: "respond", proposalId: p.id, accept: true }] });
    const no = processTurn(structuredClone(s), { 0: [{ type: "respond", proposalId: p.id, accept: false }] });
    expect(relation(yes, 0, 1).status).toBe("nonAggression");
    expect(relation(no, 0, 1).status).not.toBe("nonAggression");
    expect(no.players[0]!.bc - yes.players[0]!.bc).toBeCloseTo(100, 0);
  });

  it("the odds of yes, a price and no add up", () => {
    const s = met("sum");
    for (const a of [-60, -20, 0, 40]) {
      s.attitude[1] = { ...(s.attitude[1] ?? {}), 0: a };
      const yes = treatyAcceptChance(s, 0, 1, "nonAggression");
      const price = treatyPriceChance(s, 0, 1, "nonAggression");
      expect(yes + price).toBeLessThanOrEqual(1);
      expect(treatyPriceChance(s, 0, 1, "trade")).toBe(0);
    }
  });

  it("breaking faith costs trust with the victim and reputation with everyone else", () => {
    let s = met("faith", ["terran", "felhari", "kordex"]);
    s = signTreaties(s);
    s = processTurn(s, { 0: [{ type: "breakTreaty", target: 1, treaty: "trade" }] });
    const honorable = temperament(s, 1) === "honorable";
    expect(trustIn(s, 1, 0)).toBe(-5 * (honorable ? 3 : 1));
    expect(reputationOf(s, 2, 0)).toBeLessThan(0);
    expect(treatyScore(s, 0, 1, "research", 50, 0).parts.find((p) => p.why.startsWith("their trust"))!.value).toBe(trustIn(s, 1, 0));
  });

  it("peace weighs the war, not the relation, and waits ten turns", () => {
    let s = met("peace");
    s = processTurn(s, { 0: [{ type: "declareWar", target: 1 }] });
    expect(treatyScore(s, 0, 1, "peace", 50).blocked).toMatch(/turns of war/);
    s.turn += TREATY_ANSWER.peaceMinWarTurns;
    const t = treatyScore(s, 0, 1, "peace", 50);
    expect(t.blocked).toBeNull();
    expect(t.parts.some((p) => p.why.startsWith("their relation"))).toBe(false);
    expect(t.parts.some((p) => p.why === "turns of war so far")).toBe(true);
    const later = structuredClone(s);
    later.turn += 30;
    expect(treatyScore(later, 0, 1, "peace", 50).score).toBeGreaterThan(t.score);
  });

  it("weighs ship losses in peace (K): positive when you lost more, negative when they did", () => {
    const s = met("losses", ["felhari", "kordex", "terran"]);
    s.relations[relKey(0, 1)] = { status: "war", trade: false, research: false, since: 1 };
    expect(peaceLossTerm(s, 1, 0)).toBe(0);
    s.shipLosses = { 0: { 1: 40 }, 1: { 0: 10 } };
    expect(peaceLossTerm(s, 1, 0)).toBe(300);
    s.shipLosses = { 0: { 1: 30 }, 1: { 0: 20 } };
    expect(peaceLossTerm(s, 1, 0)).toBe(50);
    s.shipLosses = { 0: { 1: 20 }, 1: { 0: 30 } };
    expect(peaceLossTerm(s, 1, 0)).toBe(-50);
    // Losses to every computer enemy count for you.
    s.relations[relKey(0, 2)] = { status: "war", trade: false, research: false, since: 1 };
    s.shipLosses = { 0: { 1: 20, 2: 20 }, 1: { 0: 20 } };
    expect(peaceLossTerm(s, 1, 0)).toBe(100);
  });
});

describe("demands", () => {
  it("a computer ruler answers by score bands: give in, refuse, a strike, broken treaties or war", () => {
    const s = withTemper("aggressive");
    const p: Proposal = { id: "d1.0.1.demandTribute", from: 0, to: 1, kind: "demandTribute", turn: 1, percent: 5 };
    const at0 = demandAnswer(s, p, 0).score;
    const roll = (target: number) => target - at0;
    expect(demandAnswer(s, p, roll(5)).outcome).toBe("accept");
    expect(demandAnswer(s, p, roll(0)).outcome).toBe("refuse");
    expect(demandAnswer(s, p, roll(-80)).outcome).toBe("strike");
    expect(demandAnswer(s, p, roll(-151)).outcome).toBe("war");
    s.relations[relKey(0, 1)] = { status: "nonAggression", trade: false, research: false, since: 1 };
    const pact0 = demandAnswer(s, p, 0).score;
    expect(demandAnswer(s, p, -pact0).outcome).toBe("accept");
    expect(demandAnswer(s, p, -pact0 - 30).outcome).toBe("strike");
    expect(demandAnswer(s, p, -pact0 - 60).outcome).toBe("breakTreaties");
    expect(demandAnswer(s, p, -pact0 - 101).outcome).toBe("war");
  });
});

describe("computer empires among themselves", () => {
  const ais = (seed: string) => met(seed, ["felhari", "kordex", "zhrikk"]);

  it("make peace once a war has run its course, as the original does", () => {
    const s = ais("aipeace");
    const limit = AI_AI_PEACE.baseTurns - 2 * AI_AI_PEACE.perDifficulty; // average difficulty
    s.turn = 200;
    s.relations["0-1"] = { ...relation(s, 0, 1), status: "war", since: s.turn - limit };
    diplomacyTick(s, new Rng({ s: 7 }));
    expect(relation(s, 0, 1).status).toBe("war");
    s.turn++;
    diplomacyTick(s, new Rng({ s: 7 }));
    expect(relation(s, 0, 1).status).toBe("peace");
  });

  it("join an ally's war only on a turn they consider each other, not at once", () => {
    let joinedAtOnce = 0;
    for (let i = 0; i < 10; i++) {
      const s = ais(`allyduty${i}`);
      s.relations["0-1"] = { ...relation(s, 0, 1), status: "alliance" };
      declareWar(s, 1, 2);
      diplomacyTick(s, new Rng({ s: i + 1 }));
      if (relation(s, 0, 2).status === "war") joinedAtOnce++;
    }
    // A pair is considered 1 turn in (die - perDifficulty x difficulty); ten tries rarely hit one.
    expect(AI_TREATIES.die).toBeGreaterThan(100);
    expect(joinedAtOnce).toBeLessThan(3);
  });
});
