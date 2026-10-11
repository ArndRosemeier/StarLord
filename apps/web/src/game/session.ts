import { answerProposal, automationOrders } from "@starlord/ai";
import {
  newGame, newRecord, playerView, previewOrders, processTurn, proposalId, recordTurn, replayRecord, stateHash,
  type CombatReport, type GameRecord, type Command, type GameEvent, type GameState, type NewGameOptions, type PlayerId, type PlayerView, type Proposal, type TurnOrders,
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
  /**
   * What computer empires said in audiences this turn to the human's
   * proposals, by proposal id. They are sent as those empires' answers when
   * the turn ends, so the deal holds as agreed.
   */
  answers: Record<string, boolean> = {};
  rejected: string[] = [];
  view!: PlayerView;
  /** Reports of recent turns, newest first; filtered per viewer by the UI. */
  history: { turn: number; events: GameEvent[]; combats: CombatReport[] }[] = [];
  /** Bumped on every change so React can re-render cheaply. */
  version = 0;
  private listeners = new Set<() => void>();

  /** Every turn's orders since the game began, for replays and lockstep play; null for old saves. */
  record: GameRecord | null;

  constructor(state: GameState, me: PlayerId | null, pending: Command[] = [], record: GameRecord | null = null, answers: Record<string, boolean> = {}) {
    this.state = state;
    this.record = record;
    this.me = me;
    this.watching = me ?? 0;
    this.pending = pending;
    this.answers = answers;
    this.refresh();
  }

  /** What the last turn produced for one empire. `view.events` is always empty: previewing orders clears it. */
  lastTurnEvents(playerId: PlayerId): GameEvent[] {
    return this.state.events.filter((e) => e.playerId === playerId);
  }

  static create(opts: NewGameOptions, me: PlayerId | null): GameSession {
    const options = { ...opts, humanPlayers: me === null ? [] : [me] };
    return new GameSession(newGame(options), me, [], newRecord(options));
  }

  /** Rebuilds a game from a record (verifying every turn) and opens it for watching. */
  static fromRecord(record: GameRecord): GameSession {
    return new GameSession(replayRecord(record), null, [], record);
  }

  /** Replays the record from the start and checks it lands on the current state. */
  verifyRecord(): { ok: boolean; message: string } {
    if (!this.record) return { ok: false, message: "This game has no record (it was loaded from an older save)." };
    try {
      const replayed = replayRecord(this.record);
      const ok = stateHash(replayed) === stateHash(this.state);
      return { ok, message: ok ? `All ${this.record.turns.length} turns replay to the same state.` : "The replay ends in a different state." };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
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
      // Deals struck in audiences show at once.
      let after = state;
      for (const [id, cmds] of this.answerOrders()) after = previewOrders(after, id, cmds).state;
      this.view = playerView(after, this.me);
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

  /**
   * Puts a proposal to another empire in an audience. A computer empire
   * answers on the spot; the answer is returned (null for human empires,
   * who answer on their own turn, and for proposals that cannot be made).
   */
  audience(cmd: Extract<Command, { type: "propose" }>): boolean | null {
    if (this.me === null) return null;
    const id = proposalId(this.state.turn, this.me, cmd.to, cmd.kind);
    if (this.pending.some((c) => c.type === "propose" && c.to === cmd.to && c.kind === cmd.kind)) return null;
    const { state } = previewOrders(this.state, this.me, [...this.pending, cmd]);
    const proposal = state.proposals.find((p) => p.id === id);
    if (!proposal) return null;
    this.pending.push(cmd);
    const them = this.state.players[cmd.to]!;
    if (them.isHuman) {
      this.refresh();
      return null;
    }
    const answer = answerProposal(playerView(state, cmd.to), proposal);
    this.answers[id] = answer;
    this.refresh();
    return answer;
  }

  /** The computer empires' audience answers still owed, for proposals still among the pending orders. */
  private answerOrders(): Map<PlayerId, Command[]> {
    const out = new Map<PlayerId, Command[]>();
    if (this.me === null) return out;
    for (const cmd of this.pending) {
      if (cmd.type !== "propose") continue;
      const id = proposalId(this.state.turn, this.me, cmd.to, cmd.kind);
      const accept = this.answers[id];
      if (accept === undefined) continue;
      out.set(cmd.to, [...(out.get(cmd.to) ?? []), { type: "respond", proposalId: id, accept }]);
    }
    return out;
  }

  /** The answer a computer empire gave in an audience this turn, if any. */
  answerTo(p: Pick<Proposal, "id">): boolean | undefined {
    return this.answers[p.id];
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
    const answers = this.answerOrders();
    for (const p of this.state.players) {
      if (!p.alive || p.kind !== "empire") continue;
      if (p.id === this.me) {
        const { state } = previewOrders(this.state, p.id, this.pending);
        orders[p.id] = [...this.pending, ...automationOrders(playerView(state, p.id))];
      } else {
        orders[p.id] = [...automationOrders(playerView(this.state, p.id)), ...(answers.get(p.id) ?? [])];
      }
    }
    return orders;
  }

  endTurn(): void {
    if (this.state.over) return;
    const orders = this.ordersForTurn();
    const turn = this.state.turn;
    this.state = processTurn(this.state, orders);
    if (this.record) recordTurn(this.record, orders, this.state);
    this.history = [{ turn, events: this.state.events, combats: this.state.combats }, ...this.history].slice(0, HISTORY_TURNS);
    this.pending = [];
    this.answers = {};
    this.refresh();
  }

  toJSON(): SavedGame {
    return { format: "starlord-save", version: 1, state: this.state, me: this.me, pending: this.pending, record: this.record, answers: this.answers };
  }

  static fromJSON(data: unknown): GameSession {
    if ((data as GameRecord)?.format === "starlord-record") return GameSession.fromRecord(data as GameRecord);
    const save = data as SavedGame;
    if (save?.format !== "starlord-save" || !save.state) throw new Error("Not a StarLord save file");
    if (save.state.version !== 2) throw new Error(`Unsupported game version ${save.state.version}`);
    return new GameSession(save.state, save.me, save.pending ?? [], save.record ?? null, save.answers ?? {});
  }
}

const HISTORY_TURNS = 20;

export interface SavedGame {
  format: "starlord-save";
  version: 1;
  state: GameState;
  me: PlayerId | null;
  pending: Command[];
  /** Absent in saves made before records existed. */
  record?: GameRecord | null;
  /** Audience answers given this turn (absent in older saves). */
  answers?: Record<string, boolean>;
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
    case "councilResponse":
    case "setAutomation":
      return cmd.type;
    case "moveFleet":
    case "setStance":
    case "renameFleet":
      return `${cmd.type}:${cmd.fleetId}`;
    case "setSpies":
      return `setSpies:${cmd.target}`;
    case "setAutomationStrategy":
      return `setAutomationStrategy:${cmd.domain}`;
    case "assignLeader":
      return `assignLeader:${cmd.leaderId}`;
    case "respond":
      return `respond:${cmd.proposalId}`;
    default:
      return null;
  }
}
