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

  it("never stop for a battle between two people (online games resolve it by itself)", () => {
    const lab = setup();
    lab.state.players[lab.attackerId]!.isHuman = true;
    expect(pendingBattle(lab.state, {}, lab.defenderId)).toBeNull();
    expect(pendingBattle(lab.state, {}, lab.attackerId)).toBeNull();
    expect(processTurn(lab.state, {}).combats.some((c) => c.starId === lab.starId)).toBe(true);
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

  it("fire each weapon group at its own target, as the original allows, and the turn replays it", () => {
    const lab = setup("fleets");
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    const orders: TacticalOrder[] = [];
    const fight = pb.battle.fight(pb.starId, pb.reportId);
    const send = (o: TacticalOrder) => {
      orders.push(o);
      return fight.next(o);
    };
    let step = fight.next();
    if (step.done) throw new Error("no decision");
    const unit = step.value.unit;
    const opts = pb.battle.options(unit)!;
    expect(opts.weapons.length).toBeGreaterThanOrEqual(2);
    // Close in first, keeping the rest of the turn.
    const me = pb.battle.units.find((x) => x.key === unit)!;
    const near = pb.battle.units.find((x) => x.key === opts.targets[0]!.key)!;
    step = send({ kind: "move", to: { x: near.x, y: near.y } });
    if (step.done) throw new Error("battle over");
    expect(step.value.unit).toBe(unit);
    expect(step.value.step).toBe(1);
    const now = pb.battle.options(unit)!;
    const [a, b] = now.weapons;
    const reachable = (w: typeof a) => now.targets.filter((t) => w!.vs[t.key]?.ok).map((t) => t.key);
    const ta = reachable(a)[0]!;
    const tb = reachable(b).find((k) => k !== ta)!;
    expect(ta && tb).toBeTruthy();
    step = send({ kind: "fire", target: ta, mounts: [a!.mount] });
    if (step.done) throw new Error("battle over");
    expect(step.value.unit).toBe(unit);
    // The first group has fired; the second is still ready for another target.
    const mid = pb.battle.options(unit)!;
    expect(mid.weapons.find((w) => w.mount === a!.mount)!.ready).toBe(false);
    expect(mid.weapons.find((w) => w.mount === b!.mount)!.ready).toBe(true);
    step = send({ kind: "fire", target: tb, mounts: [b!.mount] });
    if (step.done) throw new Error("battle over");
    step = send({ kind: "done" });
    const shotAt = new Set(pb.battle.rounds[0]!.filter((e) => e.kind === "fire" && e.ship === me.key).map((e) => e.target));
    expect(shotAt).toEqual(new Set([ta, tb]));
    while (!step.done) step = send({ kind: "auto" });
    const after = processTurn(lab.state, { [lab.defenderId]: [{ type: "battleOrders", battle: pb.key, orders }] });
    expect(after.combats[0]!.rounds).toEqual(step.value.report.rounds);
  });

  it("let a ship split its movement around firing, never past its speed", () => {
    const lab = setup("fleets");
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    const fight = pb.battle.fight(pb.starId, pb.reportId);
    const step = fight.next();
    if (step.done) throw new Error("no decision");
    const unit = pb.battle.units.find((x) => x.key === step.value.unit)!;
    const reach = pb.battle.options(unit.key)!.reach;
    const from = { x: unit.x, y: unit.y };
    const dir = { x: Math.cos(unit.heading), y: Math.sin(unit.heading) };
    fight.next({ kind: "move", to: { x: from.x + dir.x * 2, y: from.y + dir.y * 2 } });
    const left = pb.battle.options(unit.key)!.reach;
    expect(left).toBeCloseTo(reach - 2, 5);
    fight.next({ kind: "move", to: { x: from.x + dir.x * 60, y: from.y + dir.y * 60 } });
    expect(pb.battle.options(unit.key)!.reach).toBe(0);
    expect(Math.hypot(unit.x - from.x, unit.y - from.y)).toBeLessThanOrEqual(reach + 0.15);
  });

  it("send a ship told to wait to the back of its side's line", () => {
    const lab = setup("fleets");
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    const fight = pb.battle.fight(pb.starId, pb.reportId);
    let step = fight.next();
    if (step.done) throw new Error("no decision");
    const first = step.value.unit;
    expect(step.value.canWait).toBe(true);
    const seen: string[] = [];
    step = fight.next({ kind: "wait" });
    while (!step.done && step.value.unit !== first) {
      seen.push(step.value.unit);
      step = fight.next({ kind: "done" });
    }
    expect(seen.length).toBeGreaterThan(0);
    if (step.done) throw new Error("battle over");
    // Back again in the same combat turn, and the last of its side now: it may not wait again.
    expect(step.value.unit).toBe(first);
    expect(step.value.canWait).toBe(false);
    expect(pb.battle.round).toBe(0);
  });

  it("replay any mix of step orders exactly, in every lab preset", () => {
    for (const preset of LAB_PRESETS) {
      const lab = setup(preset.id);
      const pb = pendingBattle(lab.state, {}, lab.defenderId);
      if (!pb) continue;
      let seed = 12345;
      const rand = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
      };
      const { orders, outcome } = command(pb, (unit, n) => {
        if (n > 400) return { kind: "auto" };
        const o = pb.battle.options(unit)!;
        const t = o.targets[rand(Math.max(1, o.targets.length))];
        const w = o.weapons[rand(Math.max(1, o.weapons.length))];
        switch (rand(8)) {
          case 0: return { kind: "move", to: { x: rand(50), y: rand(40) } };
          case 1: return t ? { kind: "face", target: t.key } : { kind: "done" };
          case 2: case 3: return t ? { kind: "fire", target: t.key, ...(w ? { mounts: [w.mount] } : {}) } : { kind: "done" };
          case 4: return o.board[0] ? { kind: "board", target: o.board[0].key } : { kind: "wait" };
          case 5: return { kind: "wait" };
          case 6: return { kind: "done" };
          default: return { kind: "ai" };
        }
      });
      const after = processTurn(lab.state, { [lab.defenderId]: [{ type: "battleOrders", battle: pb.key, orders }] });
      const report = after.combats.find((c) => c.starId === lab.starId)!;
      expect(report.rounds, preset.id).toEqual(outcome.report.rounds);
    }
  });

  it("log missiles in flight so viewers can draw them on their way", () => {
    const lab = setup("missiles");
    const report = processTurn(lab.state, {}).combats[0]!;
    const events = report.rounds.flat();
    const launched = new Set(events.flatMap((e) => (e.kind === "launch" && e.projectile ? [e.projectile] : [])));
    const flying = events.flatMap((e) => (e.kind === "flights" ? e.flights ?? [] : []));
    expect(launched.size).toBeGreaterThan(0);
    expect(flying.length).toBeGreaterThan(0);
    for (const f of flying) expect(launched.has(f.id)).toBe(true);
  });

  it("let a ship self-destruct, exploding on the field, and replay it", () => {
    const lab = setup("fleets");
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    const { orders, outcome } = command(pb, (unit, n) => {
      const kind = pb.battle.units.find((u) => u.key === unit)!.kind;
      return n === 0 && kind === "ship" ? { kind: "selfDestruct" } : { kind: "auto" };
    });
    const first = outcome.report.rounds[0]!;
    expect(first.find((e) => e.kind === "destroyed")?.ship).toBe(pb.battle.units.find((u) => u.side === pb.battle.sides.findIndex((s) => s.ownerId === lab.defenderId) && u.kind === "ship")!.key);
    const after = processTurn(lab.state, { [lab.defenderId]: [{ type: "battleOrders", battle: pb.key, orders }] });
    expect(after.combats[0]!.rounds).toEqual(outcome.report.rounds);
  });

  it("scan any unit and warn of missiles flying at a commanded ship", () => {
    const lab = setup("missiles");
    const pb = pendingBattle(lab.state, {}, lab.defenderId)!;
    const fight = pb.battle.fight(pb.starId, pb.reportId);
    let step = fight.next();
    let warned = false;
    for (let i = 0; i < 200 && !step.done && !warned; i++) {
      const o = pb.battle.options(step.value.unit)!;
      if (o.incoming.length > 0) {
        warned = true;
        expect(o.incoming[0]!.turns).toBeGreaterThanOrEqual(1);
        expect(o.incoming[0]!.count).toBeGreaterThan(0);
      }
      step = fight.next({ kind: "done" });
    }
    expect(warned).toBe(true);
    const enemy = pb.battle.units.find((u) => u.ownerId === lab.attackerId)!;
    const scan = pb.battle.scan(enemy.key)!;
    expect(scan.name).toBe(enemy.name);
    expect(scan.weapons.length).toBeGreaterThan(0);
    expect(scan.maxStructure).toBeGreaterThan(0);
  });
});
