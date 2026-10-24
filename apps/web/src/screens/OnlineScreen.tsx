import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DIFFICULTIES, RACES, buildCustomRace, getRace, type CustomRaceSpec, type NewGameOptions } from "@starlord/sim";
import { OnlineGame, TIMER_CHOICES, browserSeatStore } from "../net/online";
import { ChatPanel } from "./OnlineBar";
import type { RoomSummary } from "../net/gamehub";
import type { RoomMeta } from "../net/protocol";
import { GameSession } from "../game/session";
import { NewGame } from "./NewGame";
import { VERSION } from "../changelog/changelog";
import { customRaceDefs, loadCustomRaces } from "../game/customRaces";
import { savedAutomationOrders } from "../game/automationPrefs";
import { words } from "../ui/format";

const NAME_KEY = "starlord.online.name";

function storedName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; }
}

function storeName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* blocked storage: asked again next time */ }
}

/** Puts the room code in the address bar, so a reload or a shared link comes back to the room. */
export function setRoomInUrl(code: string | null): void {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  window.history.replaceState(null, "", url);
}

export function roomFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("room")?.toUpperCase() ?? null;
}

export function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", code);
  return url.toString();
}

function useOnline(game: OnlineGame | null): void {
  useSyncExternalStore(
    (fn) => (game ? game.subscribe(fn) : () => {}),
    () => game?.version ?? 0,
  );
}

/**
 * Online games: pick a name, then open a room or join one (from the open rooms, a code, or a
 * ?room=CODE link), take an empire in the room's lobby, and the host starts the game.
 */
export function OnlineScreen({ joinCode, onStart, onBack }: { joinCode?: string | null; onStart: (s: GameSession) => void; onBack: () => void }) {
  const [name, setName] = useState(storedName);
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [code, setCode] = useState(joinCode ?? "");
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  useOnline(game);

  // One connection for this screen: it lists open rooms, and becomes the game once we host or join.
  useEffect(() => {
    const g = new OnlineGame({ name: storedName() || "Commander", version: VERSION, seats: browserSeatStore() });
    g.onNotice = (t) => setNotes((n) => [...n.slice(-2), t]);
    setGame(g);
    let stop = () => {};
    g.ready.then(() => { stop = g.watchLobby(setRooms); }, () => setProblem("Could not reach the game server (games.futuremagic.de). Check your connection and try again."));
    return () => stop();
  }, []);

  // The game began (or we rejoined one that runs): hand it to the game screens.
  useEffect(() => {
    if (!game) return;
    game.onStart = () => {
      const session = GameSession.fromOnline(game);
      const automation = session.me === null ? [] : savedAutomationOrders();
      if (automation.length > 0) session.issue(...automation);
      onStart(session);
    };
    if (game.state) game.onStart(game.state);
  }, [game]);

  // A ?room= link joins right away when we already have a name.
  useEffect(() => {
    if (game && joinCode && storedName()) void join(joinCode);
  }, [game]);

  const ready = name.trim().length > 0;
  const remember = () => {
    const n = name.trim().slice(0, 32);
    storeName(n);
    if (game) game.name = n;
  };

  const join = async (id: string) => {
    if (!game || busy) return;
    remember();
    setBusy(`Joining ${id}…`);
    setProblem(null);
    try {
      await game.join(id);
      setRoomInUrl(game.roomCode);
    } catch (e) {
      const why = (e as { code?: string }).code;
      setProblem(why === "no_such_room" ? `There is no room ${id.toUpperCase()} (rooms close a minute after everyone leaves).`
        : why === "room_full" ? "That room is full." : `Could not join: ${(e as Error).message}`);
    }
    setBusy(null);
  };

  const host = async (options: NewGameOptions) => {
    if (!game) return;
    remember();
    setSetup(false);
    setBusy("Opening a room…");
    try {
      await game.host(options, `${name.trim()}'s galaxy`);
      setRoomInUrl(game.roomCode);
    } catch (e) {
      setProblem(`Could not open a room: ${(e as Error).message}`);
    }
    setBusy(null);
  };

  const leave = () => {
    game?.close();
    setRoomInUrl(null);
    onBack();
  };

  if (setup) return <NewGame onStart={() => {}} onBack={() => setSetup(false)} onHost={host} />;

  if (game?.room && game.room.phase === "lobby") return <RoomLobby game={game} notes={notes} onLeave={leave} />;

  if (game?.roomCode && (game.room?.phase === "playing" || !game.room)) {
    return (
      <div className="title-screen online-screen">
        <div className="panel col">
          <h2>Room {game.roomCode}</h2>
          {game.error ? <div className="bad">{game.error}</div> : <div className="muted">Loading the game: every turn so far is replayed in your browser…</div>}
          {notes.map((n, i) => <div key={i} className="muted">{n}</div>)}
          <div className="row"><button onClick={leave}>Back to title</button></div>
        </div>
      </div>
    );
  }

  const open = rooms.filter((r) => (r.meta as RoomMeta | null)?.phase !== "playing");
  return (
    <div className="title-screen online-screen">
      <div className="row">
        <button onClick={leave}>← Title</button>
        <div className="logo">STARLORD</div>
        <div className="spacer" />
        <span className="muted">Online game</span>
      </div>
      <div className="panel col">
        <h2>Play with friends</h2>
        <p className="muted" style={{ margin: 0 }}>
          Everyone plays at the same time: when every person has ended their turn, all orders run together. Empires
          nobody takes are played by the computer. Battles between two people are fought live, each commanding their
          own side; proposals between people can be answered during the turn, and there is a chat and an optional turn
          timer. Games run on games.futuremagic.de and need everyone on the same StarLord version (yours: v{VERSION}).
        </p>
        <label className="row">Your name
          <input type="text" maxLength={32} value={name} placeholder="Shown to the other players" onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="row">
          <button className="primary" disabled={!ready || !!busy || !game} onClick={() => setSetup(true)}
            title="Choose the galaxy and your race, then share the room code or link with your friends">Host a game</button>
          <span className="muted">or join with a code</span>
          <input type="text" size={8} maxLength={6} value={code} placeholder="K7Q2ZP" onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && ready && code.length === 6) void join(code); }} />
          <button disabled={!ready || code.length !== 6 || !!busy} onClick={() => void join(code)}>Join</button>
        </div>
        {!ready && <small className="muted">Enter a name to host or join.</small>}
        {busy && <div className="muted">{busy}</div>}
        {problem && <div className="bad">{problem}</div>}
      </div>
      <div className="panel col">
        <h3 style={{ margin: 0 }}>Open games</h3>
        {open.length === 0 ? <div className="muted">No open games right now. Host one and send your friends the link.</div> : (
          <table>
            <thead><tr><th>Game</th><th>Galaxy</th><th>Empires</th><th>People</th><th /></tr></thead>
            <tbody>
              {open.map((r) => {
                const meta = r.meta as RoomMeta | null;
                const same = meta?.version === VERSION;
                return (
                  <tr key={r.id}>
                    <td>{r.name} <small className="muted">{r.id}</small></td>
                    <td>{meta ? words(meta.galaxy) : "?"}</td>
                    <td>{meta?.empires ?? "?"}</td>
                    <td>{r.players}</td>
                    <td>
                      <button className="small" disabled={!ready || !same || !!busy} onClick={() => void join(r.id)}
                        title={same ? "Join this room and pick an empire" : `This game runs StarLord v${meta?.version ?? "?"}; you have v${VERSION}`}>
                        {same ? "Join" : `v${meta?.version ?? "?"}`}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** The room before the game starts: who plays which empire, the invite link, and (for the host) Start. */
function RoomLobby({ game, notes, onLeave }: { game: OnlineGame; notes: string[]; onLeave: () => void }) {
  useOnline(game);
  const room = game.room!;
  const options = room.options;
  const races = options.races ?? [];
  const [copied, setCopied] = useState(false);
  const mine = useMemo(() => customRaceDefs(loadCustomRaces()), []);
  // Custom races of other players are made known to the rules so their names show.
  useMemo(() => { for (const spec of options.customRaces ?? []) buildCustomRace(spec); }, [JSON.stringify(options.customRaces ?? [])]);
  const online = new Set(game.status?.online ?? []);
  const mySeat = game.seat;
  const people = Object.keys(room.seats).length;
  const link = inviteLink(game.roomCode!);
  const customOk = DIFFICULTIES[options.difficulty ?? "average"].customRaces;
  const takenByPeople = new Set(Object.keys(room.seats).map((s) => races[Number(s)]));

  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const pickRace = (seat: number, raceId: string) => {
    const custom = mine.find((c) => c.def.id === raceId)?.spec as CustomRaceSpec | undefined;
    game.claim(seat, raceId, custom);
  };

  return (
    <div className="title-screen online-screen">
      <div className="row">
        <button onClick={onLeave}>← Leave room</button>
        <div className="logo">STARLORD</div>
        <div className="spacer" />
        <span className="muted">Room {game.roomCode}</span>
      </div>
      <div className="panel col">
        <h2 style={{ margin: 0 }}>Room {game.roomCode}</h2>
        <div className="row">
          <input type="text" readOnly value={link} style={{ flex: 1, minWidth: 200 }} onFocus={(e) => e.target.select()} />
          <button onClick={copy}>{copied ? "Copied" : "Copy invite link"}</button>
        </div>
        <small className="muted">Friends open the link (or enter code {game.roomCode} under Online game) and take an empire below.</small>
        <div className="muted">
          {words(options.galaxySize ?? "medium")} galaxy · {words(options.galaxyAge ?? "average")} age · {DIFFICULTIES[options.difficulty ?? "average"].name} difficulty
          (computer empires only) · {words(options.techLevel ?? "average")} tech
          {options.maxTurns ? ` · ${options.maxTurns} turn limit` : ""}
          {options.debug ? " · debug game: every player can use the debug menu's cheats (F9)" : ""}
          {[options.monsters !== false && "monsters", options.raiders !== false && "raiders", options.council !== false && "galactic council", options.randomEvents !== false && "random events"].filter(Boolean).map((t) => ` · ${t}`)}
        </div>
      </div>
      <div className="panel col">
        <h3 style={{ margin: 0 }}>Empires</h3>
        <table>
          <thead><tr><th>Race</th><th>Played by</th><th /></tr></thead>
          <tbody>
            {races.map((raceId, seat) => {
              const race = getRace(raceId);
              const holder = room.seats[seat];
              const isMine = seat === mySeat;
              return (
                <tr key={seat}>
                  <td>
                    <span className="dot" style={{ background: race.color, marginRight: 6 }} />
                    {isMine ? (
                      <select value={raceId} onChange={(e) => pickRace(seat, e.target.value)} title="Your race; an empire the computer plays with that race takes your old one">
                        {RACES.filter((r) => r.id === raceId || !takenByPeople.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        {customOk && mine.map((c) => <option key={c.def.id} value={c.def.id}>{c.def.name} (your race)</option>)}
                      </select>
                    ) : <b>{race.name}</b>} <small className="muted">{race.archetype}</small>
                  </td>
                  <td>
                    {holder ? (
                      <>
                        {holder.name}{isMine ? " (you)" : ""}{seat === 0 ? " · host" : ""}
                        {!online.has(seat) && <small className="muted"> · away</small>}
                      </>
                    ) : <span className="muted">Computer</span>}
                  </td>
                  <td>
                    {!holder && <button className="small" onClick={() => game.claim(seat)}>{mySeat === null ? "Play this empire" : "Switch to this empire"}</button>}
                    {isMine && !game.isHost && <button className="small" onClick={() => game.release()} title="The computer plays it; you watch the game">Leave to the computer</button>}
                    {game.isHost && holder && !isMine && !online.has(seat) && (
                      <button className="small" onClick={() => game.freeSeat(seat)} title="This player left the room; give the empire back to the computer">Free</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <small className="muted">
          {game.people.length} {game.people.length === 1 ? "person" : "people"} in the room. Empires nobody takes are played by the computer; people without an empire watch the game.
        </small>
      </div>
      <div className="panel col">
        <label className="row" title="When the timer runs out, a player's turn ends with the orders they gave so far (a council vote still waits for them). The computer plays the empires of people who are away.">
          Turn timer
          {game.isHost ? (
            <select value={room.timer ?? 0} onChange={(e) => game.setTimer(Number(e.target.value))}>
              {TIMER_CHOICES.map((t) => <option key={t} value={t}>{t === 0 ? "None" : `${t / 60} minute${t === 60 ? "" : "s"}`}</option>)}
            </select>
          ) : <b>{room.timer ? `${room.timer / 60} minute${room.timer === 60 ? "" : "s"}` : "None"}</b>}
          <small className="muted">{room.timer ? "per turn, then the turn ends with the orders given so far" : "every turn waits until everyone has ended theirs"}</small>
        </label>
        {game.isHost ? (
          <div className="row">
            <button className="primary" onClick={() => game.start()}>
              Start the game: {people} {people === 1 ? "person" : "people"}, {races.length - people} computer empire{races.length - people === 1 ? "" : "s"}
            </button>
            <small className="muted">Nobody can take an empire after the start; anyone can still watch.</small>
          </div>
        ) : <div className="muted">Waiting for the host to start the game…</div>}
        {game.error && <div className="bad">{game.error}</div>}
        {notes.map((n, i) => <div key={i} className="muted">{n}</div>)}
      </div>
      <div className="panel col">
        <h3 style={{ margin: 0 }}>Chat</h3>
        <ChatPanel game={game} />
      </div>
    </div>
  );
}
