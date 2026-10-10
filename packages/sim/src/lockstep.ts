import { stateHash } from "./hash.js";
import type { Command } from "./commands.js";
import { processTurn, type TurnOrders } from "./turn.js";
import type { GameState, PlayerId } from "./types.js";

/**
 * Lockstep multiplayer groundwork, independent of any network library.
 *
 * Every peer runs the full simulation. Each turn, every seat sends its
 * orders to the host; once all seats are in, the host broadcasts the turn's
 * complete orders, every peer applies them with processTurn and reports the
 * resulting hash. Matching hashes prove the peers are still in sync, so only
 * orders ever travel over the wire, never game state.
 *
 * Computer empires are resolved by the host (it includes their orders in the
 * broadcast), so AI runs exactly once and peers need no AI of their own.
 */

export type LockstepMessage =
  | { type: "orders"; turn: number; seat: PlayerId; commands: Command[] }
  | { type: "turn"; turn: number; orders: TurnOrders }
  | { type: "hash"; turn: number; seat: PlayerId; hash: string }
  | { type: "desync"; turn: number; hashes: Record<string, string> };

/** Whatever carries messages between host and peers: WebSocket, WebRTC, or memory in tests. */
export interface Transport {
  send(msg: LockstepMessage): void;
  onMessage(fn: (msg: LockstepMessage) => void): void;
}

const HOST_SEAT = -1;

export class LockstepHost {
  private pending = new Map<PlayerId, Command[]>();
  private hashes = new Map<number, Map<PlayerId, string>>();
  readonly peers: Transport[] = [];
  onDesync?: (turn: number, hashes: Record<string, string>) => void;

  /**
   * @param seats human seats whose orders the host waits for
   * @param aiOrders orders for the computer empires, given the state at the start of the turn
   */
  constructor(
    private state: GameState,
    readonly seats: PlayerId[],
    private aiOrders: (state: GameState) => TurnOrders,
  ) {}

  connect(peer: Transport): void {
    this.peers.push(peer);
    peer.onMessage((msg) => this.receive(msg));
  }

  get turn(): number {
    return this.state.turn;
  }

  private receive(msg: LockstepMessage): void {
    if (msg.type === "orders" && msg.turn === this.state.turn && this.seats.includes(msg.seat)) {
      this.pending.set(msg.seat, msg.commands);
      if (this.seats.every((s) => this.pending.has(s))) this.resolve();
    } else if (msg.type === "hash") {
      const turnHashes = this.hashes.get(msg.turn) ?? new Map<PlayerId, string>();
      turnHashes.set(msg.seat, msg.hash);
      this.hashes.set(msg.turn, turnHashes);
      const values = new Set(turnHashes.values());
      if (values.size > 1) {
        const all = Object.fromEntries([...turnHashes].map(([k, v]) => [String(k), v]));
        for (const p of this.peers) p.send({ type: "desync", turn: msg.turn, hashes: all });
        this.onDesync?.(msg.turn, all);
      }
    }
  }

  private resolve(): void {
    const orders: TurnOrders = this.aiOrders(this.state);
    for (const [seat, cmds] of this.pending) orders[seat] = cmds;
    const turn = this.state.turn;
    this.pending.clear();
    this.state = processTurn(this.state, orders);
    // The host simulates too; its hash is the reference peers are checked against.
    this.hashes.set(turn, new Map([[HOST_SEAT, stateHash(this.state)]]));
    for (const p of this.peers) p.send({ type: "turn", turn, orders });
  }
}

export class LockstepPeer {
  /** Called after each turn is applied locally. */
  onTurn?: (state: GameState, orders: TurnOrders) => void;
  onDesync?: (turn: number, hashes: Record<string, string>) => void;

  constructor(
    public state: GameState,
    readonly seat: PlayerId,
    private transport: Transport,
  ) {
    transport.onMessage((msg) => {
      if (msg.type === "turn" && msg.turn === this.state.turn) {
        this.state = processTurn(this.state, msg.orders);
        this.transport.send({ type: "hash", turn: msg.turn, seat: this.seat, hash: stateHash(this.state) });
        this.onTurn?.(this.state, msg.orders);
      } else if (msg.type === "desync") {
        this.onDesync?.(msg.turn, msg.hashes);
      }
    });
  }

  /** Sends this seat's orders for the current turn. */
  submit(commands: Command[]): void {
    this.transport.send({ type: "orders", turn: this.state.turn, seat: this.seat, commands });
  }
}

/** A connected pair of in-memory transports, for tests and hot-seat play. */
export function memoryTransportPair(): [Transport, Transport] {
  const handlers: [((m: LockstepMessage) => void)[], ((m: LockstepMessage) => void)[]] = [[], []];
  // Deliver a copy, as a real network would, so peers never share objects.
  const make = (mine: 0 | 1): Transport => ({
    send: (msg) => {
      const copy = structuredClone(msg);
      for (const h of handlers[mine === 0 ? 1 : 0]) h(copy);
    },
    onMessage: (fn) => handlers[mine].push(fn),
  });
  return [make(0), make(1)];
}
