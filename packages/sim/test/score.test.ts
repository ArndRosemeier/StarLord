import { describe, expect, it } from "vitest";
import {
  HISTORY_STATS, SCORE, buildCustomRace, newGame, playerView, processTurn, score, scoreBreakdown, type CustomRaceSpec, type GameState,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false, randomEvents: false };
const game = (over: Record<string, unknown> = {}): GameState =>
  newGame({ seed: "score", races: ["terran", "kordex", "gorvath"], galaxySize: "medium", ...quiet, ...over });

const spec: CustomRaceSpec = {
  name: "Vorn", plural: "Vorn", description: "Test race.", color: "#33aa77", assetKey: "gorvath",
  picks: {
    growth: 0, farming: 0, industry: 1, science: 1, money: 0, shipAttack: 0, shipDefense: 0, groundCombat: 0, spying: 0,
    government: "dictatorship", traits: ["largeHomeworld"],
  },
};

describe("score", () => {
  it("adds up the original's terms on the first turn", () => {
    const s = game();
    const b = scoreBreakdown(s, 0);
    expect(b.turns).toBe(0);
    // Medium galaxy: (100 + 20) per empire that started.
    expect(b.galaxy).toBe((SCORE.perRace.base + SCORE.perRace.perSize) * 3);
    expect(b.research).toBe(s.players[0]!.tiers.length * SCORE.perField);
    expect(b.population).toBe(b.counts.population);
    expect(b.multiplier).toBe(100);
    expect(b.total).toBe(b.subtotal);
    expect(score(s, 0)).toBe(b.total);
  });

  it("costs a point per turn played", () => {
    const s = game();
    const next = processTurn(s, {});
    expect(scoreBreakdown(next, 0).turns).toBe(-1);
  });

  it("scales by unspent race picks", () => {
    const race = buildCustomRace(spec);
    const s = game({ races: [race.id, "terran"], customRaces: [spec] });
    const b = scoreBreakdown(s, 0);
    expect(b.counts.unspentPicks).toBe(3);
    expect(b.multiplier).toBe(100 + 3 * SCORE.perUnspentPick);
    expect(b.total).toBe(Math.trunc((b.subtotal * 130 + 50) / 100));
  });

  it("pays a premium for captured population, larger in small galaxies", () => {
    const small = game({ galaxySize: "small" });
    small.players[0]!.capturedPop = 9;
    expect(scoreBreakdown(small, 0).captured).toBe(18);
    const huge = game({ galaxySize: "huge" });
    huge.players[0]!.capturedPop = 9;
    expect(scoreBreakdown(huge, 0).captured).toBe(4);
  });

  it("credits an eliminated empire to its last attacker", () => {
    const s = game();
    s.players[2]!.lastAttackedBy = 0;
    for (const c of Object.values(s.colonies)) if (c.ownerId === 2) c.ownerId = 1;
    const next = processTurn(s, {});
    expect(next.players[2]!.alive).toBe(false);
    expect(next.players[0]!.eliminated).toEqual([2]);
    expect(scoreBreakdown(next, 0).eliminations).toBe(SCORE.perEliminated);
    expect(scoreBreakdown(next, 1).eliminations).toBe(0);
  });

  it("gives victory bonuses for Orion, the council and the raiders' home", () => {
    const s = game();
    const before = scoreBreakdown(s, 0).subtotal;
    s.guardianSlainBy = 0;
    s.raiders.defeatedBy = 0;
    s.victory = "council";
    s.winner = 0;
    expect(scoreBreakdown(s, 0).subtotal - before).toBe(SCORE.orion + SCORE.antares + SCORE.council);
  });

  it("an empire with no population gets no galaxy bonus and no turn penalty", () => {
    const s = processTurn(game(), {});
    for (const c of Object.values(s.colonies)) if (c.ownerId === 1) delete s.colonies[c.id];
    const b = scoreBreakdown(s, 1);
    expect(b.galaxy).toBe(0);
    expect(b.turns).toBe(0);
  });
});

describe("history record", () => {
  it("keeps one row per empire each turn", () => {
    let s = game();
    expect(s.history).toHaveLength(1);
    for (let i = 0; i < 3; i++) s = processTurn(s, {});
    expect(s.history!.map((h) => h.turn)).toEqual([1, 2, 3, 4]);
    const row = s.history!.at(-1)!.rows[0]!;
    expect(row).toHaveLength(HISTORY_STATS.length);
    expect(row[HISTORY_STATS.indexOf("score")]).toBe(score(s, 0));
  });

  it("shows a player only the empires they have met", () => {
    const s = game();
    s.players[0]!.contacts = [1];
    const v = playerView(s, 0);
    const rows = v.history!.at(-1)!.rows;
    expect(rows[0]).not.toBeNull();
    expect(rows[1]).not.toBeNull();
    expect(rows[2]).toBeNull();
  });
});
