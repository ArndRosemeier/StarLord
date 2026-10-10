import { automationOrders } from "@starlord/ai";
import {
  newGame, playerView, previewOrders, processTurn,
  type CombatReport, type Command, type GameEvent, type GameState, type NewGameOptions, type PlayerId, type PlayerView, type TurnOrders,
} from "@starlord/sim";

/**
 * One game running in the browser. The full state stays here; screens only
 * ever see `view`, the human's fog-of-war view with this turn's orders
 * already applied so every change shows up immediately.
 */
export class GameSession {
  state: GameState;
  /** The human's empire, or null when watching an all-AI game. */
  me: PlayerId | null;
  /** Empire whose view a spectator follows. */
  watching: PlayerId;
  pending: Command[] = [];
  rejected: string[] = [];
  view!: PlayerView;
  /** Reports of recent turns, newest first; filtered per viewer by the UI. */
  history: { turn: number; events: GameEvent[]; combats: CombatReport[] }[] = [];
  /** Bumped on every change so React can re-render cheaply. */
  version = 0;
  private listeners = new Set<() => void>();

  constructor(state: GameState, me: PlayerId | null, pending: Command[] = []) {
    this.state = state;
    this.me = me;
    this.watching = me ?? 0;
    this.pending = pending;
    this.refresh();
  }

  static create(opts: NewGameOptions, me: PlayerId | null): GameSession {
    return new GameSession(newGame({ ...opts, humanPlayers: me === null ? [] : [me] }), me);
  }

  get spectator(): boolean {
    return this.me === null;
  }

  get viewer(): PlayerId {
    return this.me ?? this.watching;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private refresh(): void {
    if (this.me === null) {
      // Spectators see everything, from the point of view of the empire they follow.
      this.view = { ...this.state, viewer: this.watching };
      this.rejected = [];
    } else {
      const { state, rejected } = previewOrders(this.state, this.me, this.pending);
      this.view = playerView(state, this.me);
      this.rejected = rejected;
    }
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Queues an order for this turn, replacing an earlier order it supersedes. */
  issue(...cmds: Command[]): void {
    if (this.me === null) return;
    for (const cmd of cmds) {
      const key = commandKey(cmd);
      if (key) this.pending = this.pending.filter((c) => commandKey(c) !== key);
      this.pending.push(cmd);
    }
    this.refresh();
  }

  undo(): void {
    this.pending.pop();
    this.refresh();
  }

  clearOrders(): void {
    this.pending = [];
    this.refresh();
  }

  watch(id: PlayerId): void {
    this.watching = id;
    this.refresh();
  }

  /** Orders for every empire this turn: AI for computer players, the human's own plus their automation. */
  ordersForTurn(): TurnOrders {
    const orders: TurnOrders = {};
    for (const p of this.state.players) {
      if (!p.alive || p.kind !== "empire") continue;
      if (p.id === this.me) {
        const { state } = previewOrders(this.state, p.id, this.pending);
        orders[p.id] = [...this.pending, ...automationOrders(playerView(state, p.id))];
      } else {
        orders[p.id] = automationOrders(playerView(this.state, p.id));
      }
    }
    return orders;
  }

  endTurn(): void {
    if (this.state.over) return;
    const orders = this.ordersForTurn();
    this.onTurn?.(this.state, orders);
    const turn = this.state.turn;
    this.state = processTurn(this.state, orders);
    this.history = [{ turn, events: this.state.events, combats: this.state.combats }, ...this.history].slice(0, HISTORY_TURNS);
    this.pending = [];
    this.refresh();
  }

  /** Hook for recording games (see step 4's command log). */
  onTurn?: (before: GameState, orders: TurnOrders) => void;

  toJSON(): SavedGame {
    return { format: "starlord-save", version: 1, state: this.state, me: this.me, pending: this.pending };
  }

  static fromJSON(data: unknown): GameSession {
    const save = data as SavedGame;
    if (save?.format !== "starlord-save" || !save.state) throw new Error("Not a StarLord save file");
    if (save.state.version !== 2) throw new Error(`Unsupported game version ${save.state.version}`);
    return new GameSession(save.state, save.me, save.pending ?? []);
  }
}

const HISTORY_TURNS = 20;

export interface SavedGame {
  format: "starlord-save";
  version: 1;
  state: GameState;
  me: PlayerId | null;
  pending: Command[];
}

/** Orders that replace earlier orders of the same key instead of stacking. */
function commandKey(cmd: Command): string | null {
  switch (cmd.type) {
    case "setJobs":
    case "setQueue":
      return `${cmd.type}:${cmd.colonyId}`;
    case "setResearch":
    case "setTaxRate":
    case "setDoctrine":
    case "setCouncilVote":
    case "setAutomation":
      return cmd.type;
    case "moveFleet":
    case "setStance":
    case "renameFleet":
      return `${cmd.type}:${cmd.fleetId}`;
    case "setSpies":
      return `setSpies:${cmd.target}`;
    case "assignLeader":
      return `assignLeader:${cmd.leaderId}`;
    case "respond":
      return `respond:${cmd.proposalId}`;
    default:
      return null;
  }
}
