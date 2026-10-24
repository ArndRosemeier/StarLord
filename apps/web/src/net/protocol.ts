import type { Command, CustomRaceSpec, NewGameOptions, PlayerId, TurnOrders } from "@starlord/sim";

/**
 * What StarLord sends over a GameHub room. No DOM, so it runs in the browser and in Node tests.
 *
 * The room's snapshot is the game record (starting options plus every turn's orders, packed), and each
 * turn is one delta, so anyone who joins or reconnects rebuilds the game exactly. Players send their
 * orders to the host as messages; the host adds the computer empires and publishes the turn.
 */

/** Bumped when the messages change in a way older builds cannot read. */
export const PROTOCOL = 1;

/** A claimed empire: who plays it and the hash of the secret seat token that proves it is theirs. */
export interface Seat {
  name: string;
  key: string;
}

export interface RoomState {
  v: number;
  /** StarLord version of the host; everyone must run the same rules. */
  version: string;
  phase: "lobby" | "playing";
  /** The game's options; `humanPlayers` is filled in when the game starts. */
  options: NewGameOptions;
  /** Claimed empires, by player id. Unclaimed empires are played by the computer. */
  seats: Record<string, Seat>;
  /** The packed game record (see `pack`) once the game runs; turns after it arrive as deltas. */
  record?: string;
}

/** One processed turn, the room's only delta: `n` is its index in the record. */
export interface TurnDelta {
  k: "turn";
  n: number;
  orders: TurnOrders;
  hash: string;
}

/** Where the current turn stands, broadcast by the host whenever it changes. */
export interface TurnStatus {
  turn: number;
  /** "orders": waiting for every empire's orders; "resolve": orders are in, each player answers what the turn asks them (targets, battles to command, orbit choices). */
  phase: "orders" | "resolve";
  /** Seats that are done with the current phase. */
  done: PlayerId[];
  /** Seats whose player is connected. */
  online: PlayerId[];
  /** Absent seats the computer plays until their player returns. */
  standIn: PlayerId[];
  /** Every empire's orders, in the resolve phase. */
  orders?: TurnOrders;
}

export type ToHost =
  | { k: "claim"; seat: PlayerId; token: string; name: string; race?: string; custom?: CustomRaceSpec }
  | { k: "release"; token: string }
  | { k: "orders"; turn: number; token: string; orders: TurnOrders }
  | { k: "withdraw"; turn: number; token: string }
  | { k: "extras"; turn: number; token: string; commands: Command[] }
  | { k: "resync"; token: string | null };

export type FromHost =
  | { k: "status"; status: TurnStatus }
  /** The host's own game state, sent to a player whose game drifted out of step. */
  | { k: "state"; turn: number; data: string }
  | { k: "refused"; reason: string };

export type NetMessage = ToHost | FromHost;

/** Lobby listing info, set by the host. */
export interface RoomMeta {
  v: number;
  version: string;
  phase: "lobby" | "playing";
  empires: number;
  people: number;
  galaxy: string;
  host: string;
}

/** A short, stable fingerprint of a seat token (FNV-1a, twice), so the room never shows the token itself. */
export function seatKey(token: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ token.length;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + i), 0x01000193) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/** JSON, gzipped and base64-encoded: game records shrink about tenfold, far below the 1 MiB message limit. */
export async function pack(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function unpack<T>(data: string): Promise<T> {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as T;
}
