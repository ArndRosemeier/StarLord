import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGame } from "../ui/hooks";
import { inviteLink } from "./OnlineScreen";
import type { OnlineGame } from "../net/online";

const ASK_WORDS = { target: "picking a target", battle: "commanding a battle", orbital: "deciding what to do from orbit" } as const;

/** "1:05": minutes and seconds left. */
function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Re-renders every second while `on`, for countdowns. */
function useTick(on: boolean): void {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setT((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [on]);
}

/**
 * The online game's strip under the top bar: who is still giving orders, who is away, the turn timer,
 * the chat, and (once our orders are in) a way to take them back. The host can let the computer play
 * an absent person's empire.
 */
export function OnlineBar() {
  const { session, view } = useGame();
  const game = session.online!;
  const [notes, setNotes] = useState<{ id: number; text: string }[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    game.onNotice = (text) => {
      const id = Date.now() + Math.random();
      setNotes((n) => [...n.slice(-2), { id, text }]);
      setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 12000);
    };
    return () => { game.onNotice = undefined; };
  }, [game]);

  const status = game.status?.turn === view.turn ? game.status : null;
  useTick(game.deadline !== null);
  const seats = game.humanSeats.filter((s) => view.players[s]?.alive);
  const name = (s: number) => game.room?.seats[s]?.name ?? view.players[s]?.name ?? "?";
  const online = new Set(status?.online ?? []);
  const standIn = new Set(status?.standIn ?? []);
  const done = new Set(status?.done ?? []);
  const resolving = status?.phase === "resolve";
  const ask = resolving ? status?.ask : undefined;
  const waitingFor = resolving ? (ask?.seats ?? []).filter((s) => !done.has(s)) : seats.filter((s) => !done.has(s) && !standIn.has(s));

  const state = (s: number): { label: string; cls: string; tip: string } => {
    if (standIn.has(s)) return { label: "computer", cls: "warn", tip: "Away: the computer plays this empire (everything but diplomacy) until they come back" };
    if (!online.has(s)) return { label: "away", cls: "bad", tip: "Not connected. The turn waits for them; they get their empire back by opening the room link again." };
    if (resolving) {
      if (ask?.seats.includes(s) && !done.has(s)) return { label: ask.kind === "battle" ? "in battle" : "deciding", cls: "", tip: `Busy ${ASK_WORDS[ask.kind]}` };
      return { label: "ready", cls: "good", tip: "Waiting for the turn to run" };
    }
    if (done.has(s)) return { label: "ready", cls: "good", tip: "Ended the turn" };
    return { label: "thinking", cls: "", tip: "Still giving orders" };
  };
  const left = game.deadline !== null && !resolving ? game.deadline - Date.now() : null;

  return (
    <div className="online-bar">
      <span className="chip" title={`Online game. Invite link: ${inviteLink(game.roomCode ?? "")}`}>Online · room {game.roomCode}{game.isHost ? " · you host" : ""}</span>
      {left !== null && (
        <span className={`chip ${left < 30000 ? "bad" : left < 60000 ? "warn" : ""}`}
          title="Turn timer: when it runs out, your turn ends with the orders you gave so far (a council vote still waits for you). The computer plays the empires of people who are away.">
          ⏱ {clock(left)}
        </span>
      )}
      {seats.map((s) => {
        const st = state(s);
        return (
          <span key={s} className={`chip ${st.cls}`} title={st.tip}>
            <span className="dot" style={{ background: view.players[s]?.color }} />
            {name(s)}{s === session.me ? " (you)" : ""}: {st.label}
            {game.isHost && !online.has(s) && (
              <button className="small" onClick={() => game.setStandIn(s, !standIn.has(s))}
                title={standIn.has(s) ? "Wait for them again" : "The computer plays their empire, except diplomacy, until they come back, so the game goes on"}>
                {standIn.has(s) ? "Wait for them" : "Let the computer play"}
              </button>
            )}
          </span>
        );
      })}
      {game.waiting && (
        <span className="muted online-wait">
          {resolving
            ? waitingFor.length > 0 ? `Orders are in. Waiting for ${waitingFor.map(name).join(" and ")}: ${ask ? ASK_WORDS[ask.kind] : "deciding"}…` : "Running the turn…"
            : `Your orders are in. Waiting for ${waitingFor.map(name).join(", ") || "the host"}…`}
          {!resolving && <button className="small" onClick={() => game.withdraw()} title="Take your orders back to change them; end the turn again when done">Change my orders</button>}
        </span>
      )}
      {game.error && <span className="bad">{game.error} <button className="small" onClick={() => window.location.reload()}>Reload</button></span>}
      {notes.map((n) => <span key={n.id} className="chip warn">{n.text}</span>)}
      <span className="spacer" />
      <ChatButton game={game} open={chatOpen} onToggle={() => setChatOpen(!chatOpen)} />
      {chatOpen && <ChatPanel game={game} onClose={() => setChatOpen(false)} floating />}
    </div>
  );
}

function useOnlineGame(game: OnlineGame): void {
  useSyncExternalStore((fn) => game.subscribe(fn), () => game.version);
}

/** Opens the chat; shows how many lines came in since it was last open. */
export function ChatButton({ game, open, onToggle }: { game: OnlineGame; open: boolean; onToggle: () => void }) {
  useOnlineGame(game);
  const seen = useRef(game.chat.length);
  if (open) seen.current = game.chat.length;
  const unread = game.chat.length - seen.current;
  return (
    <button className={`small${unread > 0 ? " primary" : ""}`} onClick={onToggle} title="Talk to everyone in the room">
      Chat{unread > 0 ? ` (${unread})` : ""}
    </button>
  );
}

/** The room's chat: everyone in the room (players and watchers) reads it. */
export function ChatPanel({ game, onClose, floating }: { game: OnlineGame; onClose?: () => void; floating?: boolean }) {
  useOnlineGame(game);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
  }, [game.chat.length]);
  const send = () => {
    game.say(text);
    setText("");
  };
  return (
    <div className={`chat-panel${floating ? " floating" : ""}`}>
      {onClose && <div className="row"><b>Chat</b><span className="spacer" /><button className="small" onClick={onClose}>Close</button></div>}
      <div className="chat-lines" ref={list}>
        {game.chat.length === 0 && <div className="muted">Nothing said yet. Everyone in the room reads this, players and watchers alike.</div>}
        {game.chat.map((l, i) => <div key={i}><b>{l.name}:</b> {l.text}</div>)}
      </div>
      <div className="row">
        <input type="text" value={text} maxLength={300} placeholder="Say something…" style={{ flex: 1 }}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") send(); }} />
        <button className="small" disabled={!text.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
}
