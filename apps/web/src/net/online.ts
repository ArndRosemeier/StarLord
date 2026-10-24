import { automationOrders, standInOrders } from "@starlord/ai";
import {
  DIFFICULTIES, RACES_BY_ID, buildCustomRace, newGame, newRecord, playerView, processTurn, stateHash, validateCustomRace,
  type Command, type CustomRaceSpec, type GameRecord, type GameState, type NewGameOptions, type PlayerId, type TurnOrders,
} from "@starlord/sim";
import { connect, type GameHub, type RoomSummary } from "./gamehub";
import { GAMEHUB } from "./config";
import {
  PROTOCOL, pack, seatKey, unpack,
  type FromHost, type NetMessage, type RoomMeta, type RoomState, type ToHost, type TurnDelta, type TurnStatus,
} from "./protocol";

/**
 * One online game on GameHub, without any UI: lobby, seats, simultaneous turns, reconnects, host
 * migration and desync recovery. The UI (GameSession) hooks in through the `on...` callbacks.
 *
 * Every player runs the whole simulation. Each turn:
 *  1. every person sends their orders to the host ("orders" phase);
 *  2. the host adds the computer empires' orders and sends everyone the full set ("resolve" phase);
 *     each person answers what the turn asks of them (which planet to attack, battles they command
 *     against computer empires, what to do from orbit) and sends those extra orders;
 *  3. the host publishes the turn (orders plus a state hash) as a room delta; everyone applies it and
 *     checks the hash. A player whose game drifted gets the host's state.
 * Battles between two people resolve by themselves (pendingBattle never offers them).
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

  /** A turn arrived and was applied: `state` is the new game state. */
  onTurn?: (state: GameState, orders: TurnOrders) => void;
  /** The game state was replaced (desync recovery or catching up); show it as it is now. */
  onReload?: (state: GameState) => void;
  /** All orders are in: answer what the turn asks of this player, then call `sendExtras`. Unset: nothing to answer. */
  onResolve?: (turn: number, orders: TurnOrders) => void;
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
  private sent: { turn: number; orders?: TurnOrders; extras?: Command[] } = { turn: -1 };
  private resolving = -1;
  private resyncAsked = -1;
  /** Host bookkeeping for the current turn. */
  private h = {
    phase: "orders" as TurnStatus["phase"],
    pending: new Map<PlayerId, TurnOrders>(),
    extras: new Map<PlayerId, Command[]>(),
    merged: null as TurnOrders | null,
    online: new Map<PlayerId, number>(),
    standIn: new Set<PlayerId>(),
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

  /** What we decided when the turn asked (see `onResolve`). */
  sendExtras(turn: number, commands: Command[]): void {
    if (!this.token) return;
    this.sent = { ...this.sent, turn, extras: commands };
    this.toHost({ k: "extras", turn, token: this.token, commands });
    this.changed();
  }

  /** Host: lets the computer play an absent person's empire until they come back (or stops it). */
  setStandIn(seat: PlayerId, on: boolean): void {
    void this.enqueue(async () => {
      if (!this.hosting || !this.state) return;
      if (on && !this.h.online.has(seat)) this.h.standIn.add(seat);
      else this.h.standIn.delete(seat);
      this.broadcastStatus();
      this.maybeResolve();
    });
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

  private toHost(m: ToHost): void {
    if (this.hosting) void this.enqueue(() => this.hostHandle(m, this.hub.you!));
    else if (this.hub.host !== null) this.hub.send(m, this.hub.host);
  }

  private onMessage(m: NetMessage, from: number): void | Promise<void> {
    switch (m.k) {
      case "claim": case "release": case "orders": case "withdraw": case "extras": case "resync":
        if (this.hosting) return this.hostHandle(m, from);
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
    const seat = this.seat;
    if (seat !== null && this.state && s.turn === this.state.turn && !s.done.includes(seat)) {
      if (s.phase === "orders" && this.sent.turn === s.turn && this.sent.orders && this.token) {
        // A new host does not have our orders yet.
        this.toHost({ k: "orders", turn: s.turn, token: this.token, orders: this.sent.orders });
      } else if (s.phase === "resolve" && s.orders && s.online.includes(seat) && !s.standIn.includes(seat)) {
        if (this.sent.turn === s.turn && this.sent.extras && this.token) {
          this.toHost({ k: "extras", turn: s.turn, token: this.token, commands: this.sent.extras });
        } else if (this.resolving !== s.turn) {
          this.resolving = s.turn;
          if (this.onResolve) this.onResolve(s.turn, s.orders);
          else this.sendExtras(s.turn, []);
        }
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
      this.maybeFinish();
    }
    this.changed();
  }

  // ------------------------------------------------------------------ host

  private resetTurn(): void {
    this.h.phase = "orders";
    this.h.pending.clear();
    this.h.extras.clear();
    this.h.merged = null;
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
    if (seat === null || !this.state || m.turn !== this.state.turn || !this.aliveHumans().includes(seat)) return;
    if (m.k === "orders" && this.h.phase === "orders") {
      this.h.pending.set(seat, this.ownOrders(seat, m.orders));
      this.broadcastStatus();
      this.maybeResolve();
    } else if (m.k === "withdraw" && this.h.phase === "orders") {
      this.h.pending.delete(seat);
      this.broadcastStatus();
    } else if (m.k === "extras" && this.h.phase === "resolve") {
      this.h.extras.set(seat, m.commands);
      this.broadcastStatus();
      this.maybeFinish();
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
    const status: TurnStatus = {
      turn: this.state?.turn ?? 0,
      phase: h.phase,
      done: [...(h.phase === "orders" ? h.pending.keys() : h.extras.keys())].sort((a, b) => a - b),
      online: [...h.online.keys()].sort((a, b) => a - b),
      standIn: [...h.standIn].sort((a, b) => a - b),
      ...(h.phase === "resolve" && h.merged ? { orders: h.merged } : {}),
    };
    this.hub.send({ k: "status", status });
    void this.clientHandle({ k: "status", status });
  }

  private maybeResolve(): void {
    const h = this.h;
    if (!this.state || h.phase !== "orders" || this.room?.phase !== "playing") return;
    const humans = this.aliveHumans();
    if (!humans.every((s) => h.pending.has(s) || h.standIn.has(s))) return;
    h.merged = this.mergeOrders();
    h.phase = "resolve";
    h.extras.clear();
    this.broadcastStatus();
    this.maybeFinish();
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

  private maybeFinish(): void {
    const h = this.h;
    if (!this.state || h.phase !== "resolve" || !h.merged) return;
    const asked = this.aliveHumans().filter((s) => h.online.has(s) && !h.standIn.has(s) && h.pending.has(s));
    if (!asked.every((s) => h.extras.has(s))) return;
    const orders = structuredClone(h.merged);
    for (const [seat, cmds] of [...h.extras].sort((a, b) => a[0] - b[0])) orders[seat] = [...(orders[seat] ?? []), ...cmds];
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
