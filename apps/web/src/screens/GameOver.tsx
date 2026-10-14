import { useEffect, useMemo, useState } from "react";
import { empires, getRace, scoreBreakdown } from "@starlord/sim";
import { useGame } from "../ui/hooks";
import { fmt, signed, words } from "../ui/format";
import { Celebration } from "../ui/fx";
import { Tip } from "../ui/Tip";
import { scoreParts, scoreTip } from "../ui/explain";
import { enterHallOfFame, hallEntryFor } from "../game/hallOfFame";
import { HallOfFame } from "./HallOfFame";
import { webglAvailable } from "../three/webgl";
import { EndFilm } from "../ending/EndFilm";
import { endingFor } from "../ending/endings";

const HOW: Record<string, string> = {
  conquest: "by conquest",
  council: "by vote of the galactic council",
  raiders: "after destroying the Vexari in their own dimension, and every other empire capitulated",
  score: "on score when time ran out",
};

/**
 * Shown once when the game ends, or when the player's own empire falls while
 * others play on: a 3D end sequence for the way the game ended (skippable),
 * then the victory or defeat card with every empire's final score over it.
 */
export function GameOver({ won, spectating, fallen = false, onClose, onQuit }: { won: boolean; spectating: boolean; fallen?: boolean; onClose: () => void; onQuit: () => void }) {
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
  const ending = useMemo(() => endingFor(state, me), [state, me]);
  const [film, setFilm] = useState(() => ending !== null && webglAvailable());
  const [playing, setPlaying] = useState(film);
  // Any click or key during the sequence skips to the card.
  useEffect(() => {
    if (!playing) return;
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && ["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      setPlaying(false);
    };
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [playing]);
  useEffect(() => {
    if (me === null) return;
    const entry = hallEntryFor(state, me, new Date());
    if (!entry) return;
    const { place } = enterHallOfFame(entry);
    setHall({ id: entry.id, place });
  }, [state, me]);

  return (
    <div className={`game-over ${bright ? "won" : "lost"} ${film ? "film" : ""} ${playing ? "playing" : ""}`}
      style={film ? undefined : { backgroundImage: `url(art/${bright ? "victory" : "defeat"}.webp)` }}
      onClick={playing ? () => setPlaying(false) : undefined}>
      {film && ending ? (
        <EndFilm ending={ending} playing={playing} onFinished={() => setPlaying(false)} onFailed={() => { setFilm(false); setPlaying(false); }} />
      ) : (
        <Celebration mood={bright ? "victory" : "defeat"} />
      )}
      {playing && <button className="end-skip" onClick={(e) => { e.stopPropagation(); setPlaying(false); }}>Skip</button>}
      {!playing && <div className="card game-over-card">
        <h1>{fallen ? "Defeat" : spectating ? "Game over" : won ? "Victory" : "Defeat"}</h1>
        {ending && <div className="end-kind">{ending.text.title}</div>}
        <div style={{ fontSize: 18, textShadow: "0 2px 8px #000" }}>
          {ending ? ending.text.lines.map((l, i) => <div key={i}>{l}</div>)
            : winner ? <>The {winner.name} rule the galaxy {how}, turn {view.turn - 1}.</> : <>The game has ended on turn {view.turn - 1}.</>}
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
                  <td>{p.id === state.winner ? <span className="good">Winner</span> : p.alive ? "Survived" : <span className="muted">{p.surrenderedTo !== undefined ? `Surrendered to the ${state.players[p.surrenderedTo]?.name ?? "?"}` : "Eliminated"}{p.eliminatedTurn !== null ? `, turn ${p.eliminatedTurn}` : ""}</span>}</td>
                  <td className="num"><Tip card={scoreTip(b)}><span className="explained">{fmt(b.total)}</span></Tip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button onClick={onClose}>{fallen ? "Watch on" : "Look around"}</button>
          <button onClick={() => setShowHall(true)}>Hall of Fame</button>
          <button className="primary" onClick={onQuit}>Back to title</button>
        </div>
      </div>}
      {showHall && <HallOfFame onClose={() => setShowHall(false)} highlight={hall?.id} />}
    </div>
  );
}
