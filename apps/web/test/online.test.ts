import { describe, expect, it } from "vitest";
import { automationOrders } from "@starlord/ai";
import { playerView, stateHash, type NewGameOptions } from "@starlord/sim";
import { OnlineGame, memorySeatStore, type SeatStore } from "../src/net/online";
import { FakeRelay } from "./fakeHub";
import { GameSession } from "../src/game/session";

const OPTIONS: NewGameOptions = { seed: "online", galaxySize: "small", races: ["terran", "kordex", "zhrikk"] };

function player(relay: FakeRelay, name: string, seats: SeatStore = memorySeatStore(), version = "1.0") {
  return new OnlineGame({ name, version, seats, hub: relay.connect(name) });
}

async function until(pred: () => boolean, what: string, ms = 10000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 2));
  }
}

/** Each player lets their automation give the orders, as a person ending the turn would. */
function endTurn(...games: OnlineGame[]): void {
  for (const g of games) {
    const seat = g.seat!;
    g.submitOrders({ [seat]: automationOrders(playerView(g.state!, seat)) });
  }
}

async function lobby(relay: FakeRelay) {
  const host = player(relay, "Ann");
  const code = await host.host(OPTIONS, "Ann's game");
  const guest = player(relay, "Bob");
  await guest.join(code);
  await until(() => !!guest.room, "guest sees the room");
  guest.claim(1, "lysari");
  await until(() => guest.seat === 1 && host.room!.seats[1]?.name === "Bob", "guest claims an empire");
  return { host, guest, code };
}

describe("online games", { timeout: 30000 }, () => {
  it("lets a joiner claim an empire and pick its race", async () => {
    const relay = new FakeRelay();
    const { host, guest } = await lobby(relay);
    expect(host.room!.options.races).toEqual(["terran", "lysari", "zhrikk"]);
    expect(guest.room!.options.races).toEqual(["terran", "lysari", "zhrikk"]);
    // A taken empire is refused.
    const notes: string[] = [];
    const third = player(relay, "Cy");
    third.onNotice = (t) => notes.push(t);
    await third.join(host.roomCode!);
    await until(() => !!third.room, "third sees the room");
    third.claim(1);
    await until(() => notes.length > 0, "refusal");
    expect(notes[0]).toMatch(/Bob already plays/);
  });

  it("plays simultaneous turns in lockstep with a computer empire", async () => {
    const relay = new FakeRelay();
    const { host, guest } = await lobby(relay);
    host.start();
    await until(() => !!guest.state && !!host.state, "both games start");
    expect(guest.state!.players[1]!.isHuman).toBe(true);
    expect(guest.state!.players[2]!.isHuman).toBe(false);
    for (let i = 0; i < 6; i++) {
      const turn = host.state!.turn;
      endTurn(guest);
      await until(() => host.status?.done.includes(1) === true, "host sees the guest is done");
      expect(host.state!.turn).toBe(turn);
      endTurn(host);
      await until(() => guest.state!.turn === turn + 1 && host.state!.turn === turn + 1, "turn resolves");
    }
    expect(stateHash(guest.state!)).toBe(stateHash(host.state!));
    expect(guest.record!.turns.length).toBe(6);
  });

  it("lets a player take orders back to change them", async () => {
    const relay = new FakeRelay();
    const { host, guest } = await lobby(relay);
    host.start();
    await until(() => !!guest.state, "start");
    endTurn(guest);
    await until(() => guest.waiting && host.status?.done.includes(1) === true, "guest waits");
    guest.withdraw();
    await until(() => host.status?.done.length === 0 && !guest.waiting, "orders withdrawn");
    endTurn(host, guest);
    await until(() => guest.state!.turn === 2, "turn resolves");
  });

  it("brings a player back to their empire after a reload, and the computer stands in while they are away", async () => {
    const relay = new FakeRelay();
    const seats = memorySeatStore();
    const host = player(relay, "Ann");
    const code = await host.host(OPTIONS, "game");
    const guest = player(relay, "Bob", seats);
    await guest.join(code);
    await until(() => !!guest.room, "room");
    guest.claim(2);
    await until(() => guest.seat === 2, "claim");
    host.start();
    await until(() => !!guest.state, "start");
    endTurn(host, guest);
    await until(() => host.state!.turn === 2 && guest.state!.turn === 2, "turn 1");
    guest.close();
    await until(() => !host.status!.online.includes(2), "host sees the guest gone");
    endTurn(host);
    await new Promise((r) => setTimeout(r, 20));
    expect(host.state!.turn).toBe(2);
    host.setStandIn(2, true);
    await until(() => host.state!.turn === 3, "stand-in lets the turn resolve");
    // Back, in a fresh page with the same browser storage.
    const back = player(relay, "Bob", seats);
    await back.join(code);
    await until(() => back.state?.turn === 3 && back.seat === 2, "back in the game");
    await until(() => host.status!.online.includes(2) && !host.status!.standIn.includes(2), "host sees them back");
    expect(stateHash(back.state!)).toBe(stateHash(host.state!));
    endTurn(host, back);
    await until(() => back.state!.turn === 4 && host.state!.turn === 4, "turn 3");
    expect(stateHash(back.state!)).toBe(stateHash(host.state!));
  });

  it("goes on when the host leaves", async () => {
    const relay = new FakeRelay();
    const { host, guest } = await lobby(relay);
    host.start();
    await until(() => !!guest.state, "start");
    endTurn(host, guest);
    await until(() => guest.state!.turn === 2, "turn 1");
    // The guest's orders are in; then the host's browser closes.
    endTurn(guest);
    await until(() => host.status!.done.includes(1), "orders in");
    host.close();
    await until(() => guest.isHost && guest.status!.online.join() === "1", "guest takes over and sees the host gone");
    guest.setStandIn(0, true);
    await until(() => guest.state!.turn === 3, "the turn goes on with the new host");
    endTurn(guest);
    await until(() => guest.state!.turn === 4, "and the next");
  });

  it("repairs a game that drifted out of step", async () => {
    const relay = new FakeRelay();
    const { host, guest } = await lobby(relay);
    host.start();
    await until(() => !!guest.state, "start");
    const notes: string[] = [];
    guest.onNotice = (t) => notes.push(t);
    guest.state!.players[1]!.bc += 7;
    endTurn(host, guest);
    await until(() => notes.some((n) => /drifted/.test(n)), "desync repaired");
    expect(stateHash(guest.state!)).toBe(stateHash(host.state!));
    endTurn(host, guest);
    await until(() => guest.state!.turn === 3, "next turn");
    expect(stateHash(guest.state!)).toBe(stateHash(host.state!));
  });

  it("refuses a player with another version", async () => {
    const relay = new FakeRelay();
    const host = player(relay, "Ann");
    const code = await host.host(OPTIONS, "game");
    const old = player(relay, "Old", memorySeatStore(), "0.9");
    await old.join(code);
    await until(() => !!old.error, "error");
    expect(old.error).toMatch(/v1.0/);
  });

  it("lets a late joiner rebuild a running game and watch", async () => {
    const relay = new FakeRelay();
    const { host, guest } = await lobby(relay);
    host.start();
    await until(() => !!guest.state, "start");
    for (let i = 0; i < 12; i++) {
      endTurn(host, guest);
      await until(() => guest.state!.turn === i + 2, "turn");
    }
    const watcher = player(relay, "Viv");
    await watcher.join(host.roomCode!);
    await until(() => watcher.state?.turn === host.state!.turn, "watcher catches up");
    expect(watcher.seat).toBe(null);
    expect(stateHash(watcher.state!)).toBe(stateHash(host.state!));
  });
});

describe("online game sessions", { timeout: 30000 }, () => {
  it("send orders on End Turn, lock until the turn runs, and follow the host's turns", async () => {
    const relay = new FakeRelay();
    const { host, guest } = await lobby(relay);
    host.start();
    await until(() => !!guest.state && !!host.state, "start");
    const a = GameSession.fromOnline(host);
    const b = GameSession.fromOnline(guest);
    expect(a.me).toBe(0);
    expect(b.me).toBe(1);
    b.issue({ type: "setTaxRate", rate: 0.3 });
    b.endTurn();
    await until(() => b.locked, "guest waits");
    // Orders given while waiting are not taken: they would miss the turn.
    b.issue({ type: "setTaxRate", rate: 0.1 });
    expect(b.pending).toEqual([{ type: "setTaxRate", rate: 0.3 }]);
    a.endTurn();
    await until(() => a.state.turn === 2 && b.state.turn === 2, "turn runs");
    expect(b.locked).toBe(false);
    expect(b.pending).toEqual([]);
    expect(a.state.players[1]!.taxRate).toBe(0.3);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(b.history[0]!.turn).toBe(1);
  });
});
