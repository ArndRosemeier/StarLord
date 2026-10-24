import { automationOrders, standInOrders } from "@starlord/ai";
import {
  DIFFICULTIES, RACES_BY_ID, buildCustomRace, newGame, newRecord, playerView, processTurn, stateHash, validateCustomRace,
  type Command, type CustomRaceSpec, type GameRecord, type GameState, type NewGameOptions, type PlayerId, type TacticalOrder, type TurnOrders,
} from "@starlord/sim";
import { defaultAnswer, nextAsk, type Ask } from "./asks";
import { connect, type GameHub, type RoomSummary } from "./gamehub";
import { GAMEHUB } from "./config";
import {
  PROTOCOL, pack, seatKey, unpack,
  type ChatLine, type Diplomacy, type FromHost, type NetMessage, type RoomMeta, type RoomState, type ToAll, type ToHost, type TurnDelta, type TurnStatus,
} from "./protocol";

/**
 * One online game on GameHub, without any UI: lobby, seats, simultaneous turns, reconnects, host
 * migration and desync recovery. The UI (GameSession) hooks in through the `on...` callbacks.
 *
 * Every player runs the whole simulation. Each turn:
 *  1. every person sends their orders to the host ("orders" phase);
 *  2. the host adds the computer empires' orders, then asks the turn's questions one at a time
 *     ("resolve" phase, see asks.ts): which planet to attack, battles to command (two people in one
 *     battle fight it live, each sending their units' orders to the other), what to do from orbit;
 *  3. the host publishes the turn (orders plus a state hash) as a room delta; everyone applies it and
 *     checks the hash. A player whose game drifted gets the host's state.
 * Players also chat, and people propose treaties to each other and answer them during the turn.
 */

/** How the browser remembers which empire is ours in a room, so a reload or reconnect gets it back. */
export interface SeatStore {
  load(room: string): string | null;
  save(room: string, token: string | null): void;
}

export function memorySeatStore(): SeatStore {
  const m = new Map<string, string>();
  return { load: (r) => m.get(r) ?? null, save: (r, t) => (t === null ? m.delete(r) : m.set(r, t)) };
}

const SEATS_KEY = "starlord.online.seats";

export function browserSeatStore(): SeatStore {
  const read = (): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem(SEATS_KEY) ?? "{}") as Record<string, string>; } catch { return {}; }
  };
  return {
    load: (room) => read()[room] ?? null,
    save: (room, token) => {
      const all = read();
      if (token === null) delete all[room];
      else all[room] = token;
      // Keep the last few rooms only.
      const keep = Object.fromEntries(Object.entries(all).slice(-20));
      try { localStorage.setItem(SEATS_KEY, JSON.stringify(keep)); } catch { /* storage blocked: no reconnect after reload */ }
    },
  };
}

export type Hub = GameHub<RoomState, TurnDelta, NetMessage>;

export interface OnlineOptions {
  /** Display name shown to the other players. */
  name: string;
  /** StarLord version; only the same version may join, since everyone must run the same rules. */
  version: string;
  url?: string;
  appKey?: string;
  seats?: SeatStore;
  /** A ready hub, for tests. */
  hub?: Hub;
}

/** A full snapshot of the record every few turns keeps the room's replay history short for late joiners. */
export const SNAPSHOT_EVERY = 10;
/** After the turn timer runs out, the host waits this long for players' own orders, then the computer stands in for absent ones. */
export const TIMER_GRACE_MS = 15000;
/** Turn timer choices in the lobby, in seconds (0: none). */
export const TIMER_CHOICES = [0, 60, 120, 180, 300, 600];
const CHAT_KEPT = 100;
const MAX_PLAYERS = 8;

function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class OnlineGame {
  readonly hub: Hub;
  /** Our name on the empire we claim; can change until we claim one. */
  name: string;
  readonly gameVersion: string;
  /** The room as last published (lobby settings, seats); the record is kept unpacked in `record`. */
  room: RoomState | null = null;
  record: GameRecord | null = null;
  state: GameState | null = null;
  status: TurnStatus | null = null;
  /** Why this game cannot go on (version mismatch, refused seat, lost connection), for the UI. */
  error: string | null = null;
  /** Bumped on every change so React can re-render cheaply. */
  version = 0;
  /** The room's chat, oldest first. */
  chat: ChatLine[] = [];
  /** When this turn's timer runs out, by this computer's clock; null without a timer. */
  deadline: number | null = null;

  /** A turn arrived and was applied: `state` is the new game state. */
  onTurn?: (state: GameState, orders: TurnOrders) => void;
  /** The game state was replaced (desync recovery or catching up); show it as it is now. */
  onReload?: (state: GameState) => void;
  /** The turn asks this player something (see asks.ts): show it, then call `answer`. Unset: the default answer goes. */
  onAsk?: (ask: Ask, orders: TurnOrders) => void;
  /** Another commander's order in a live battle. */
  onStep?: (turn: number, ask: number, n: number, order: TacticalOrder) => void;
  /** A proposal or an answer from another person. */
  onDiplomacy?: (from: PlayerId, data: Diplomacy) => void;
  /** A chat line from someone else. */
  onChat?: (line: ChatLine) => void;
  /** The game started (or, for a late joiner, was rebuilt): `state` is ready to play. */
  onStart?: (state: GameState) => void;
  /** Something the player should be told about. */
  onNotice?: (text: string) => void;

  private readonly seatStore: SeatStore;
  private token: string | null = null;
  private hosting = false;
  private creating = false;
  private queue: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  /** What this player sent for the current turn, re-sent after a host change. */
  private sent: { turn: number; orders?: TurnOrders } = { turn: -1 };
  /** The question we are answering ("turn:id"), and answers we gave, to give again if a new host asks the same. */
  private asked = "";
  private answers = new Map<string, Command[]>();
  private resyncAsked = -1;
  /** Host bookkeeping for the current turn. */
  private h = {
    phase: "orders" as TurnStatus["phase"],
    pending: new Map<PlayerId, TurnOrders>(),
    /** Resolve phase: every empire's orders, with the answers so far. */
    orders: null as TurnOrders | null,
    ask: null as Ask | null,
    answered: new Set<PlayerId>(),
    askSeq: 0,
    /** Questions asked this turn, so one that comes back unanswered gets its default answer instead of looping. */
    seen: new Set<string>(),
    online: new Map<PlayerId, number>(),
    standIn: new Set<PlayerId>(),
    deadline: null as number | null,
    timer: null as ReturnType<typeof setTimeout> | null,
  };

  constructor(opts: OnlineOptions) {
    this.name = opts.name.slice(0, 32) || "Player";
    this.gameVersion = opts.version;
    this.seatStore = opts.seats ?? memorySeatStore();
    this.hub = opts.hub ?? connect<RoomState, TurnDelta, NetMessage>({
      url: opts.url ?? GAMEHUB.url, app: GAMEHUB.app, appKey: opts.appKey ?? GAMEHUB.appKey, name: this.name,
    });
    const hub = this.hub;
    // Snapshots and deltas arrive in the same burst as `joined`; look at the room once they are applied.
    hub.on("joined", () => queueMicrotask(() => this.enqueue(() => this.afterJoin())));
    hub.on("state", (data) => this.enqueue(() => this.onRoomState(data)));
    hub.on("delta", (d) => this.enqueue(() => this.onDelta(d)));
    hub.on("msg", (m, from) => this.enqueue(() => this.onMessage(m, from)));
    hub.on("player+", () => this.changed());
    hub.on("player-", (id) => this.enqueue(() => this.onPlayerLeft(id)));
    hub.on("host", (id) => this.enqueue(() => this.onHostChanged(id)));
    hub.on("need-snapshot", () => this.enqueue(() => this.publish()));
    hub.on("close", () => {
      if (!this.error) this.error = "The connection to the game server was lost. Reload the page to rejoin: your empire is kept for you.";
      this.changed();
    });
    hub.on("error", (e) => {
      if (e.code === "rate_limited") this.notice("The game server asked us to slow down; some messages may have been dropped.");
    });
  }

  // ------------------------------------------------------------------ public API

  get ready(): Promise<unknown> {
    return this.hub.ready;
  }

  get roomCode(): string | null {
    return this.hub.room?.id ?? null;
  }

  get isHost(): boolean {
    return this.hosting;
  }

  /** Our empire in this game, or null while we have none (watching). */
  get seat(): PlayerId | null {
    if (!this.room || !this.token) return null;
    const key = seatKey(this.token);
    const hit = Object.entries(this.room.seats).find(([, s]) => s.key === key);
    return hit ? Number(hit[0]) : null;
  }

  /** People's empires in this game (claimed seats), by player id. */
  get humanSeats(): PlayerId[] {
    if (this.room?.phase === "playing") return [...(this.room.options.humanPlayers ?? [])];
    return Object.keys(this.room?.seats ?? {}).map(Number).sort((a, b) => a - b);
  }

  /** Our orders for this turn are in and we wait for the others (or for the turn to resolve). */
  get waiting(): boolean {
    const seat = this.seat;
    if (seat === null || !this.state) return false;
    const s = this.status;
    if (s && s.turn === this.state.turn && (s.phase === "resolve" || s.done.includes(seat))) return true;
    return this.sent.turn === this.state.turn && !!this.sent.orders;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Waits until everything received so far is handled (tests). */
  settled(): Promise<void> {
    return this.queue;
  }

  watchLobby(fn: (rooms: RoomSummary[]) => void): () => void {
    return this.hub.watchLobby(fn);
  }

  /** Opens a room for a game with these options; we take the first empire. */
  async host(options: NewGameOptions, roomName: string): Promise<string> {
    await this.hub.ready;
    this.creating = true;
    const summary = await this.hub.create({ name: roomName.slice(0, 40), public: true, maxPlayers: MAX_PLAYERS, meta: null });
    await this.enqueue(async () => {
      this.hosting = true;
      this.creating = false;
      this.token = newToken();
      this.seatStore.save(summary.id, this.token);
      const { humanPlayers: _, ...opts } = structuredClone(options);
      this.room = { v: PROTOCOL, version: this.gameVersion, phase: "lobby", options: opts, seats: { 0: { name: this.name, key: seatKey(this.token) } } };
      this.h.online.set(0, this.hub.you!);
      await this.publish();
    });
    return summary.id;
  }

  async join(code: string): Promise<void> {
    await this.hub.ready;
    const id = code.trim().toUpperCase();
    this.token = this.seatStore.load(id);
    await this.hub.join(id);
  }

  /** Takes an empire in the lobby, optionally as another race (a built-in id, or a custom race with its spec). */
  claim(seat: PlayerId, race?: string, custom?: CustomRaceSpec): void {
    const code = this.roomCode;
    if (!code) return;
    if (!this.token) {
      this.token = newToken();
      this.seatStore.save(code, this.token);
    }
    this.toHost({ k: "claim", seat, token: this.token, name: this.name, ...(race ? { race } : {}), ...(custom ? { custom } : {}) });
  }

  /** Gives our empire back to the computer (lobby only). */
  release(): void {
    if (this.token && this.room?.phase === "lobby") this.toHost({ k: "release", token: this.token });
  }

  /** Host: frees an empire in the lobby whose player left. */
  freeSeat(seat: PlayerId): void {
    void this.enqueue(async () => {
      if (!this.hosting || this.room?.phase !== "lobby" || seat === this.seat) return;
      delete this.room.seats[seat];
      this.h.online.delete(seat);
      await this.publish();
    });
  }

  /** Host: starts the game with the empires claimed so far; the rest are played by the computer. */
  start(seed?: string): void {
    void this.enqueue(async () => {
      if (!this.hosting || this.room?.phase !== "lobby") return;
      const humans = Object.keys(this.room.seats).map(Number).sort((a, b) => a - b);
      const races = this.room.options.races ?? [];
      const customRaces = (this.room.options.customRaces ?? []).filter((spec) => races.includes(buildCustomRace(spec).id));
      const options: NewGameOptions = { ...this.room.options, seed: seed ?? this.room.options.seed, humanPlayers: humans, customRaces };
      this.room = { ...this.room, phase: "playing", options };
      this.record = newRecord(options);
      this.state = newGame(options);
      this.resetTurn();
      this.hub.setRoom({ public: false });
      await this.publish();
      this.broadcastStatus();
      this.onStart?.(this.state);
      this.changed();
    });
  }

  /** Sends our orders for the current turn: our own, plus answers we gave computer empires in audiences. */
  submitOrders(orders: TurnOrders): void {
    const seat = this.seat;
    if (seat === null || !this.state || !this.token) return;
    this.sent = { turn: this.state.turn, orders };
    this.toHost({ k: "orders", turn: this.state.turn, token: this.token, orders });
    this.changed();
  }

  /** Takes our orders back while the others still think, to change them. */
  withdraw(): void {
    if (!this.state || !this.token || this.status?.phase !== "orders") return;
    this.sent = { turn: -1 };
    this.toHost({ k: "withdraw", turn: this.state.turn, token: this.token });
    this.changed();
  }

  /** Our answer to the question the turn asked (see `onAsk`). */
  answer(commands: Command[]): void {
    const s = this.status;
    if (!this.token || !s?.ask || s.phase !== "resolve" || !s.orders) return;
    this.answers.set(answerKey(s.ask, s.orders), commands);
    this.toHost({ k: "answer", turn: s.turn, ask: s.ask.id, token: this.token, commands });
    this.changed();
  }

  /** Our order in a live battle, for the other commander. */
  sendStep(turn: number, ask: number, n: number, order: TacticalOrder): void {
    this.toAll({ k: "bstep", turn, ask, n, order });
  }

  /** Says something in the room's chat. */
  say(text: string): void {
    const t = text.trim().slice(0, 300);
    if (!t) return;
    const line: ChatLine = { name: this.name, seat: this.seat, text: t };
    this.toAll({ k: "chat", line });
    this.addChat(line);
  }

  /** Sends a proposal or an answer to another person's empire (passed on by the host). */
  diplomacy(to: PlayerId, data: Diplomacy): void {
    if (this.token) this.toHost({ k: "dip", token: this.token, to, data });
  }

  /** Whether that person's empire is played by someone connected right now (so they can answer during this turn). */
  isOnline(seat: PlayerId): boolean {
    return !!this.status?.online.includes(seat) && !this.status.standIn.includes(seat);
  }

  /** Host, in the lobby: the turn timer in seconds (0: none). */
  setTimer(seconds: number): void {
    void this.enqueue(async () => {
      if (!this.hosting || this.room?.phase !== "lobby") return;
      this.room.timer = seconds;
      await this.publish();
    });
  }

  /** Host: lets the computer play an absent person's empire until they come back (or stops it). */
  setStandIn(seat: PlayerId, on: boolean): void {
    void this.enqueue(async () => {
      if (!this.hosting || !this.state) return;
      if (on && !this.h.online.has(seat)) this.h.standIn.add(seat);
      else this.h.standIn.delete(seat);
      this.broadcastStatus();
      this.maybeResolve();
      this.reconsider();
    });
  }

  /** Shows the player a notice about the game. */
  tell(text: string): void {
    this.notice(text);
  }

  /** Names of the people in the room right now. */
  get people(): string[] {
    return this.hub.players.map((p) => p.name);
  }

  close(): void {
    this.hub.close();
  }

  // ------------------------------------------------------------------ plumbing

  private enqueue(job: () => void | Promise<void>): Promise<void> {
    const next = this.queue.then(job).catch((e: unknown) => {
      console.error("online game:", e);
      this.notice(`Something went wrong in the online game: ${(e as Error).message}`);
    });
    this.queue = next;
    return next;
  }

  private changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private notice(text: string): void {
    this.onNotice?.(text);
    this.changed();
  }

  private toAll(m: ToAll): void {
    this.hub.send(m);
  }

  private addChat(line: ChatLine): void {
    this.chat = [...this.chat, line].slice(-CHAT_KEPT);
    this.changed();
  }

  private toHost(m: ToHost): void {
    if (this.hosting) void this.enqueue(() => this.hostHandle(m, this.hub.you!));
    else if (this.hub.host !== null) this.hub.send(m, this.hub.host);
  }

  private onMessage(m: NetMessage, from: number): void | Promise<void> {
    switch (m.k) {
      case "claim": case "release": case "orders": case "withdraw": case "answer": case "resync": case "dip":
        if (this.hosting) return this.hostHandle(m, from);
        return;
      case "chat":
        this.addChat(m.line);
        this.onChat?.(m.line);
        return;
      case "bstep":
        this.onStep?.(m.turn, m.ask, m.n, m.order);
        return;
      default:
        return this.clientHandle(m);
    }
  }

  // ------------------------------------------------------------------ every player

  private async afterJoin(): Promise<void> {
    if (this.creating) return;
    if (this.hub.isHost && !this.hosting) {
      // We came back to a room everyone had left: carry on as its host.
      if (this.room) await this.takeOver();
      else this.error = "This room has no game: its host left before setting one up.";
      this.changed();
      return;
    }
    // Back after a reload or a lost connection: ask for our empire again.
    if (this.token && this.room) {
      const key = seatKey(this.token);
      const mine = Object.entries(this.room.seats).find(([, s]) => s.key === key);
      if (mine) this.toHost({ k: "claim", seat: Number(mine[0]), token: this.token, name: this.name });
    }
    this.changed();
  }

  private async onRoomState(data: RoomState): Promise<void> {
    if (this.hosting && this.room) return;
    if (data.v !== PROTOCOL || data.version !== this.gameVersion) {
      this.error = `This game runs StarLord v${data.version} and you have v${this.gameVersion}. Everyone needs the same version: reload the page to update.`;
      this.changed();
      return;
    }
    const { record, ...room } = data;
    this.room = room;
    if (room.phase === "playing" && record) await this.catchUp(await unpack<GameRecord>(record));
    this.changed();
  }

  /** Applies the turns of a record we do not have yet (all of them for a newcomer). */
  private async catchUp(rec: GameRecord): Promise<void> {
    const fresh = !this.state;
    if (!this.record || JSON.stringify(this.record.options) !== JSON.stringify(rec.options)) {
      this.record = newRecord(rec.options);
      this.state = newGame(rec.options);
    }
    const from = this.record.turns.length;
    for (let i = from; i < rec.turns.length; i++) {
      const t = rec.turns[i]!;
      if (!this.applyTurn(t.orders, t.hash)) return;
      // Keep the page responsive while a long game is rebuilt.
      if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
    }
    if (fresh) this.onStart?.(this.state!);
    else if (rec.turns.length > from) this.onReload?.(this.state!);
  }

  /** Applies one turn and checks it against the host's hash. False (and a resync request) when it differs. */
  private applyTurn(orders: TurnOrders, hash: string): boolean {
    const turn = this.state!.turn;
    this.state = processTurn(this.state!, orders);
    this.record!.turns.push({ orders: structuredClone(orders), hash });
    if (stateHash(this.state) === hash) return true;
    if (this.resyncAsked !== turn) {
      this.resyncAsked = turn;
      this.toHost({ k: "resync", token: this.token });
    }
    return false;
  }

  private onDelta(d: TurnDelta): void {
    if (this.hosting || !this.record || !this.state || d.k !== "turn") return;
    const have = this.record.turns.length;
    if (d.n < have) return;
    if (d.n > have) {
      // We missed a turn: ask for the host's copy.
      if (this.resyncAsked !== this.state.turn) {
        this.resyncAsked = this.state.turn;
        this.toHost({ k: "resync", token: this.token });
      }
      return;
    }
    this.applyTurn(d.orders, d.hash);
    this.onTurn?.(this.state, d.orders);
    this.changed();
  }

  private async clientHandle(m: FromHost): Promise<void> {
    if (m.k === "refused") {
      this.notice(m.reason);
      return;
    }
    if (m.k === "dipFrom") {
      this.onDiplomacy?.(m.from, m.data);
      return;
    }
    if (m.k === "state") {
      const { record, state } = await unpack<{ record: GameRecord; state: GameState }>(m.data);
      const wasBehind = (this.record?.turns.length ?? 0) < record.turns.length;
      const fresh = !this.state;
      this.record = record;
      this.state = state;
      if (fresh) this.onStart?.(state);
      else this.onReload?.(state);
      this.notice(wasBehind
        ? `Your game had missed a turn and was brought up to date from the host's copy (turn ${state.turn}).`
        : `Your game had drifted out of step with the host's on turn ${m.turn - 1}; it was reloaded from the host's copy.`);
      return;
    }
    const s = m.status;
    this.status = s;
    this.deadline = s.phase === "orders" && s.left !== undefined ? Date.now() + s.left : null;
    const seat = this.seat;
    if (seat !== null && this.state && s.turn === this.state.turn && !s.done.includes(seat)) {
      if (s.phase === "orders" && this.sent.turn === s.turn && this.sent.orders && this.token) {
        // A new host does not have our orders yet.
        this.toHost({ k: "orders", turn: s.turn, token: this.token, orders: this.sent.orders });
      } else if (s.phase === "resolve" && s.ask && s.orders && s.ask.seats.includes(seat) && this.asked !== `${s.turn}:${s.ask.id}`) {
        this.asked = `${s.turn}:${s.ask.id}`;
        const given = this.answers.get(answerKey(s.ask, s.orders));
        if (given) this.answer(given);
        else if (this.onAsk) this.onAsk(s.ask, s.orders);
        else this.answer(defaultAnswer(this.state, s.orders, s.ask, seat));
      }
    }
    this.changed();
  }

  private async onHostChanged(id: number): Promise<void> {
    if (id === this.hub.you) {
      if (!this.hosting) await this.takeOver();
      this.notice("The host left; your browser hosts the game now.");
      return;
    }
    this.hosting = false;
    // Tell the new host which empire is ours; orders follow when its status shows it lacks them.
    if (this.token && this.seat !== null) this.toHost({ k: "claim", seat: this.seat, token: this.token, name: this.name });
    const host = this.hub.players.find((p) => p.id === id);
    this.notice(`The host left; ${host?.name ?? "another player"} hosts the game now.`);
  }

  private onPlayerLeft(id: number): void {
    if (this.hosting) {
      for (const [seat, pid] of this.h.online) if (pid === id) this.h.online.delete(seat);
      this.broadcastStatus();
      this.reconsider();
    }
    this.changed();
  }

  // ------------------------------------------------------------------ host

  private resetTurn(): void {
    const h = this.h;
    h.phase = "orders";
    h.pending.clear();
    h.orders = null;
    h.ask = null;
    h.answered.clear();
    h.seen.clear();
    if (h.timer) clearTimeout(h.timer);
    h.timer = null;
    h.deadline = null;
    const seconds = this.room?.timer ?? 0;
    if (this.hosting && seconds > 0 && this.room?.phase === "playing") {
      h.deadline = Date.now() + seconds * 1000;
      // Past the deadline (and a grace for slow connections), the computer stands in for people who are away.
      h.timer = setTimeout(() => void this.enqueue(() => this.timeUp()), seconds * 1000 + TIMER_GRACE_MS);
    }
  }

  private timeUp(): void {
    const h = this.h;
    if (!this.hosting || h.phase !== "orders") return;
    let changed = false;
    for (const seat of this.aliveHumans()) {
      if (!h.pending.has(seat) && !h.online.has(seat)) {
        h.standIn.add(seat);
        changed = true;
      }
    }
    if (changed) {
      this.broadcastStatus();
      this.maybeResolve();
    }
  }

  private async takeOver(): Promise<void> {
    this.hosting = true;
    this.resetTurn();
    this.h.online = new Map();
    const seat = this.seat;
    if (seat !== null) this.h.online.set(seat, this.hub.you!);
    this.h.standIn = new Set(this.status?.standIn ?? []);
    await this.publish();
    // Players re-send their orders when they see this status.
    this.broadcastStatus();
  }

  /** Publishes the room: settings and seats, plus the packed record once the game runs. */
  private async publish(): Promise<void> {
    if (!this.hosting || !this.room) return;
    const data: RoomState = { ...this.room };
    if (this.room.phase === "playing" && this.record) data.record = await pack(this.record);
    this.hub.setState(data);
    const meta: RoomMeta = {
      v: PROTOCOL, version: this.gameVersion, phase: this.room.phase, empires: this.room.options.races?.length ?? 0,
      people: Object.keys(this.room.seats).length, galaxy: this.room.options.galaxySize ?? "medium", host: this.name,
    };
    this.hub.setRoom({ meta });
    this.changed();
  }

  private seatOf(token: string): PlayerId | null {
    const key = seatKey(token);
    const hit = Object.entries(this.room?.seats ?? {}).find(([, s]) => s.key === key);
    return hit ? Number(hit[0]) : null;
  }

  private refuse(to: number, reason: string): void {
    if (to === this.hub.you) this.notice(reason);
    else this.hub.send({ k: "refused", reason }, to);
  }

  private aliveHumans(): PlayerId[] {
    const state = this.state;
    if (!state) return [];
    return (this.room?.options.humanPlayers ?? []).filter((id) => state.players[id]?.alive);
  }

  private async hostHandle(m: ToHost, from: number): Promise<void> {
    const room = this.room;
    if (!room) return;
    if (m.k === "claim") {
      if (room.phase === "lobby") return this.lobbyClaim(m, from);
      const seat = this.seatOf(m.token);
      if (seat === null) {
        this.refuse(from, "This game has started without you: you are watching.");
        return;
      }
      this.h.online.set(seat, from);
      this.h.standIn.delete(seat);
      this.broadcastStatus();
      return;
    }
    if (m.k === "release") {
      const seat = this.seatOf(m.token);
      if (room.phase !== "lobby" || seat === null || seat === this.seat) return;
      delete room.seats[seat];
      this.h.online.delete(seat);
      await this.publish();
      this.broadcastStatus();
      return;
    }
    if (m.k === "resync") {
      if (!this.state || !this.record) return;
      const data = await pack({ record: this.record, state: this.state });
      if (from !== this.hub.you) this.hub.send({ k: "state", turn: this.state.turn, data }, from);
      return;
    }
    const seat = this.seatOf(m.token);
    if (m.k === "dip") {
      if (seat === null || room.phase !== "playing") return;
      const to = this.h.online.get(m.to);
      if (to === undefined) return;
      if (to === this.hub.you) void this.clientHandle({ k: "dipFrom", from: seat, data: m.data });
      else this.hub.send({ k: "dipFrom", from: seat, data: m.data }, to);
      return;
    }
    if (seat === null || !this.state || m.turn !== this.state.turn || !this.aliveHumans().includes(seat)) return;
    if (m.k === "orders" && this.h.phase === "orders") {
      this.h.pending.set(seat, this.ownOrders(seat, m.orders));
      this.broadcastStatus();
      this.maybeResolve();
    } else if (m.k === "withdraw" && this.h.phase === "orders") {
      this.h.pending.delete(seat);
      this.broadcastStatus();
    } else if (m.k === "answer" && this.h.phase === "resolve") {
      const { ask, answered, orders } = this.h;
      if (!ask || !orders || m.ask !== ask.id || !ask.seats.includes(seat) || answered.has(seat)) return;
      orders[seat] = [...(orders[seat] ?? []), ...m.commands];
      answered.add(seat);
      if (ask.seats.every((s) => answered.has(s))) this.advance();
      else this.broadcastStatus();
    }
  }

  private async lobbyClaim(m: Extract<ToHost, { k: "claim" }>, from: number): Promise<void> {
    const room = this.room!;
    const races = room.options.races ?? [];
    const key = seatKey(m.token);
    if (!Number.isInteger(m.seat) || m.seat < 0 || m.seat >= races.length) return;
    const holder = room.seats[m.seat];
    if (holder && holder.key !== key) {
      this.refuse(from, `${holder.name} already plays that empire.`);
      return;
    }
    if (m.race && m.race !== races[m.seat]) {
      const why = this.setRace(m.seat, m.race, m.custom);
      if (why) {
        this.refuse(from, why);
        return;
      }
    }
    for (const [s, info] of Object.entries(room.seats)) if (info.key === key && Number(s) !== m.seat) delete room.seats[s];
    room.seats[m.seat] = { name: m.name.slice(0, 32) || "Player", key };
    for (const [s, pid] of this.h.online) if (pid === from) this.h.online.delete(s);
    this.h.online.set(m.seat, from);
    await this.publish();
    this.broadcastStatus();
  }

  /** Gives an empire another race; an empire the computer plays that has the race takes the old one. Returns why not, if not. */
  private setRace(seat: PlayerId, race: string, custom?: CustomRaceSpec): string | null {
    const options = this.room!.options;
    const races = options.races!;
    if (custom) {
      if (validateCustomRace(custom) !== null) return "That custom race is not valid.";
      if (!DIFFICULTIES[options.difficulty ?? "average"].customRaces) return "Custom races need Average difficulty or harder.";
      if (buildCustomRace(custom).id !== race) return "That custom race is not valid.";
      if (!(options.customRaces ?? []).some((s) => buildCustomRace(s).id === race)) options.customRaces = [...(options.customRaces ?? []), custom];
    } else if (!RACES_BY_ID[race]) {
      return "Unknown race.";
    }
    const other = races.indexOf(race);
    if (other >= 0 && other !== seat) {
      if (this.room!.seats[other]) return `${this.room!.seats[other]!.name} already plays that race.`;
      races[other] = races[seat]!;
    }
    races[seat] = race;
    return null;
  }

  /** A person's orders as the host accepts them: their own, plus answers to computer empires' audiences. */
  private ownOrders(seat: PlayerId, orders: TurnOrders): TurnOrders {
    const humans = new Set(this.room?.options.humanPlayers ?? []);
    const out: TurnOrders = {};
    for (const [id, cmds] of Object.entries(orders)) {
      const pid = Number(id);
      if (!Array.isArray(cmds)) continue;
      if (pid === seat) out[pid] = cmds;
      else if (!humans.has(pid)) out[pid] = cmds.filter((c) => c.type === "respond" || c.type === "propose");
    }
    return out;
  }

  private broadcastStatus(): void {
    if (!this.hosting) return;
    const h = this.h;
    const resolving = h.phase === "resolve" && !!h.orders && !!h.ask;
    const status: TurnStatus = {
      turn: this.state?.turn ?? 0,
      phase: h.phase,
      done: [...(h.phase === "orders" ? h.pending.keys() : h.answered)].sort((a, b) => a - b),
      online: [...h.online.keys()].sort((a, b) => a - b),
      standIn: [...h.standIn].sort((a, b) => a - b),
      ...(resolving ? { orders: h.orders!, ask: h.ask! } : {}),
      ...(h.phase === "orders" && h.deadline !== null ? { left: Math.max(0, h.deadline - Date.now()) } : {}),
    };
    this.hub.send({ k: "status", status });
    void this.clientHandle({ k: "status", status });
  }

  private maybeResolve(): void {
    const h = this.h;
    if (!this.state || h.phase !== "orders" || this.room?.phase !== "playing") return;
    const humans = this.aliveHumans();
    if (!humans.every((s) => h.pending.has(s) || h.standIn.has(s))) return;
    h.orders = this.mergeOrders();
    h.phase = "resolve";
    if (h.timer) clearTimeout(h.timer);
    h.timer = null;
    this.advance();
  }

  /** People who answer the turn's questions: connected, not stood in for, and who gave their own orders. */
  private answering(): PlayerId[] {
    const h = this.h;
    return this.aliveHumans().filter((s) => h.online.has(s) && !h.standIn.has(s) && h.pending.has(s));
  }

  /** Asks the turn's next question, or runs the turn when none is left. */
  private advance(): void {
    const h = this.h;
    if (!this.state || h.phase !== "resolve" || !h.orders) return;
    for (let guard = 0; guard < 500; guard++) {
      const next = nextAsk(this.state, h.orders, this.answering());
      if (!next) return this.finish();
      const sig = `${next.kind}:${next.key}:${next.seats.join(",")}`;
      if (h.seen.has(sig)) {
        // Asked before and still open: the default answer, so the turn cannot loop.
        for (const seat of next.seats) h.orders[seat] = [...(h.orders[seat] ?? []), ...defaultAnswer(this.state, h.orders, next, seat)];
        continue;
      }
      h.seen.add(sig);
      h.ask = { ...next, id: ++h.askSeq };
      h.answered.clear();
      this.broadcastStatus();
      return;
    }
    this.finish();
  }

  private mergeOrders(): TurnOrders {
    const state = this.state!;
    const humans = new Set(this.room!.options.humanPlayers ?? []);
    const orders: TurnOrders = {};
    for (const p of state.players) {
      if (!p.alive || p.kind !== "empire") continue;
      const sent = this.h.pending.get(p.id);
      if (!humans.has(p.id)) orders[p.id] = automationOrders(playerView(state, p.id));
      else if (sent) orders[p.id] = [...(sent[p.id] ?? [])];
      else orders[p.id] = standInOrders(playerView(state, p.id));
    }
    // Answers people got from computer empires in audiences come after those empires' own orders, as in a local game.
    for (const seat of [...this.h.pending.keys()].sort((a, b) => a - b)) {
      for (const [id, cmds] of Object.entries(this.h.pending.get(seat)!)) {
        const pid = Number(id);
        if (pid !== seat && orders[pid] && !humans.has(pid)) orders[pid]!.push(...(cmds ?? []));
      }
    }
    return orders;
  }

  /** Someone left or is now stood in for: ask again without them (or run the turn). */
  private reconsider(): void {
    const ask = this.h.ask;
    if (this.h.phase === "resolve" && ask && !ask.seats.every((s) => this.answering().includes(s) || this.h.answered.has(s))) this.advance();
  }

  private finish(): void {
    const h = this.h;
    if (!this.state || !h.orders) return;
    const orders = h.orders;
    const n = this.record!.turns.length;
    this.state = processTurn(this.state, orders);
    const hash = stateHash(this.state);
    this.record!.turns.push({ orders, hash });
    this.hub.sendDelta({ k: "turn", n, orders, hash });
    this.resetTurn();
    if ((n + 1) % SNAPSHOT_EVERY === 0) void this.enqueue(() => this.publish());
    this.onTurn?.(this.state, orders);
    this.broadcastStatus();
    this.changed();
  }
}

/** Identifies a question by what it is and the orders it was asked with. */
function answerKey(ask: Ask, orders: TurnOrders): string {
  return `${ask.kind}:${ask.key}:${ask.seats.join(",")}:${seatKey(JSON.stringify(orders))}`;
}
