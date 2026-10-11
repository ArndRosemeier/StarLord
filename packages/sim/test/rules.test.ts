import { describe, expect, it } from "vitest";
import {
  MILITIA_PER_POP, TIER_OF_TECH, garrisonOf, hasTreaty, moveProblem, newGame, playerView, population, processTurn, travelTurns,
  type Fleet, type GameState,
} from "@starlord/sim";

const quiet = { monsters: false, raiders: false, council: false };

function twoEmpires(seed = "rules", extra: { randomEvents?: boolean } = {}): GameState {
  const s = newGame({ seed, races: ["terran", "felhari"], ...quiet, ...extra });
  s.players[0]!.contacts = [1];
  s.players[1]!.contacts = [0];
  return s;
}

function addFleet(s: GameState, ownerId: number, starId: string): Fleet {
  const star = s.galaxy.stars.find((x) => x.id === starId)!;
  const f: Fleet = {
    id: `t${s.nextId++}`, ownerId, x: star.x, y: star.y, starId, destStarId: null,
    ships: [{ designId: "frigate", count: 1 }], stance: "defend", name: "Test",
  };
  s.fleets[f.id] = f;
  return f;
}

/** The star farthest from a given one. */
function farthestFrom(s: GameState, starId: string) {
  const a = s.galaxy.stars.find((x) => x.id === starId)!;
  return s.galaxy.stars
    .filter((x) => x.color !== "blackHole" && x.id !== starId)
    .sort((p, q) => Math.hypot(q.x - a.x, q.y - a.y) - Math.hypot(p.x - a.x, p.y - a.y))[0]!;
}

describe("random events", () => {
  it("never happen when switched off", () => {
    let s = twoEmpires("calm", { randomEvents: false });
    s.turn = 30;
    for (let i = 0; i < 40; i++) {
      s = processTurn(s, {});
      expect(s.events.some((e) => e.kind === "random")).toBe(false);
    }
    expect(s.activeEvents ?? []).toHaveLength(0);
  });
});

describe("movement", () => {
  it("crosses a wormhole in one turn, beyond fuel range", () => {
    const s = twoEmpires("worm");
    const home = s.players[0]!.homeStarId;
    const far = farthestFrom(s, home);
    const here = s.galaxy.stars.find((x) => x.id === home)!;
    const f = addFleet(s, 0, home);
    expect(moveProblem(s, 0, f, far.id)).not.toBe(null);
    here.wormholeTo = far.id;
    far.wormholeTo = home;
    expect(moveProblem(s, 0, f, far.id)).toBe(null);
    expect(travelTurns(s, f, far.id)).toBe(1);
  });

  it("cannot enter a black hole", () => {
    const s = twoEmpires("hole");
    const home = s.players[0]!.homeStarId;
    const target = farthestFrom(s, home);
    target.color = "blackHole";
    const f = addFleet(s, 0, home);
    expect(moveProblem(s, 0, f, target.id)).toBe("black holes cannot be entered");
  });
});

describe("diplomacy deals", () => {
  it("a tribute demand, once accepted, makes the loser pay every turn", () => {
    let s = twoEmpires("tribute");
    s = processTurn(s, { 0: [{ type: "propose", to: 1, kind: "demandTribute", percent: 10 }] });
    const p = s.proposals.find((x) => x.kind === "demandTribute")!;
    expect(p).toBeDefined();
    s = processTurn(s, { 1: [{ type: "respond", proposalId: p.id, accept: true }] });
    expect(hasTreaty(s, 1, 0, "tribute")).toBe(true);
    s = processTurn(s, { 1: [{ type: "breakTreaty", target: 0, treaty: "tribute" }] });
    expect(hasTreaty(s, 1, 0, "tribute")).toBe(false);
  });

  it("a tech exchange swaps the two techs", () => {
    let s = twoEmpires("swap");
    const a = s.players[0]!;
    const b = s.players[1]!;
    const fresh = Object.keys(TIER_OF_TECH).filter((t) => !a.techs.includes(t) && !b.techs.includes(t));
    const [give, want] = [fresh[0]!, fresh[1]!];
    a.techs.push(give);
    b.techs.push(want);
    s = processTurn(s, { 0: [{ type: "propose", to: 1, kind: "techExchange", techId: give, wantTechId: want }] });
    const p = s.proposals.find((x) => x.kind === "techExchange")!;
    expect(p).toBeDefined();
    s = processTurn(s, { 1: [{ type: "respond", proposalId: p.id, accept: true }] });
    expect(s.players[0]!.techs).toContain(want);
    expect(s.players[1]!.techs).toContain(give);
  });
});

describe("ground forces", () => {
  it("every colony fields militia in proportion to its population", () => {
    const s = twoEmpires("militia");
    const c = Object.values(s.colonies).find((x) => x.ownerId === 0)!;
    expect(garrisonOf(s, c).militia).toBe(Math.ceil(population(c) * MILITIA_PER_POP));
  });
});

describe("player view", () => {
  it("hides one-time finds on unexplored stars but shows wormholes", () => {
    const s = twoEmpires("view");
    const me = s.players[0]!;
    const unexplored = s.galaxy.stars.filter((x) => !me.explored.includes(x.id) && x.color !== "blackHole");
    unexplored[0]!.feature = "wormhole";
    unexplored[1]!.feature = "cache";
    const v = playerView(s, 0);
    expect(v.galaxy.stars.find((x) => x.id === unexplored[0]!.id)!.feature).toBe("wormhole");
    expect(v.galaxy.stars.find((x) => x.id === unexplored[1]!.id)!.feature).toBeUndefined();
  });
});
