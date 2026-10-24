import { useEffect, useState } from "react";
import { useGame } from "../ui/hooks";
import { inviteLink } from "./OnlineScreen";

/**
 * The online game's strip under the top bar: who is still giving orders, who is away, and (once our
 * orders are in) a way to take them back. The host can let the computer play an absent person's empire.
 */
export function OnlineBar() {
  const { session, view } = useGame();
  const game = session.online!;
  const [notes, setNotes] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    game.onNotice = (text) => {
      const id = Date.now() + Math.random();
      setNotes((n) => [...n.slice(-2), { id, text }]);
      setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 12000);
    };
    return () => { game.onNotice = undefined; };
  }, [game]);

  const status = game.status?.turn === view.turn ? game.status : null;
  const seats = game.humanSeats.filter((s) => view.players[s]?.alive);
  const name = (s: number) => game.room?.seats[s]?.name ?? view.players[s]?.name ?? "?";
  const online = new Set(status?.online ?? []);
  const standIn = new Set(status?.standIn ?? []);
  const done = new Set(status?.done ?? []);
  const resolving = status?.phase === "resolve";
  const waitingFor = seats.filter((s) => !done.has(s) && (resolving ? online.has(s) && !standIn.has(s) : !standIn.has(s)));

  const state = (s: number): { label: string; cls: string; tip: string } => {
    if (standIn.has(s)) return { label: "computer", cls: "warn", tip: "Away: the computer plays this empire (everything but diplomacy) until they come back" };
    if (!online.has(s)) return { label: "away", cls: "bad", tip: "Not connected. The turn waits for them; they get their empire back by opening the room link again." };
    if (done.has(s)) return { label: resolving ? "done" : "ready", cls: "good", tip: resolving ? "Answered this turn's questions" : "Ended the turn" };
    return { label: resolving ? "deciding" : "thinking", cls: "", tip: resolving ? "Picking targets or commanding a battle" : "Still giving orders" };
  };

  return (
    <div className="online-bar">
      <span className="chip" title={`Online game. Invite link: ${inviteLink(game.roomCode ?? "")}`}>Online · room {game.roomCode}{game.isHost ? " · you host" : ""}</span>
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
            ? waitingFor.length > 0 ? `Orders are in. Waiting for ${waitingFor.map(name).join(", ")} to decide their battles…` : "Running the turn…"
            : `Your orders are in. Waiting for ${waitingFor.map(name).join(", ") || "the host"}…`}
          {!resolving && <button className="small" onClick={() => game.withdraw()} title="Take your orders back to change them; end the turn again when done">Change my orders</button>}
        </span>
      )}
      {game.error && <span className="bad">{game.error} <button className="small" onClick={() => window.location.reload()}>Reload</button></span>}
      {notes.map((n) => <span key={n.id} className="chip warn">{n.text}</span>)}
    </div>
  );
}
