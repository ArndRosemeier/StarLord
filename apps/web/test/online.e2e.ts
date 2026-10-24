// End-to-end test of StarLord online games against the live GameHub (games.futuremagic.de).
//   pnpm online-e2e
// Two headless players: lobby, seats, simultaneous turns, a reload (reconnect), the host leaving.
// Env: GAMEHUB_URL (default https://games.futuremagic.de), GAMEHUB_KEY (default: the committed app key).
import { automationOrders } from "@starlord/ai";
import { playerView, stateHash } from "@starlord/sim";
import { OnlineGame, memorySeatStore, type SeatStore } from "../src/net/online";
import { GAMEHUB } from "../src/net/config";

const url = process.env.GAMEHUB_URL ?? GAMEHUB.url;
const appKey = process.env.GAMEHUB_KEY ?? GAMEHUB.appKey;
const VERSION = "e2e";

let failures = 0;
const ok = (cond: boolean, label: string) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) failures++; };
async function until(pred: () => boolean, ms = 15000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (pred()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return pred();
}
const player = (name: string, seats: SeatStore = memorySeatStore()) => new OnlineGame({ name, version: VERSION, url, appKey, seats });
const endTurn = (...games: OnlineGame[]) => {
  for (const g of games) g.submitOrders({ [g.seat!]: automationOrders(playerView(g.state!, g.seat!)) });
};

const guestSeats = memorySeatStore();
const host = player("E2E Host");
let guest = player("E2E Guest", guestSeats);
try {
  await Promise.all([host.ready, guest.ready]);
  const code = await host.host({ seed: "e2e", galaxySize: "small", races: ["terran", "kordex", "zhrikk"] }, "StarLord e2e");
  ok(host.isHost && host.seat === 0, `host opened room ${code} and holds empire 0`);

  await guest.join(code);
  ok(await until(() => !!guest.room), "guest sees the lobby");
  guest.claim(1, "lysari");
  ok(await until(() => guest.seat === 1 && host.room?.seats[1]?.name === "E2E Guest"), "guest claimed empire 1");
  ok(host.room!.options.races![1] === "lysari", "guest's race choice reached the host");

  host.start();
  ok(await until(() => !!guest.state && !!host.state), "game started on both");

  for (let i = 0; i < 5; i++) {
    const turn = host.state!.turn;
    endTurn(guest, host);
    if (!(await until(() => guest.state!.turn === turn + 1 && host.state!.turn === turn + 1))) { ok(false, `turn ${turn} resolved`); break; }
  }
  ok(host.state!.turn === 6 && stateHash(guest.state!) === stateHash(host.state!), `5 turns in lockstep (turn ${host.state!.turn}, hashes match)`);

  // The guest reloads the page: a new connection with the same browser storage.
  guest.close();
  ok(await until(() => !host.status!.online.includes(1)), "host sees the guest gone");
  guest = player("E2E Guest", guestSeats);
  await guest.join(code);
  ok(await until(() => guest.seat === 1 && guest.state?.turn === host.state!.turn), "guest rebuilt the game and got empire 1 back");
  ok(await until(() => host.status!.online.includes(1)), "host sees the guest back");
  ok(stateHash(guest.state!) === stateHash(host.state!), "rebuilt game matches the host's");

  endTurn(guest, host);
  ok(await until(() => guest.state!.turn === 7 && host.state!.turn === 7), "turn after the reload");

  // The host leaves with the guest's orders in.
  endTurn(guest);
  ok(await until(() => host.status!.done.includes(1)), "guest's orders reached the host");
  host.close();
  ok(await until(() => guest.isHost), "guest was promoted to host");
  guest.setStandIn(0, true);
  ok(await until(() => guest.state!.turn === 8), "game goes on with the computer standing in for the old host");
} catch (e) {
  console.log("FAIL exception: " + (e as Error).message);
  failures++;
} finally {
  host.close();
  guest.close();
}
console.log(failures ? failures + " FAILURE(S)" : "ALL PASS");
process.exit(failures ? 1 : 0);
