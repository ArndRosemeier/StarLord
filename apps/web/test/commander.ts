import { pendingLiveBattle, type BattleDecision, type CombatOutcome, type PendingBattle, type TacticalOrder } from "@starlord/sim";
import { defaultAnswer } from "../src/net/asks";
import type { OnlineGame } from "../src/net/online";

export interface BattleLog {
  outcome?: CombatOutcome;
  orders?: TacticalOrder[];
}

/** A headless commander: in a live battle, our units do what the computer suggests for a few turns, then the computer takes over. */
export function commander(g: OnlineGame, log: BattleLog) {
  interface Fight { gen: Generator<BattleDecision, CombatOutcome, TacticalOrder>; sides: number[]; n: number; pending: PendingBattle; mine: TacticalOrder[]; turn: number; ask: number; decision: BattleDecision | null }
  let fight: Fight | null = null;
  const remote = new Map<string, TacticalOrder>();
  const pump = () => {
    const f = fight;
    if (!f) return;
    while (f.decision) {
      let order: TacticalOrder | undefined;
      if (f.sides.includes(f.decision.side)) {
        const opts = f.pending.battle.options(f.decision.unit);
        order = f.mine.length < 4 ? { kind: "act", ...(opts?.suggested ? { target: opts.suggested } : {}) } : { kind: "auto" };
        f.mine.push(order);
        g.sendStep(f.turn, f.ask, f.n, order);
      } else {
        order = remote.get(`${f.turn}:${f.ask}:${f.n}`);
        if (!order) return;
      }
      f.n++;
      const next = f.gen.next(order);
      f.decision = next.done ? null : next.value;
      if (next.done) {
        log.outcome = next.value;
        log.orders = f.mine;
        fight = null;
        g.answer([{ type: "battleOrders", battle: f.pending.key, orders: f.mine }]);
      }
    }
  };
  g.onAsk = (ask, orders) => {
    if (ask.kind !== "battle") return g.answer(defaultAnswer(g.state!, orders, ask, g.seat!));
    const pending = pendingLiveBattle(g.state!, structuredClone(orders), ask.seats)!;
    const sides = ([0, 1] as const).filter((i) => pending.battle.sides[i].ownerId === g.seat);
    const gen = pending.battle.fight(pending.starId, pending.reportId);
    const first = gen.next();
    fight = { gen, sides: [...sides], n: 0, pending, mine: [], turn: g.state!.turn, ask: ask.id, decision: first.done ? null : first.value };
    pump();
  };
  g.onStep = (turn, ask, n, order) => {
    remote.set(`${turn}:${ask}:${n}`, order);
    pump();
  };
}

