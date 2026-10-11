import { describe, expect, it } from "vitest";
import {
  COUNCIL, PATIENCE, TEMPERAMENTS, TREATY_ANSWER, TIER_OF_TECH, audienceTired, canSign, previewOrders, validateCommand, patience, temperament, treatyAcceptChance, treatyPriceChance, treatyScore, counterPrice, trustIn, reputationOf, TREATY_YIELD, attitude, destructibleBuildings, empireIncome, empireTotals,
  newGame, playerView, processTurn, relKey, relation, spyEdge, treatyTotals, treatyYield, type GameState,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };

function met(seed: string, races = ["terran", "felhari"], extra: object = {}): GameState {
  const s = newGame({ seed, races, ...quiet, ...extra });
  for (const p of s.players) if (p.kind === "empire") p.contacts = s.players.filter((q) => q.kind === "empire" && q.id !== p.id).map((q) => q.id);
  return s;
}

/** Signs trade and research treaties between 0 and 1 through proposals, as play would. */
function signTreaties(s: GameState): GameState {
  s = processTurn(s, { 0: [{ type: "propose", to: 1, kind: "trade" }, { type: "propose", to: 1, kind: "research" }] });
  const ids = s.proposals.filter((p) => p.from === 0 && p.to === 1).map((p) => p.id);
  expect(ids).toHaveLength(2);
  return processTurn(s, { 1: ids.map((id) => ({ type: "respond" as const, proposalId: id, accept: true })) });
}

describe("trade and research treaties", () => {
  it("start at a loss, break even, then pay the full yield every turn", () => {
    let s = signTreaties(met("treaty"));
    expect(relation(s, 0, 1)).toMatchObject({ trade: true, research: true });
    const signed = relation(s, 0, 1).tradeSince!;
    const seen: { age: number; bc: number; research: number }[] = [];
    for (let i = 0; i < TREATY_YIELD.trade.full + 3; i++) {
      const y = treatyYield(s, 0, 1, treatyTotals(s));
      seen.push({ age: s.turn - signed, ...y });
      s = processTurn(s, {});
    }
    const pop = Math.min(empireTotals(s, 0).population, empireTotals(s, 1).population);
    expect(seen[0]!.bc).toBeLessThan(0);
    expect(seen.find((x) => x.age === TREATY_YIELD.trade.breakEven)!.bc).toBe(0);
    const last = seen[seen.length - 1]!;
    expect(last.research).toBeGreaterThan(0);
    expect(last.bc).toBeCloseTo(TREATY_YIELD.trade.perPop * pop, 0);
  });

  it("the money really arrives in the treasury", () => {
    let s = signTreaties(met("treasury"));
    for (let i = 0; i < TREATY_YIELD.trade.full; i++) s = processTurn(s, {});
    const withTreaty = structuredClone(s);
    const without = structuredClone(s);
    const k = relKey(0, 1);
    without.relations[k] = { ...without.relations[k]!, trade: false, research: false };
    const a = processTurn(withTreaty, {});
    const b = processTurn(without, {});
    const y = treatyYield(s, 0, 1, treatyTotals(s));
    expect(y.bc).toBeGreaterThan(0);
    expect(a.players[0]!.bc - b.players[0]!.bc).toBeCloseTo(y.bc, 0);
  });

  // Regression: the player's own screens showed 0 because the partner's colonies were out of sight.
  it("the player's view shows the same yield the turn pays, and counts it in income", () => {
    let s = signTreaties(met("fogged"));
    for (let i = 0; i < TREATY_YIELD.trade.full; i++) s = processTurn(s, {});
    const view = playerView(s, 0);
    expect(Object.values(view.colonies).some((c) => c.ownerId === 1)).toBe(false);
    const real = treatyYield(s, 0, 1, treatyTotals(s));
    expect(real.bc).toBeGreaterThan(0);
    expect(treatyYield(view, 0, 1, treatyTotals(view))).toEqual(real);
    expect(empireIncome(view, 0).treaties).toBeCloseTo(real.bc, 5);
  });

  it("stop paying when broken, and breaking sours their attitude", () => {
    let s = signTreaties(met("broken"));
    const before = attitude(s, 1, 0);
    s = processTurn(s, { 0: [{ type: "breakTreaty", target: 1, treaty: "trade" }] });
    expect(relation(s, 0, 1).trade).toBe(false);
    expect(treatyYield(s, 0, 1, treatyTotals(s)).bc).toBe(0);
    expect(attitude(s, 1, 0)).toBeLessThan(before);
  });
});

describe("gifts and surrender", () => {
  it("a gift of BC moves the money and warms them up", () => {
    let s = met("gift");
    s.players[0]!.bc = 200;
    const before = attitude(s, 1, 0);
    const theirs = s.players[1]!.bc;
    s = processTurn(s, { 0: [{ type: "gift", to: 1, bc: 50 }] });
    expect(s.players[1]!.bc - theirs).toBeGreaterThanOrEqual(50);
    expect(attitude(s, 1, 0)).toBeGreaterThan(before);
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
    for (let i = 0; i < 20 && !s.players[0]!.techs.includes(tech); i++) s = processTurn(s, {});
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

describe("galactic council", () => {
  it("meets once enough of the galaxy is settled and a big enough majority elects a winner", () => {
    let s = met("council", ["terran", "felhari", "kordex"], { council: true });
    s.turn = COUNCIL.earliestTurn;
    // Settle every star system for empire 0 on paper: one colony per system is what counts.
    for (const star of s.galaxy.stars) {
      const pid = star.planetIds.find((id) => !s.planets[id]!.colonyId);
      if (!pid) continue;
      const id = `c${s.nextId++}`;
      const src = Object.values(s.colonies).find((c) => c.ownerId === 0)!;
      s.colonies[id] = { ...structuredClone(src), id, planetId: pid, name: id, buildings: [], queue: [], progress: 0 };
      s.planets[pid]!.colonyId = id;
    }
    // Everyone loves empire 0.
    s.attitude[1] = { ...(s.attitude[1] ?? {}), 0: 100 };
    s.attitude[2] = { ...(s.attitude[2] ?? {}), 0: 100 };
    s = processTurn(s, {});
    expect(s.council.convened).toBe(true);
    expect(s.council.lastResult?.winner).toBe(0);
  });
});

describe("how computer rulers answer treaties", () => {
  it("scores attitude + roll - need + temperament + patience + bonuses", () => {
    const s = met("score");
    s.players[0]!.isHuman = true;
    s.attitude[1] = { ...(s.attitude[1] ?? {}), 0: 10 };
    const t = treatyScore(s, 0, 1, "nonAggression", 40);
    expect(t.score).toBe(t.parts.reduce((x, p) => x + p.value, 0));
    expect(t.parts.find((p) => p.why.startsWith("their attitude"))!.value).toBe(10);
    expect(t.parts.find((p) => p.why.includes("d100"))!.value).toBe(40);
    expect(t.parts.some((p) => p.value === -TREATY_ANSWER.need.nonAggression!)).toBe(true);
    const temper = temperament(s, 1)!;
    expect(t.parts.some((p) => p.value === TEMPERAMENTS[temper].treaty || TEMPERAMENTS[temper].treaty === 0)).toBe(true);
    expect(temperament(s, 0)).toBeNull();
  });

  it("odds match the d100 and an alliance needs a pact and warm feelings", () => {
    const s = met("odds");
    s.attitude[1] = { ...(s.attitude[1] ?? {}), 0: 0 };
    const base = treatyScore(s, 0, 1, "trade", null).score;
    expect(treatyAcceptChance(s, 0, 1, "trade")).toBeCloseTo(Math.max(0, Math.min(100, 101 + base)) / 100, 5);
    expect(canSign(s, 0, 1, "alliance")).toMatch(/non-aggression pact/);
    s.attitude[1]![0] = 40;
    expect(treatyScore(s, 0, 1, "alliance", 100).blocked).toMatch(/attitude/);
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
    expect(patience(s2, 1, 0)).toBe(0);
  });

  it("breaking a treaty exhausts patience on both sides", () => {
    let s = signTreaties(met("exhaust"));
    s = processTurn(s, { 0: [{ type: "breakTreaty", target: 1, treaty: "trade" }] });
    expect(audienceTired(s, 0, 1)).toBe(true);
    expect(patience(s, 1, 0)).toBeLessThanOrEqual(PATIENCE.broken + PATIENCE.recovery);
  });
});

describe("counter-offers, trust and peace", () => {
  it("a price is something the payer can give, and accepting it pays and signs", () => {
    let s = met("price");
    s.players[0]!.bc = 500;
    const price = counterPrice(s, 1, 0, "small", "k")!;
    expect(price).toBeTruthy();
    expect(canSign(s, 1, 0, "nonAggression", { price })).toBeNull();
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
    const before = treatyScore(s, 0, 1, "research", 50, 0).score;
    s = processTurn(s, { 0: [{ type: "breakTreaty", target: 1, treaty: "trade" }] });
    expect(trustIn(s, 1, 0)).toBeLessThan(0);
    expect(reputationOf(s, 2, 0)).toBeLessThan(0);
    expect(treatyScore(s, 0, 1, "research", 50, 0).parts.some((p) => p.why.startsWith("their trust"))).toBe(true);
    expect(treatyScore(s, 0, 1, "research", 50, 0).score).toBeLessThan(before);
  });

  it("peace weighs the war, not attitude, and waits ten turns", () => {
    let s = met("peace");
    s = processTurn(s, { 0: [{ type: "declareWar", target: 1 }] });
    expect(treatyScore(s, 0, 1, "peace", 50).blocked).toMatch(/turns of war/);
    s.turn += TREATY_ANSWER.peaceMinWarTurns;
    const t = treatyScore(s, 0, 1, "peace", 50);
    expect(t.blocked).toBeNull();
    expect(t.parts.some((p) => p.why.startsWith("their attitude"))).toBe(false);
    expect(t.parts.some((p) => p.why === "turns of war so far")).toBe(true);
    const later = structuredClone(s);
    later.turn += 30;
    expect(treatyScore(later, 0, 1, "peace", 50).score).toBeGreaterThan(t.score);
  });
});
