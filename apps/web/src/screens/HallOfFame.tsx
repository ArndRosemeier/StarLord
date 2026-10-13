import { useEffect, useState } from "react";
import { HALL_OF_FAME_SIZE, SCORE } from "@starlord/sim";
import { loadHallOfFame, rankEntries, type HallEntry } from "../game/hallOfFame";
import { fmt, words } from "../ui/format";

const ENDING: Record<string, string> = {
  conquest: "conquest", council: "council vote", raiders: "raiders destroyed", score: "turn limit",
};

/** How an entry's game ended, for its row. */
export function endingText(e: Pick<HallEntry, "won" | "victory">): string {
  const how = e.victory ? ENDING[e.victory] ?? words(e.victory) : "";
  return e.won ? `Won: ${how}` : how ? `Lost (${how})` : "Lost";
}

/** The best final scores of past games in this browser. `highlight` marks a fresh entry. */
export function HallOfFame({ onClose, highlight }: { onClose: () => void; highlight?: string }) {
  const [list] = useState(() => rankEntries(loadHallOfFame()));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal hall-of-fame" role="dialog" aria-label="Hall of Fame" onClick={(e) => e.stopPropagation()}>
        <div className="whats-new-head">
          <h2>Hall of Fame</h2>
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>
        <p className="muted">
          The {HALL_OF_FAME_SIZE} best final scores of games played in this browser. Quick wins score best: every turn costs{" "}
          {SCORE.perTurn} point, and the biggest bonus ({SCORE.antares}) is for destroying the raiders at home.
        </p>
        {list.length === 0 ? (
          <p>No finished games yet. Win one and your name goes here.</p>
        ) : (
          <div className="table-scroll">
            <table className="hall-table">
              <thead>
                <tr><th>#</th><th>Emperor</th><th>Score</th><th>Ending</th><th>Turn</th><th>Difficulty</th><th>Galaxy</th><th>Date</th></tr>
              </thead>
              <tbody>
                {list.map((e, i) => (
                  <tr key={e.id} className={e.id === highlight ? "hall-new" : ""}>
                    <td>{i + 1}</td>
                    <td><b>{e.empire}</b> <small className="muted">{e.race}</small></td>
                    <td className="num"><b>{fmt(e.score)}</b></td>
                    <td className={e.won ? "good" : "muted"}>{endingText(e)}</td>
                    <td className="num">{e.turn}</td>
                    <td>{words(e.difficulty)}</td>
                    <td>{words(e.galaxySize)}</td>
                    <td><small>{new Date(e.date).toLocaleDateString()}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
