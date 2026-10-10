import { useGame } from "../ui/hooks";
import { words } from "../ui/format";
import { Celebration } from "../ui/fx";

const HOW: Record<string, string> = {
  conquest: "by conquest",
  council: "by vote of the galactic council",
  raiders: "by destroying the raiders' stronghold",
  score: "on score when time ran out",
};

/** Full-screen victory or defeat card shown once when the game ends. */
export function GameOver({ won, spectating, onClose, onQuit }: { won: boolean; spectating: boolean; onClose: () => void; onQuit: () => void }) {
  const { view } = useGame();
  const winner = view.winner !== null ? view.players[view.winner] : undefined;
  const how = view.victory ? HOW[view.victory] ?? words(view.victory) : "";
  const bright = won || spectating;
  return (
    <div className={`game-over ${bright ? "won" : "lost"}`} style={{ backgroundImage: `url(art/${bright ? "victory" : "defeat"}.webp)` }}>
      <Celebration mood={bright ? "victory" : "defeat"} />
      <div className="card">
        <h1>{spectating ? "Game over" : won ? "Victory" : "Defeat"}</h1>
        <div style={{ fontSize: 18, textShadow: "0 2px 8px #000" }}>
          {winner ? <>The {winner.name} rule the galaxy {how}, turn {view.turn}.</> : <>The game has ended on turn {view.turn}.</>}
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button onClick={onClose}>Look around</button>
          <button className="primary" onClick={onQuit}>Back to title</button>
        </div>
      </div>
    </div>
  );
}
