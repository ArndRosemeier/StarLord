import { audienceAnswer, automationOrders } from "@starlord/ai";
import { saveAutomationPrefs } from "./automationPrefs";
import type { OnlineGame } from "../net/online";
import type { Diplomacy } from "../net/protocol";
import { commandsBattles, mayChooseTarget, mayStrikeFromOrbit, type Ask } from "../net/asks";
import {
  newGame, newRecord, pendingBattle, pendingLiveBattle, pendingOrbital, pendingTarget, playerView, previewOrders, processTurn, proposalId, recordTurn, replayRecord, stateHash,
  type CombatReport, type OrbitalChoice, type OrbitalPrompt, type PendingBattle, type TargetPrompt, type TacticalOrder, type GameRecord, type Command, type GameEvent, type GameState, type NewGameOptions, type PlayerId, type PlayerView, type Price, type Proposal, type ProposalKind, type TurnOrders,
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
  /** Prices computer empires named in audiences this turn, by the player's proposal they answer. */
  counters: Record<string, { to: PlayerId; kind: ProposalKind; price: Price }> = {};
  rejected: string[] = [];
  view!: PlayerView;
  /** Reports of recent turns, newest first; filtered per viewer by the UI. */
  history: { turn: number; events: GameEvent[]; combats: CombatReport[] }[] = [];
  /**
   * A battle the ending turn waits on the player to command, with the
   * turn's orders so far; the turn goes on with `finishBattle`.
   */
  battle: { pending: PendingBattle; orders: TurnOrders; live?: { turn: number; ask: number; seats: PlayerId[] } } | null = null;
  /**
   * An enemy colony whose orbit the player's fleets hold after the battles, waiting on what to do to it
   * (bomb, biological weapons, destroy, hold fire), with the turn's orders so far; the turn goes on with `finishOrbital`.
   */
  orbital: { prompt: OrbitalPrompt; orders: TurnOrders } | null = null;
  /** The turn waits on which planet the player's fleets attack at a star (see `pendingTarget`). */
  target: { prompt: TargetPrompt; orders: TurnOrders } | null = null;
  /** Battles of the last turn the player commanded (by report id); they were watched live, so they do not pop up again. */
  commandedBattles = new Set<string>();
  /** Bumped on every change so React can re-render cheaply. */
  version = 0;
  private listeners = new Set<() => void>();

  /** Every turn's orders since the game began, for replays and lockstep play; null for old saves. */
  record: GameRecord | null;

  /** The online game this session plays in, or null for a game on this computer. */
  online: OnlineGame | null = null;
  /** Online: proposals other people made to us this turn, which we may answer before the turn runs. */
  liveOffers: { from: PlayerId; cmd: Extract<Command, { type: "propose" }> }[] = [];
  /** Online: bumped when a live proposal arrives, so the screens can open the audience. */
  offerSeq = 0;
  /** Online, in a live battle: the other commander's orders, by their place in the battle's sequence of decisions. */
  liveSteps = new Map<number, TacticalOrder>();

  constructor(
    state: GameState, me: PlayerId | null, pending: Command[] = [], record: GameRecord | null = null, answers: Record<string, boolean> = {},
    counters: GameSession["counters"] = {},
  ) {
    this.state = state;
    this.record = record;
    this.me = me;
    this.watching = me ?? 0;
    this.pending = pending;
    this.answers = answers;
    this.counters = counters;
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

  /**
   * Opens an online game that has started. Turns now run when every person has ended theirs: End Turn
   * sends the orders, and the session follows the turns the host publishes.
   */
  static fromOnline(game: OnlineGame): GameSession {
    const session = new GameSession(game.state!, game.seat, [], game.record);
    session.online = game;
    game.onTurn = (state) => session.adoptTurn(state);
    game.onReload = (state) => {
      session.state = state;
      session.record = game.record;
      session.battle = session.target = session.orbital = null;
      session.refresh();
    };
    game.onAsk = (ask, orders) => session.askOnline(ask, orders);
    game.onStep = (turn, ask, n, order) => {
      const live = session.battle?.live;
      if (!live || live.turn !== turn || live.ask !== ask) return;
      session.liveSteps.set(n, order);
      session.notify();
    };
    game.onDiplomacy = (from, data) => session.liveDiplomacy(from, data);
    game.subscribe(() => session.notify());
    return session;
  }

  /** Online: orders were sent and the turn waits on the other players (or the host); new orders wait for the next turn. */
  get locked(): boolean {
    return !!this.online?.waiting;
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

  /** Tells the screens something changed outside the game state (online status). */
  notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
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
      // As the turn does: everyone's orders first, then everyone's answers, so deals struck in audiences
      // (and the player's answer to a counter-offer made there) show at once.
      const answers = (c: Command) => c.type === "respond";
      const first = previewOrders(this.state, this.me, this.pending.filter((c) => !answers(c)));
      let after = first.state;
      for (const o of this.liveOffers) after = previewOrders(after, o.from, [o.cmd]).state;
      const ai = [...this.answerOrders()];
      for (const [id, cmds] of ai) after = previewOrders(after, id, cmds.filter((c) => !answers(c))).state;
      for (const [id, cmds] of ai) after = previewOrders(after, id, cmds.filter(answers)).state;
      const last = previewOrders(after, this.me, this.pending.filter(answers));
      this.view = playerView(last.state, this.me);
      this.rejected = [...first.rejected, ...last.rejected];
    }
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Queues an order for this turn, replacing an earlier order it supersedes. */
  issue(...cmds: Command[]): void {
    if (this.me === null) return;
    if (this.locked) {
      // Online, after End Turn: an answer to another person's live proposal still goes in, with the orders sent again.
      if (this.online?.status?.phase !== "orders" || !cmds.every((c) => c.type === "respond")) return;
      this.pending.push(...cmds);
      this.refresh();
      this.online.submitOrders(this.onlineOrders());
      this.sendLiveAnswers(cmds);
      return;
    }
    for (const cmd of cmds) {
      const key = commandKey(cmd);
      if (key) this.pending = this.pending.filter((c) => commandKey(c) !== key);
      this.pending.push(cmd);
    }
    this.refresh();
    this.sendLiveAnswers(cmds);
    // Automation choices carry over to the next game.
    if (cmds.some((c) => c.type === "setAutomation" || c.type === "setAutomationStrategy")) saveAutomationPrefs(this.view.players[this.me]!);
  }

  /** An answer to a proposal another person made this turn goes to them at once. */
  private sendLiveAnswers(cmds: Command[]): void {
    for (const cmd of cmds) {
      if (cmd.type !== "respond" || !this.online) continue;
      const offer = this.liveOffers.find((o) => proposalId(this.state.turn, o.from, this.me!, o.cmd.kind) === cmd.proposalId);
      if (offer) this.online.diplomacy(offer.from, { type: "answer", turn: this.state.turn, proposalId: cmd.proposalId, accept: cmd.accept });
    }
  }

  /**
   * Puts a proposal to another empire in an audience. A computer empire
   * answers on the spot; the answer is returned (null for human empires,
   * who answer on their own turn, and for proposals that cannot be made).
   */
  audience(cmd: Extract<Command, { type: "propose" }>): boolean | null | "sent" {
    if (this.me === null || this.locked) return null;
    const id = proposalId(this.state.turn, this.me, cmd.to, cmd.kind);
    if (this.pending.some((c) => c.type === "propose" && c.to === cmd.to && c.kind === cmd.kind)) return null;
    const { state } = previewOrders(this.state, this.me, [...this.pending, cmd]);
    const proposal = state.proposals.find((p) => p.id === id);
    if (!proposal) return null;
    this.pending.push(cmd);
    const them = this.state.players[cmd.to]!;
    if (them.isHuman) {
      this.refresh();
      // Online, a person at their screen gets the proposal now and may answer before the turn runs.
      if (this.online?.isOnline(cmd.to)) {
        this.online.diplomacy(cmd.to, { type: "offer", turn: this.state.turn, cmd });
        return "sent";
      }
      return null;
    }
    const answer = audienceAnswer(playerView(state, cmd.to), proposal);
    this.answers[id] = answer.accept;
    if (answer.price) this.counters[id] = { to: cmd.to, kind: cmd.kind, price: answer.price };
    this.refresh();
    return answer.accept;
  }

  /** The counter-offer a computer empire made in an audience to one of the player's proposals this turn, if any. */
  counterTo(id: string): Proposal | undefined {
    const c = this.counters[id];
    if (!c || this.me === null) return undefined;
    const counterId = proposalId(this.state.turn, c.to, this.me, c.kind);
    return this.view.proposals.find((p) => p.id === counterId);
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
      const price = this.counters[id]?.price;
      out.set(cmd.to, [
        ...(out.get(cmd.to) ?? []),
        { type: "respond", proposalId: id, accept },
        ...(price ? [{ type: "propose" as const, to: this.me, kind: cmd.kind, price }] : []),
      ]);
    }
    return out;
  }

  /** The answer a computer empire gave in an audience this turn, if any. */
  answerTo(p: Pick<Proposal, "id">): boolean | undefined {
    return this.answers[p.id];
  }

  undo(): void {
    if (this.locked) return;
    this.pending.pop();
    this.refresh();
  }

  clearOrders(): void {
    if (this.locked) return;
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

  /**
   * Ends the turn. With `commandBattles`, a battle the player wants to
   * command stops the turn first (see `battle`); otherwise every battle
   * resolves by itself.
   */
  endTurn(opts: { commandBattles?: boolean } = {}): void {
    if (this.state.over || this.battle || this.orbital || this.target) return;
    if (this.online) {
      if (this.me !== null && !this.locked) this.online.submitOrders(this.onlineOrders());
      return;
    }
    this.commandedBattles = new Set();
    this.resumeTurn(this.ordersForTurn(), opts.commandBattles ?? true);
  }

  /**
   * What an online player sends when ending the turn: their orders plus their automation's, and the
   * answers computer empires gave them in audiences (which the host adds to those empires' orders).
   */
  onlineOrders(): TurnOrders {
    const me = this.me!;
    const { state } = previewOrders(this.state, me, this.pending);
    const orders: TurnOrders = { [me]: [...this.pending, ...automationOrders(playerView(state, me))] };
    for (const [id, cmds] of this.answerOrders()) orders[id] = cmds;
    return orders;
  }

  /** Online: the turn asks the player something (a target, a battle to command, an orbit choice); show it. */
  askOnline(ask: Ask, orders: TurnOrders): void {
    const me = this.me;
    if (me === null || !this.online) return;
    const base = structuredClone(orders);
    this.battle = this.target = this.orbital = null;
    if (ask.kind === "target") {
      const prompt = pendingTarget(this.state, base, me);
      if (prompt) this.target = { prompt, orders: base };
    } else if (ask.kind === "battle") {
      const pending = pendingLiveBattle(this.state, base, ask.seats);
      if (pending) {
        this.liveSteps = new Map();
        const live = pending.commanders.length > 1 ? { turn: this.state.turn, ask: ask.id, seats: pending.commanders } : undefined;
        this.battle = { pending, orders: base, ...(live ? { live } : {}) };
      }
    } else {
      const prompt = pendingOrbital(this.state, base, me);
      if (prompt) this.orbital = { prompt, orders: base };
    }
    if (!this.battle && !this.target && !this.orbital) this.online.answer([]);
    this.refresh();
  }

  /** Online, in a live battle: our unit's order, sent to the other commander. */
  sendBattleStep(n: number, order: TacticalOrder): void {
    const live = this.battle?.live;
    if (live && this.online) this.online.sendStep(live.turn, live.ask, n, order);
  }

  /** Online: a proposal from another person, or their answer to ours. */
  liveDiplomacy(from: PlayerId, data: Diplomacy): void {
    if (data.turn !== this.state.turn || this.me === null) return;
    if (data.type === "offer") {
      if (data.cmd.to !== this.me) return;
      this.liveOffers = [...this.liveOffers.filter((o) => !(o.from === from && o.cmd.kind === data.cmd.kind)), { from, cmd: data.cmd }];
      this.offerSeq++;
    } else {
      this.answers[data.proposalId] = data.accept;
      const who = this.state.players[from]?.name ?? "They";
      this.online?.tell(`${who} ${data.accept ? "accepted" : "declined"} your proposal.`);
    }
    this.refresh();
  }

  /**
   * Goes on with the turn after the player answered one of its questions: locally the turn asks the next
   * one (or runs); online the answer goes to the host, which asks the next.
   */
  private continueTurn(orders: TurnOrders, added: Command[]): void {
    if (this.online) {
      this.online.answer(added);
      this.refresh();
      return;
    }
    this.resumeTurn(orders, true);
  }

  /** Online: the host published the turn; show the new state. */
  private adoptTurn(state: GameState): void {
    const turn = this.state.turn;
    this.state = state;
    this.record = this.online?.record ?? this.record;
    this.battle = this.target = this.orbital = null;
    this.liveOffers = [];
    this.history = [{ turn, events: state.events, combats: state.combats }, ...this.history].slice(0, HISTORY_TURNS);
    this.pending = [];
    this.answers = {};
    this.counters = {};
    this.refresh();
  }

  /** Hands in the player's orders for the battle the turn waits on ("auto": let it resolve by itself) and goes on with the turn. */
  finishBattle(orders: TacticalOrder[] | "auto"): void {
    const b = this.battle;
    if (!b || this.me === null) return;
    const me = this.me;
    if (orders !== "auto") this.commandedBattles.add(b.pending.reportId);
    const added: Command[] = [{ type: "battleOrders", battle: b.pending.key, orders }];
    const turn: TurnOrders = { ...b.orders, [me]: [...(b.orders[me] ?? []), ...added] };
    this.battle = null;
    this.continueTurn(turn, added);
  }

  /** Hands in which planet the player's fleets attack at the star the turn waits on, and goes on with the turn. */
  finishTarget(colonyId: string): void {
    const t = this.target;
    if (!t || this.me === null) return;
    const me = this.me;
    const picks: Command[] = t.prompt.fleetIds.map((fleetId) => ({ type: "attackPlanet", fleetId, colonyId }));
    const turn: TurnOrders = { ...t.orders, [me]: [...(t.orders[me] ?? []), ...picks] };
    this.target = null;
    this.continueTurn(turn, picks);
  }

  /** Attacks nothing at the star the turn waits on, as the original's Close button: the fleets there are set to defend. */
  skipTarget(): void {
    const t = this.target;
    if (!t || this.me === null) return;
    const me = this.me;
    const hold: Command[] = t.prompt.fleetIds.map((fleetId) => ({ type: "setStance", fleetId, stance: "defend" }));
    const turn: TurnOrders = { ...t.orders, [me]: [...(t.orders[me] ?? []), ...hold] };
    this.target = null;
    this.continueTurn(turn, hold);
  }

  /** Hands in what the player's fleets do to the colony the turn waits on, and goes on with the turn. */
  finishOrbital(choice: OrbitalChoice): void {
    const o = this.orbital;
    if (!o || this.me === null) return;
    const me = this.me;
    const added: Command[] = [{ type: "orbitalStrike", colonyId: o.prompt.colonyId, choice }];
    const turn: TurnOrders = { ...o.orders, [me]: [...(o.orders[me] ?? []), ...added] };
    this.orbital = null;
    this.continueTurn(turn, added);
  }

  /** Turns commanding battles off (or back on); asked in the middle of a turn, it also counts for the turn's remaining battles. */
  setAutoBattles(on: boolean): void {
    const cmd: Command = { type: "setAutoBattles", on };
    if (this.battle && this.me !== null) {
      const mine = (this.battle.orders[this.me] ?? []).filter((c) => c.type !== "setAutoBattles");
      this.battle.orders = { ...this.battle.orders, [this.me]: [...mine, cmd] };
    }
    this.issue(cmd);
  }

  private resumeTurn(orders: TurnOrders, commandBattles: boolean): void {
    // Every battle is fought over one planet: where the player's fleets could attack more than one, they pick it first.
    if (commandBattles && this.me !== null && mayChooseTarget(this.state, this.me)) {
      const prompt = pendingTarget(this.state, orders, this.me);
      if (prompt) {
        this.target = { prompt, orders };
        this.refresh();
        return;
      }
    }
    if (commandBattles && this.me !== null && commandsBattles(this.state, orders, this.me)) {
      const pending = pendingBattle(this.state, orders, this.me);
      if (pending) {
        this.battle = { pending, orders };
        this.refresh();
        return;
      }
    }
    // After the battles, as in the original, the player decides what their fleets do to each enemy colony whose orbit they hold.
    if (commandBattles && this.me !== null && mayStrikeFromOrbit(this.state, orders, this.me)) {
      const prompt = pendingOrbital(this.state, orders, this.me);
      if (prompt) {
        this.orbital = { prompt, orders };
        this.refresh();
        return;
      }
    }
    const turn = this.state.turn;
    this.state = processTurn(this.state, orders);
    if (this.record) recordTurn(this.record, orders, this.state);
    this.history = [{ turn, events: this.state.events, combats: this.state.combats }, ...this.history].slice(0, HISTORY_TURNS);
    this.pending = [];
    this.answers = {};
    this.counters = {};
    this.refresh();
  }

  toJSON(): SavedGame {
    return { format: "starlord-save", version: 1, state: this.state, me: this.me, pending: this.pending, record: this.record, answers: this.answers, counters: this.counters };
  }

  static fromJSON(data: unknown): GameSession {
    if ((data as GameRecord)?.format === "starlord-record") return GameSession.fromRecord(data as GameRecord);
    const save = data as SavedGame;
    if (save?.format !== "starlord-save" || !save.state) throw new Error("Not a StarLord save file");
    if (save.state.version !== 2) throw new Error(`Unsupported game version ${save.state.version}`);
    // Saves from before councils were always asked may hold the old standing council vote order.
    const pending = (save.pending ?? []).filter((c) => (c.type as string) !== "setCouncilVote");
    return new GameSession(save.state, save.me, pending, save.record ?? null, save.answers ?? {}, save.counters ?? {});
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
  /** Counter-offers named in audiences this turn (absent in older saves). */
  counters?: GameSession["counters"];
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
    case "castCouncilVote":
    case "councilResponse":
    case "setAutomation":
    case "setIdleAlert":
    case "setAutoBattles":
      return cmd.type;
    case "moveFleet":
    case "setStance":
    case "renameFleet":
      return `${cmd.type}:${cmd.fleetId}`;
    case "setSpies":
      return `setSpies:${cmd.target}`;
    case "setIgnore":
      return `setIgnore:${cmd.target}`;
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
