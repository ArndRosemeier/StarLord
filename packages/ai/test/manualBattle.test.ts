import { describe, expect, it } from "vitest";
import { pendingBattle, processTurn, stateHash, type PendingBattle, type TacticalOrder } from "@starlord/sim";
import { LAB_PRESETS, setupCombatLab } from "../src/combatLab.js";

/** A lab battle at a planet with a station and a missile base, its defender played by a human. */
function setup(preset = "planet") {
  const lab = setupCombatLab({ seed: "manual", ...LAB_PRESETS.find((p) => p.id === preset)!.spec });
  lab.state.players[lab.defenderId]!.isHuman = true;
  return lab;
}

/** Fights a pending battle step by step with `decide`, recording the orders as the player would hand them in. */
function command(pb: PendingBattle, decide: (unit: string, n: number) => TacticalOrder) {
  const orders: TacticalOrder[] = [];
  const fight = pb.battle.fight(pb.starId, pb.reportId);
  let step = fight.next();
  while (!step.done) {
    const order = decide(step.value.unit, orders.length);
    orders.push(order);
    step = fight.next(order);
  }
  return { orders, outcome: step.value };
}

describe("commanded battles", () => {
  it("stop the turn at a battle the human takes part in, set up as the turn fights it", () => {
    const lab = setup();
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    expect(pb).not.toBeNull();
    expect(pb.starId).toBe(lab.starId);
    expect(pb.battle.manual[pb.battle.sides.findIndex((s) => s.ownerId === lab.defenderId)]).toBe(true);
    // A computer empire is never asked.
    expect(pendingBattle(lab.state, {}, lab.attackerId)).toBeNull();
  });

  it("fight the same battle again in the turn from the recorded orders", () => {
    const lab = setup();
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    // Fire at the farthest enemy every time, so the play differs from the computer's.
    const { orders, outcome } = command(pb, (unit) => {
      const opts = pb.battle.options(unit)!;
      const t = opts.targets.at(-1);
      return { kind: "act", ...(t ? { target: t.key } : {}) };
    });
    expect(orders.length).toBeGreaterThan(0);
    const turn = { [lab.defenderId]: [{ type: "battleOrders" as const, battle: pb.key, orders }] };
    expect(pendingBattle(lab.state, turn, lab.defenderId)).toBeNull();
    const after = processTurn(lab.state, turn);
    const report = after.combats.find((c) => c.starId === lab.starId)!;
    expect(report.rounds).toEqual(outcome.report.rounds);
    expect(report.winner).toEqual(outcome.report.winner);
    // And it is not what the computer would have done.
    const auto = processTurn(lab.state, {});
    expect(auto.combats[0]!.rounds).not.toEqual(report.rounds);
  });

  it("hand the rest to the computer from an Auto order on, and the turn replays that too", () => {
    const lab = setup("fleets");
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    const { orders, outcome } = command(pb, (_, n) => (n < 3 ? { kind: "act" } : { kind: "auto" }));
    // Three held turns, one Auto: the battle then ran to its end without asking again.
    expect(orders).toHaveLength(4);
    const after = processTurn(lab.state, { [lab.defenderId]: [{ type: "battleOrders", battle: pb.key, orders }] });
    expect(after.combats[0]!.rounds).toEqual(outcome.report.rounds);
  });

  it("resolve exactly as before when the player chose Auto for the whole battle", () => {
    const lab = setup();
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    const auto = processTurn(lab.state, { [lab.defenderId]: [{ type: "battleOrders", battle: pb.key, orders: "auto" }] });
    expect(stateHash(auto)).toBe(stateHash(processTurn(lab.state, {})));
  });

  it("move ships to the ordered square and hold fire without a target", () => {
    const lab = setup("fleets");
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    const fight = pb.battle.fight(pb.starId, pb.reportId);
    const step = fight.next();
    if (step.done) throw new Error("no decision");
    const unit = pb.battle.units.find((x) => x.key === step.value.unit)!;
    const reach = pb.battle.options(unit.key)!.reach;
    expect(reach).toBeGreaterThan(0);
    const from = { x: unit.x, y: unit.y };
    // Straight ahead, further than it can fly in one turn.
    const ahead = { x: from.x + Math.cos(unit.heading) * 40, y: from.y + Math.sin(unit.heading) * 40 };
    fight.next({ kind: "act", moveTo: ahead });
    const moved = Math.hypot(unit.x - from.x, unit.y - from.y);
    expect(moved).toBeGreaterThan(reach - 1);
    expect(moved).toBeLessThanOrEqual(reach + 0.1);
    expect(pb.battle.rounds.flat().some((e) => e.kind === "fire" && e.ship === unit.key)).toBe(false);
  });
});
