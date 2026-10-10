import { describe, expect, it } from "vitest";
import {
  DesyncError, LockstepHost, LockstepPeer, memoryTransportPair, newGame, newRecord, playerView, processTurn,
  recordTurn, replayRecord, stateHash, type GameState, type TurnOrders,
} from "@starlord/sim";
import { automationOrders } from "../src/index.js";

const options = { seed: "mp", galaxySize: "small" as const, races: ["terran", "kordex", "zhrikk"], maxTurns: 100 };

function aiOrders(state: GameState, skip: number[] = []): TurnOrders {
  const orders: TurnOrders = {};
  for (const p of state.players) {
    if (p.alive && p.kind === "empire" && !skip.includes(p.id)) orders[p.id] = automationOrders(playerView(state, p.id));
  }
  return orders;
}

describe("game records", () => {
  it("rebuild a game exactly from its orders", () => {
    const record = newRecord(options);
    let state = newGame(options);
    for (let i = 0; i < 30; i++) {
      const orders = aiOrders(state);
      state = processTurn(state, orders);
      recordTurn(record, orders, state);
    }
    const copy = JSON.parse(JSON.stringify(record));
    expect(stateHash(replayRecord(copy))).toBe(stateHash(state));
    expect(replayRecord(copy, 10).turn).toBe(11);
  });

  it("detect a tampered turn", () => {
    const record = newRecord(options);
    let state = newGame(options);
    for (let i = 0; i < 3; i++) {
      const orders = aiOrders(state);
      state = processTurn(state, orders);
      recordTurn(record, orders, state);
    }
    record.turns[1]!.orders[0] = [{ type: "setTaxRate", rate: 0.5 }];
    expect(() => replayRecord(record)).toThrow(DesyncError);
  });
});

describe("lockstep", () => {
  it("keeps two human peers and the host in sync", () => {
    const seats = [0, 1];
    const start = newGame({ ...options, humanPlayers: seats });
    const host = new LockstepHost(start, seats, (s) => aiOrders(s, seats));
    const peers = seats.map((seat) => {
      const [hostSide, peerSide] = memoryTransportPair();
      host.connect(hostSide);
      return new LockstepPeer(structuredClone(start), seat, peerSide);
    });
    let desync = false;
    host.onDesync = () => (desync = true);
    for (let turn = 0; turn < 15; turn++) {
      // Each human lets their automation play, from their own copy of the game.
      for (const p of peers) p.submit(automationOrders(playerView(p.state, p.seat)));
    }
    expect(desync).toBe(false);
    expect(peers[0]!.state.turn).toBe(16);
    expect(stateHash(peers[0]!.state)).toBe(stateHash(peers[1]!.state));
  });

  it("reports a peer that diverges", () => {
    const seats = [0];
    const start = newGame({ ...options, humanPlayers: seats });
    const host = new LockstepHost(start, seats, (s) => aiOrders(s, seats));
    const [hostSide, peerSide] = memoryTransportPair();
    host.connect(hostSide);
    const broken = structuredClone(start);
    broken.players[0]!.bc += 1;
    const peer = new LockstepPeer(broken, 0, peerSide);
    let reported: number | null = null;
    peer.onDesync = (turn) => (reported = turn);
    peer.submit([]);
    expect(reported).toBe(1);
  });
});
