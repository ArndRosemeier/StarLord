import { useEffect, useMemo, useState } from "react";
import { empires, getRace, scoreBreakdown } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, signed, words } from "../ui/format";
import { Celebration } from "../ui/fx";
import { Tip } from "../ui/Tip";
import { scoreParts, scoreTip } from "../ui/explain";
import { enterHallOfFame, hallEntryFor } from "../game/hallOfFame";
import { HallOfFame } from "./HallOfFame";

const HOW: Record<string, string> = {
  conquest: "by conquest",
  council: "by vote of the galactic council",
  raiders: "after destroying the Vexari in their own dimension, and every other empire capitulated",
  score: "on score when time ran out",
};

/** Full-screen victory or defeat card shown once when the game ends, with every empire's final score. */
export function GameOver({ won, spectating, onClose, onQuit }: { won: boolean; spectating: boolean; onClose: () => void; onQuit: () => void }) {
  const { session, view } = useGame();
  // The game is over: the final tally shows every empire, not just the ones the player met.
  const state = session.state;
  const winner = view.winner !== null ? view.players[view.winner] : undefined;
  const how = view.victory ? HOW[view.victory] ?? words(view.victory) : "";
  const bright = won || spectating;
  const me = session.me;
  const ranking = useMemo(
    () => empires(state).map((p) => ({ p, b: scoreBreakdown(state, p.id) })).sort((x, y) => y.b.total - x.b.total || x.p.id - y.p.id),
    [state],
  );
  const mine = me !== null ? ranking.find((r) => r.p.id === me) : undefined;
  const [hall, setHall] = useState<{ id: string; place: number | null } | null>(null);
  const [showHall, setShowHall] = useState(false);
  useEffect(() => {
    if (me === null) return;
    const entry = hallEntryFor(state, me, new Date());
    if (!entry) return;
    const { place } = enterHallOfFame(entry);
    setHall({ id: entry.id, place });
  }, [state, me]);

  return (
    <div className={`game-over ${bright ? "won" : "lost"}`} style={{ backgroundImage: `url(art/${bright ? "victory" : "defeat"}.webp)` }}>
      <Celebration mood={bright ? "victory" : "defeat"} />
      <div className="card game-over-card">
        <h1>{spectating ? "Game over" : won ? "Victory" : "Defeat"}</h1>
        <div style={{ fontSize: 18, textShadow: "0 2px 8px #000" }}>
          {winner ? <>The {winner.name} rule the galaxy {how}, turn {view.turn}.</> : <>The game has ended on turn {view.turn}.</>}
        </div>
        {mine && (
          <div className="panel final-score">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>Your final score</b>
              <Tip card={scoreTip(mine.b)}><span className="score-big explained">{fmt(mine.b.total)}</span></Tip>
            </div>
            <table className="score-table">
              <tbody>
                {scoreParts(mine.b).map((x) => (
                  <tr key={x.label}><td>{x.label}</td><td className="muted"><small>{x.why}</small></td><td className="num">{signed(x.value)}</td></tr>
                ))}
                <tr><td>Subtotal</td><td /><td className="num">{fmt(mine.b.subtotal)}</td></tr>
                <tr><td>Race pick bonus</td><td className="muted"><small>{mine.b.counts.unspentPicks} unspent picks</small></td><td className="num">×{mine.b.multiplier / 100}</td></tr>
              </tbody>
            </table>
            {hall && (
              <div className={hall.place !== null ? "good" : "muted"}>
                {hall.place !== null ? `Entered the Hall of Fame in place ${hall.place + 1}.` : "Not enough for the Hall of Fame this time."}
              </div>
            )}
            {state.settings.debug && <small className="muted">Games started with the debug menu do not enter the Hall of Fame.</small>}
          </div>
        )}
        <div className="panel final-ranking">
          <b>Final standings</b>
          <table className="score-table">
            <thead><tr><th>#</th><th>Empire</th><th>Fate</th><th className="num">Score</th></tr></thead>
            <tbody>
              {ranking.map(({ p, b }, i) => (
                <tr key={p.id} className={p.id === me ? "mine" : ""}>
                  <td>{i + 1}</td>
                  <td><span className="dot" style={{ background: p.color, marginRight: 6 }} />{p.name} <small className="muted">{getRace(p.raceId).plural}</small></td>
                  <td>{p.id === state.winner ? <span className="good">Winner</span> : p.alive ? "Survived" : <span className="muted">Eliminated{p.eliminatedTurn !== null ? `, turn ${p.eliminatedTurn}` : ""}</span>}</td>
                  <td className="num"><Tip card={scoreTip(b)}><span className="explained">{fmt(b.total)}</span></Tip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button onClick={onClose}>Look around</button>
          <button onClick={() => setShowHall(true)}>Hall of Fame</button>
          <button className="primary" onClick={onQuit}>Back to title</button>
        </div>
      </div>
      {showHall && <HallOfFame onClose={() => setShowHall(false)} highlight={hall?.id} />}
    </div>
  );
}
